package history

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/restmapper"
)

func TestTimelineName(t *testing.T) {
	for _, ref := range []Ref{{Group: "apps", Resource: "deployments", Name: "web"}, {Resource: "configmaps", Name: "kube-root-ca.crt"}, {Group: "sankofa.kuberoot.dev", Resource: "cards", Name: "equiano"}} {
		r, g, n, err := ParseName(TimelineName(ref))
		if err != nil || r != ref.Resource || g != ref.Group || n != ref.Name {
			t.Fatalf("%v -> %s %s %s %v", ref, r, g, n, err)
		}
	}
	if _, _, _, err := ParseName("web"); err == nil {
		t.Fatal("bare name must fail")
	}
}

// kubectl resolves a resource through its Kind before choosing its scope.
// Sharing a Kind across cluster and namespace resources silently redirects
// namespaced requests to the cluster resource, even with an explicit -n.
func TestDiscoveryPreservesTimelineScope(t *testing.T) {
	w := httptest.NewRecorder()
	(&API{}).resources(w, httptest.NewRequest("GET", "/apis/"+Group+"/"+Version, nil))
	var resources metav1.APIResourceList
	if err := json.Unmarshal(w.Body.Bytes(), &resources); err != nil {
		t.Fatal(err)
	}
	mapper := restmapper.NewDiscoveryRESTMapper([]*restmapper.APIGroupResources{{
		Group:              metav1.APIGroup{Name: Group, Versions: []metav1.GroupVersionForDiscovery{groupVersion()}, PreferredVersion: groupVersion()},
		VersionedResources: map[string][]metav1.APIResource{Version: resources.APIResources},
	}})
	for _, tc := range []struct {
		resource, kind string
		scope          meta.RESTScopeName
	}{
		{"timelines", "Timeline", meta.RESTScopeNameNamespace},
		{"clustertimelines", "ClusterTimeline", meta.RESTScopeNameRoot},
	} {
		gvk, err := mapper.KindFor(schema.GroupVersionResource{Group: Group, Version: Version, Resource: tc.resource})
		if err != nil {
			t.Fatal(err)
		}
		mapping, err := mapper.RESTMapping(gvk.GroupKind(), Version)
		if err != nil {
			t.Fatal(err)
		}
		if gvk.Kind != tc.kind || mapping.Resource.Resource != tc.resource || mapping.Scope.Name() != tc.scope {
			t.Fatalf("%s resolved to %s, %s, %s", tc.resource, gvk.Kind, mapping.Resource.Resource, mapping.Scope.Name())
		}
	}
}

func TestTimelineKindMatchesScope(t *testing.T) {
	for _, tc := range []struct{ ns, kind string }{{"test", "Timeline"}, {"", "ClusterTimeline"}} {
		tl := toTimeline(Ref{Resource: "configmaps", Namespace: tc.ns, Name: "test"}, []Record{{Kind: "ConfigMap", Verb: Born}})
		if tl.TypeMeta.Kind != tc.kind {
			t.Fatalf("namespace %q has kind %q", tc.ns, tl.TypeMeta.Kind)
		}
	}
}
