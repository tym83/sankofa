// Package pulse turns the heartbeat of a cluster into a stream the museum can
// play: every node is a voice that lives while its Lease is renewed, every
// ready pod answers a call. Only node names and counts leave the cluster.
package pulse

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	coordinationv1 "k8s.io/api/coordination/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// Event is one beat sent to listeners.
type Event struct {
	Type     string    `json:"type"`            // lease | voices | pod
	Phase    string    `json:"phase,omitempty"` // for pods: joined (became ready) | left (stopped or became unready)
	Name     string    `json:"name,omitempty"`  // for pods: the workload's name, not the pod hash
	Node     string    `json:"node,omitempty"`
	At       time.Time `json:"at"`
	Voices   []Voice   `json:"voices,omitempty"`
	Duration float64   `json:"leaseSeconds,omitempty"`
}

// Voice is a node with its answering pods.
type Voice struct {
	Node     string  `json:"node"`
	Alive    bool    `json:"alive"`    // the Lease was renewed within its duration
	Late     float64 `json:"late"`     // seconds since renewal, as a share of the duration
	Ready    int     `json:"ready"`    // pods that answer
	NotReady int     `json:"notReady"` // pods that are called and stay silent
}

// Hub watches the cluster and fans events out to listeners.
type Hub struct {
	mu      sync.Mutex
	subs    map[chan Event]bool
	leases  map[string]*coordinationv1.Lease
	pods    map[string]*corev1.Pod
	started bool
}

// Run starts watching until ctx is done.
func (h *Hub) Run(ctx context.Context, kube kubernetes.Interface) {
	h.mu.Lock()
	h.subs, h.leases, h.pods = map[chan Event]bool{}, map[string]*coordinationv1.Lease{}, map[string]*corev1.Pod{}
	h.started = true
	h.mu.Unlock()
	f := informers.NewSharedInformerFactoryWithOptions(kube, 0, informers.WithNamespace("kube-node-lease"))
	li := f.Coordination().V1().Leases().Informer()
	_, _ = li.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(o any) { h.lease(o, false) },
		UpdateFunc: func(_, o any) { h.lease(o, true) },
	})
	pf := informers.NewSharedInformerFactory(kube, 0)
	pi := pf.Core().V1().Pods().Informer()
	_, _ = pi.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(o any) { h.pod(o, false) },
		UpdateFunc: func(_, o any) { h.pod(o, false) },
		DeleteFunc: func(o any) { h.pod(o, true) },
	})
	f.Start(ctx.Done())
	pf.Start(ctx.Done())
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			h.publish(Event{Type: "voices", At: time.Now().UTC(), Voices: h.Voices(time.Now())})
		}
	}
}

func (h *Hub) lease(o any, renewed bool) {
	l, ok := o.(*coordinationv1.Lease)
	if !ok {
		return
	}
	h.mu.Lock()
	h.leases[l.Name] = l
	h.mu.Unlock()
	if renewed {
		d := 40.0
		if l.Spec.LeaseDurationSeconds != nil {
			d = float64(*l.Spec.LeaseDurationSeconds)
		}
		h.publish(Event{Type: "lease", Node: l.Name, At: time.Now().UTC(), Duration: d})
	}
}

func (h *Hub) pod(o any, deleted bool) {
	if d, ok := o.(cache.DeletedFinalStateUnknown); ok {
		o = d.Obj
	}
	p, ok := o.(*corev1.Pod)
	if !ok {
		return
	}
	key := p.Namespace + "/" + p.Name
	h.mu.Lock()
	was := h.pods[key] != nil && ready(h.pods[key])
	if deleted {
		delete(h.pods, key)
	} else {
		h.pods[key] = p
	}
	now := !deleted && ready(p)
	h.mu.Unlock()
	if was != now {
		phase := "left"
		if now {
			phase = "joined"
		}
		h.publish(Event{Type: "pod", Phase: phase, Node: p.Spec.NodeName, Name: workload(p), At: time.Now().UTC()})
	}
}

func ready(p *corev1.Pod) bool {
	if p.Status.Phase != corev1.PodRunning {
		return false
	}
	for _, c := range p.Status.Conditions {
		if c.Type == corev1.PodReady && c.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

// workload names a pod by what it belongs to: its app label, or its name
// without the generated suffix.
func workload(p *corev1.Pod) string {
	for _, k := range []string{"app.kubernetes.io/name", "app", "k8s-app"} {
		if v := p.Labels[k]; v != "" {
			return v
		}
	}
	if len(p.OwnerReferences) > 0 {
		n := p.OwnerReferences[0].Name
		if p.OwnerReferences[0].Kind == "ReplicaSet" {
			if i := strings.LastIndex(n, "-"); i > 0 {
				n = n[:i]
			}
		}
		return n
	}
	return p.Name
}

// Voices summarises nodes: alive or silent, and how many pods answer.
func (h *Hub) Voices(now time.Time) []Voice {
	h.mu.Lock()
	defer h.mu.Unlock()
	byNode := map[string]*Voice{}
	for name, l := range h.leases {
		v := &Voice{Node: name}
		d := 40.0
		if l.Spec.LeaseDurationSeconds != nil {
			d = float64(*l.Spec.LeaseDurationSeconds)
		}
		if l.Spec.RenewTime != nil {
			since := now.Sub(l.Spec.RenewTime.Time).Seconds()
			v.Late = since / d
			v.Alive = since < d
		}
		byNode[name] = v
	}
	for _, p := range h.pods {
		v := byNode[p.Spec.NodeName]
		if v == nil || p.Status.Phase != corev1.PodRunning {
			continue
		}
		ready := false
		for _, c := range p.Status.Conditions {
			if c.Type == corev1.PodReady && c.Status == corev1.ConditionTrue {
				ready = true
			}
		}
		if ready {
			v.Ready++
		} else {
			v.NotReady++
		}
	}
	out := make([]Voice, 0, len(byNode))
	for _, v := range byNode {
		out = append(out, *v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Node < out[j].Node })
	return out
}

func (h *Hub) publish(e Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.subs {
		select {
		case c <- e:
		default: // a slow listener misses a beat, never blocks the cluster
		}
	}
}

// ServeHTTP streams events as server-sent events.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	c := make(chan Event, 32)
	h.mu.Lock()
	if !h.started || len(h.subs) >= 500 {
		h.mu.Unlock()
		http.Error(w, "the ensemble is full", http.StatusServiceUnavailable)
		return
	}
	h.subs[c] = true
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.subs, c)
		h.mu.Unlock()
	}()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	first, _ := json.Marshal(Event{Type: "voices", At: time.Now().UTC(), Voices: h.Voices(time.Now())})
	fmt.Fprintf(w, "data: %s\n\n", first)
	fl.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case e := <-c:
			b, _ := json.Marshal(e)
			fmt.Fprintf(w, "data: %s\n\n", b)
			fl.Flush()
		}
	}
}
