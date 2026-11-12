package history

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"
)

// Skipped resources are noise, not memory: heartbeats, events and endpoints
// change constantly and are derived from other objects.
var Skipped = map[schema.GroupResource]bool{
	{Group: "", Resource: "events"}:                                       true,
	{Group: "events.k8s.io", Resource: "events"}:                          true,
	{Group: "coordination.k8s.io", Resource: "leases"}:                    true,
	{Group: "", Resource: "endpoints"}:                                    true,
	{Group: "discovery.k8s.io", Resource: "endpointslices"}:               true,
	{Group: "metrics.k8s.io", Resource: "pods"}:                           true,
	{Group: "metrics.k8s.io", Resource: "nodes"}:                          true,
	{Group: "", Resource: "componentstatuses"}:                            true,
	{Group: "history.sankofa.kuberoot.dev", Resource: "timelines"}:        true,
	{Group: "history.sankofa.kuberoot.dev", Resource: "clustertimelines"}: true,
}

// Recorder watches every resource and writes their lives into the store.
type Recorder struct {
	Store     *Store
	Discovery discovery.DiscoveryInterface
	Dynamic   dynamic.Interface
	Log       *slog.Logger

	mu      sync.Mutex
	started map[schema.GroupVersionResource]bool
}

// Run records until ctx is done, rediscovering resources (new CRDs) every
// interval.
func (r *Recorder) Run(ctx context.Context, interval time.Duration) error {
	r.started = map[schema.GroupVersionResource]bool{}
	factory := dynamicinformer.NewDynamicSharedInformerFactory(r.Dynamic, 0)
	for {
		if err := r.discover(ctx, factory); err != nil {
			r.Log.Warn("discovery", "err", err)
		}
		factory.Start(ctx.Done())
		select {
		case <-ctx.Done():
			factory.Shutdown()
			return nil
		case <-time.After(interval):
		}
	}
}

func (r *Recorder) discover(ctx context.Context, f dynamicinformer.DynamicSharedInformerFactory) error {
	lists, err := r.Discovery.ServerPreferredResources()
	if err != nil && len(lists) == 0 {
		return err
	}
	for _, l := range lists {
		gv, perr := schema.ParseGroupVersion(l.GroupVersion)
		if perr != nil {
			continue
		}
		for _, res := range l.APIResources {
			gvr := gv.WithResource(res.Name)
			if Skipped[gvr.GroupResource()] || !hasVerbs(res, "list", "watch") || containsSlash(res.Name) {
				continue
			}
			r.mu.Lock()
			seen := r.started[gvr]
			r.started[gvr] = true
			r.mu.Unlock()
			if seen {
				continue
			}
			inf := f.ForResource(gvr).Informer()
			gr := gvr.GroupResource()
			_, _ = inf.AddEventHandler(cache.ResourceEventHandlerFuncs{
				AddFunc:    func(o any) { r.observe(ctx, gr, o, false) },
				UpdateFunc: func(_, o any) { r.observe(ctx, gr, o, false) },
				DeleteFunc: func(o any) { r.observe(ctx, gr, o, true) },
			})
			r.Log.Debug("watching", "resource", gvr.String())
		}
	}
	return nil
}

func hasVerbs(r metav1.APIResource, verbs ...string) bool {
	for _, v := range verbs {
		found := false
		for _, rv := range r.Verbs {
			if rv == v {
				found = true
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func containsSlash(s string) bool {
	for _, c := range s {
		if c == '/' {
			return true
		}
	}
	return false
}

func (r *Recorder) observe(ctx context.Context, gr schema.GroupResource, o any, deleted bool) {
	if d, ok := o.(cache.DeletedFinalStateUnknown); ok {
		o = d.Obj
	}
	u, ok := o.(*unstructured.Unstructured)
	if !ok {
		return
	}
	rec, hash, err := Normalize(gr, u)
	if err != nil {
		r.Log.Warn("normalize", "err", err)
		return
	}
	last, lastVerb, err := r.Store.LastHash(ctx, rec.UID)
	if err != nil {
		r.Log.Warn("store", "err", err)
		return
	}
	switch {
	case deleted:
		// The last writer is not the one who deleted it; the watch does not
		// say who did.
		rec.Verb = Died
		rec.At = time.Now().UTC()
		rec.Manager = ""
	case last == "" || lastVerb == Died:
		rec.Verb = Born
	case last == hash:
		return
	default:
		rec.Verb = Changed
	}
	if err := r.Store.Add(ctx, rec, hash); err != nil {
		r.Log.Warn("store", "err", err)
	}
}

// Normalize strips what is not memory (status, managed fields, revisions),
// redacts secret values and computes a content hash.
func Normalize(gr schema.GroupResource, u *unstructured.Unstructured) (Record, string, error) {
	o := u.DeepCopy()
	manager, at := lastWrite(o)
	if at.IsZero() {
		at = o.GetCreationTimestamp().Time
	}
	if at.IsZero() {
		at = time.Now()
	}
	rev := o.GetResourceVersion()
	unstructured.RemoveNestedField(o.Object, "status")
	unstructured.RemoveNestedField(o.Object, "metadata", "managedFields")
	unstructured.RemoveNestedField(o.Object, "metadata", "resourceVersion")
	if gr.Group == "" && gr.Resource == "secrets" {
		for _, f := range []string{"data", "stringData"} {
			if m, ok, _ := unstructured.NestedMap(o.Object, f); ok {
				for k := range m {
					m[k] = "<redacted>"
				}
				_ = unstructured.SetNestedMap(o.Object, m, f)
			}
		}
	}
	data, err := json.Marshal(o.Object)
	if err != nil {
		return Record{}, "", err
	}
	sum := sha256.Sum256(data)
	return Record{
		Ref:      Ref{Group: gr.Group, Resource: gr.Resource, Namespace: o.GetNamespace(), Name: o.GetName()},
		UID:      string(o.GetUID()),
		Kind:     o.GetKind(),
		At:       at.UTC(),
		Manager:  manager,
		Revision: rev,
		Object:   data,
	}, hex.EncodeToString(sum[:]), nil
}

func lastWrite(u *unstructured.Unstructured) (string, time.Time) {
	var who string
	var when time.Time
	for _, mf := range u.GetManagedFields() {
		if mf.Time != nil && !mf.Time.Time.Before(when) {
			who, when = mf.Manager, mf.Time.Time
		}
	}
	return who, when
}
