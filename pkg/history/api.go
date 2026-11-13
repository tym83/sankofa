package history

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	authzv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Group is the aggregated API group that exposes the memory.
const (
	Group   = "history.sankofa.kuberoot.dev"
	Version = "v1alpha1"
)

// Moment is one record in a timeline, without the object body.
type Moment struct {
	Verb            string    `json:"verb"`
	At              time.Time `json:"at"`
	Manager         string    `json:"manager,omitempty"`
	ResourceVersion string    `json:"resourceVersion,omitempty"`
	UID             string    `json:"uid"`
}

// Timeline is the life story of one object.
type Timeline struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata"`
	Target            Ref      `json:"target"`
	Kind              string   `json:"targetKind,omitempty"`
	Story             string   `json:"story"`
	Moments           []Moment `json:"moments"`
	// Object is the state at ?at=<RFC3339> or the last known state.
	Object json.RawMessage `json:"object,omitempty"`
}

// TimelineList is a list of timelines: obituaries when listed.
type TimelineList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata"`
	Items           []Timeline `json:"items"`
}

// ParseName splits a timeline name "<resource>.<group>:<name>"; the core
// group is written "core", e.g. "configmaps.core:settings". Object names never
// contain a colon, so the split is unambiguous.
func ParseName(s string) (resource, group, name string, err error) {
	rg, name, ok := strings.Cut(s, ":")
	resource, group, ok2 := strings.Cut(rg, ".")
	if !ok || !ok2 || resource == "" || group == "" || name == "" {
		return "", "", "", fmt.Errorf("timeline name must be <resource>.<group>:<name>, e.g. deployments.apps:web or configmaps.core:settings")
	}
	if group == "core" {
		group = ""
	}
	return resource, group, name, nil
}

// TimelineName is the inverse of ParseName.
func TimelineName(r Ref) string {
	g := r.Group
	if g == "" {
		g = "core"
	}
	return r.Resource + "." + g + ":" + r.Name
}

// Authenticator checks the front-proxy client certificate of the aggregator
// and returns the user the request is made for.
type Authenticator struct {
	CA           *x509.CertPool
	AllowedNames []string
	UserHeaders  []string
	GroupHeaders []string
}

// User returns the requesting user and groups, or an error if the request did
// not come through the aggregator.
func (a *Authenticator) User(r *http.Request) (string, []string, error) {
	if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
		return "", nil, fmt.Errorf("no client certificate")
	}
	leaf := r.TLS.PeerCertificates[0]
	inter := x509.NewCertPool()
	for _, c := range r.TLS.PeerCertificates[1:] {
		inter.AddCert(c)
	}
	if _, err := leaf.Verify(x509.VerifyOptions{Roots: a.CA, Intermediates: inter, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}}); err != nil {
		return "", nil, fmt.Errorf("client certificate: %w", err)
	}
	if len(a.AllowedNames) > 0 {
		ok := false
		for _, n := range a.AllowedNames {
			if n == leaf.Subject.CommonName {
				ok = true
			}
		}
		if !ok {
			return "", nil, fmt.Errorf("client %q is not an allowed front proxy", leaf.Subject.CommonName)
		}
	}
	var user string
	for _, h := range a.UserHeaders {
		if v := r.Header.Get(h); v != "" {
			user = v
			break
		}
	}
	if user == "" {
		return "", nil, fmt.Errorf("no user header")
	}
	var groups []string
	for _, h := range a.GroupHeaders {
		groups = append(groups, r.Header.Values(h)...)
	}
	return user, groups, nil
}

// API serves the history group for the aggregator.
type API struct {
	Store *Store
	Auth  *Authenticator
	Kube  kubernetes.Interface
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", ok)
	mux.HandleFunc("/readyz", ok)
	mux.HandleFunc("/livez", ok)
	mux.HandleFunc("/apis", a.groups)
	mux.HandleFunc("/apis/"+Group, a.group)
	mux.HandleFunc("/apis/"+Group+"/"+Version, a.resources)
	mux.HandleFunc("/apis/"+Group+"/"+Version+"/", a.serve)
	return mux
}

func ok(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) }

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func status(w http.ResponseWriter, code int, reason metav1.StatusReason, msg string) {
	writeJSON(w, code, metav1.Status{TypeMeta: metav1.TypeMeta{Kind: "Status", APIVersion: "v1"},
		Status: metav1.StatusFailure, Code: int32(code), Reason: reason, Message: msg})
}

func groupVersion() metav1.GroupVersionForDiscovery {
	return metav1.GroupVersionForDiscovery{GroupVersion: Group + "/" + Version, Version: Version}
}

func (a *API) groups(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, metav1.APIGroupList{TypeMeta: metav1.TypeMeta{Kind: "APIGroupList", APIVersion: "v1"},
		Groups: []metav1.APIGroup{{Name: Group, Versions: []metav1.GroupVersionForDiscovery{groupVersion()}, PreferredVersion: groupVersion()}}})
}

func (a *API) group(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, metav1.APIGroup{TypeMeta: metav1.TypeMeta{Kind: "APIGroup", APIVersion: "v1"},
		Name: Group, Versions: []metav1.GroupVersionForDiscovery{groupVersion()}, PreferredVersion: groupVersion()})
}

func (a *API) resources(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, metav1.APIResourceList{TypeMeta: metav1.TypeMeta{Kind: "APIResourceList", APIVersion: "v1"},
		GroupVersion: Group + "/" + Version,
		APIResources: []metav1.APIResource{
			{Name: "timelines", Namespaced: true, Kind: "Timeline", Verbs: []string{"get", "list"}, ShortNames: []string{"tl"}, Categories: []string{"sankofa"}},
			{Name: "clustertimelines", Namespaced: false, Kind: "ClusterTimeline", Verbs: []string{"get", "list"}, Categories: []string{"sankofa"}},
		}})
}

// serve handles
//
//	namespaces/{ns}/timelines[/{name}]
//	clustertimelines[/{name}]
func (a *API) serve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		status(w, 405, metav1.StatusReasonMethodNotAllowed, "the memory is read-only: restore with `sankofa fetch`")
		return
	}
	user, groups, err := a.Auth.User(r)
	if err != nil {
		status(w, 401, metav1.StatusReasonUnauthorized, err.Error())
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/apis/"+Group+"/"+Version+"/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	var ns, name string
	switch {
	case len(parts) >= 3 && parts[0] == "namespaces" && parts[2] == "timelines":
		ns = parts[1]
		if len(parts) == 4 {
			name = parts[3]
		}
	case parts[0] == "clustertimelines":
		if len(parts) == 2 {
			name = parts[1]
		}
	case parts[0] == "timelines" && len(parts) == 1:
		ns = metav1.NamespaceAll
	default:
		status(w, 404, metav1.StatusReasonNotFound, "not found")
		return
	}
	ctx := r.Context()
	if name == "" {
		a.list(ctx, w, r, user, groups, ns, parts[0] == "clustertimelines")
		return
	}
	res, grp, objName, err := ParseName(name)
	if err != nil {
		status(w, 400, metav1.StatusReasonBadRequest, err.Error())
		return
	}
	ref := Ref{Group: grp, Resource: res, Namespace: ns, Name: objName}
	if !a.allowed(ctx, user, groups, ref) {
		status(w, 403, metav1.StatusReasonForbidden, fmt.Sprintf("%s cannot get %s: the memory follows your RBAC", user, ref))
		return
	}
	life, err := a.Store.Life(ctx, ref)
	if err != nil {
		status(w, 500, metav1.StatusReasonInternalError, err.Error())
		return
	}
	if len(life) == 0 {
		status(w, 404, metav1.StatusReasonNotFound, fmt.Sprintf("no memory of %s", ref))
		return
	}
	tl := toTimeline(ref, life)
	if at := r.URL.Query().Get("at"); at != "" {
		t, err := time.Parse(time.RFC3339, at)
		if err != nil {
			status(w, 400, metav1.StatusReasonBadRequest, "at must be RFC3339")
			return
		}
		rec, found, err := a.Store.At(ctx, ref, t)
		if err != nil {
			status(w, 500, metav1.StatusReasonInternalError, err.Error())
			return
		}
		if !found {
			status(w, 404, metav1.StatusReasonNotFound, fmt.Sprintf("%s did not exist at %s", ref, at))
			return
		}
		tl.Object = rec.Object
	} else {
		tl.Object = life[len(life)-1].Object
	}
	writeJSON(w, 200, tl)
}

func (a *API) list(ctx context.Context, w http.ResponseWriter, r *http.Request, user string, groups []string, ns string, cluster bool) {
	limit := 100
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 1000 {
		limit = l
	}
	recs, err := a.Store.Obituaries(ctx, ns, limit)
	if err != nil {
		status(w, 500, metav1.StatusReasonInternalError, err.Error())
		return
	}
	kind := "TimelineList"
	if cluster {
		kind = "ClusterTimelineList"
	}
	out := TimelineList{TypeMeta: metav1.TypeMeta{Kind: kind, APIVersion: Group + "/" + Version}, Items: []Timeline{}}
	for _, rec := range recs {
		if cluster != (rec.Ref.Namespace == "") || !a.allowed(ctx, user, groups, rec.Ref) {
			continue
		}
		tl := toTimeline(rec.Ref, []Record{rec})
		out.Items = append(out.Items, tl)
	}
	writeJSON(w, 200, out)
}

func (a *API) allowed(ctx context.Context, user string, groups []string, ref Ref) bool {
	sar := &authzv1.SubjectAccessReview{Spec: authzv1.SubjectAccessReviewSpec{
		User: user, Groups: groups,
		ResourceAttributes: &authzv1.ResourceAttributes{Verb: "get", Group: ref.Group, Resource: ref.Resource, Namespace: ref.Namespace, Name: ref.Name},
	}}
	res, err := a.Kube.AuthorizationV1().SubjectAccessReviews().Create(ctx, sar, metav1.CreateOptions{})
	return err == nil && res.Status.Allowed
}

func toTimeline(ref Ref, life []Record) Timeline {
	kind := "Timeline"
	if ref.Namespace == "" {
		kind = "ClusterTimeline"
	}
	tl := Timeline{
		TypeMeta:   metav1.TypeMeta{Kind: kind, APIVersion: Group + "/" + Version},
		ObjectMeta: metav1.ObjectMeta{Name: TimelineName(ref), Namespace: ref.Namespace},
		Target:     ref,
	}
	for _, r := range life {
		tl.Moments = append(tl.Moments, Moment{Verb: r.Verb, At: r.At, Manager: r.Manager, ResourceVersion: r.Revision, UID: r.UID})
		tl.Kind = r.Kind
	}
	tl.CreationTimestamp = metav1.NewTime(life[0].At)
	tl.Story = Story(tl.Kind, ref, life)
	return tl
}

// Story tells the life of an object in one paragraph, the way a griot would.
func Story(kind string, ref Ref, life []Record) string {
	if len(life) == 0 {
		return ""
	}
	first := life[0]
	var b strings.Builder
	fmt.Fprintf(&b, "%s %s was born %s", kind, ref.Name, first.At.Format("2 January 2006 at 15:04 UTC"))
	if first.Manager != "" {
		fmt.Fprintf(&b, ", brought by %s", first.Manager)
	}
	b.WriteString(".")
	changes, lives := 0, 1
	managers := map[string]bool{}
	for i, r := range life {
		if r.Verb == Changed {
			changes++
		}
		if r.Verb == Born && i > 0 {
			lives++
		}
		if r.Manager != "" {
			managers[r.Manager] = true
		}
	}
	if changes > 0 {
		fmt.Fprintf(&b, " It changed %d times", changes)
		if len(managers) > 1 {
			var ms []string
			for m := range managers {
				ms = append(ms, m)
			}
			fmt.Fprintf(&b, ", touched by %s", strings.Join(sortedStrings(ms), ", "))
		}
		b.WriteString(".")
	}
	if lives > 1 {
		fmt.Fprintf(&b, " It lived %d lives under this name.", lives)
	}
	last := life[len(life)-1]
	if last.Verb == Died {
		fmt.Fprintf(&b, " It died %s. Sankofa: it can be fetched back.", last.At.Format("2 January 2006 at 15:04 UTC"))
	} else {
		b.WriteString(" It is alive.")
	}
	return b.String()
}

func sortedStrings(s []string) []string {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
	return s
}
