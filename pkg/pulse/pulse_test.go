package pulse

import (
	"testing"
	"time"

	coordinationv1 "k8s.io/api/coordination/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestVoices(t *testing.T) {
	now := time.Now()
	d := int32(40)
	h := &Hub{leases: map[string]*coordinationv1.Lease{}, pods: map[string]*corev1.Pod{}}
	fresh, stale := metav1.NewMicroTime(now.Add(-5*time.Second)), metav1.NewMicroTime(now.Add(-60*time.Second))
	h.leases["a"] = &coordinationv1.Lease{ObjectMeta: metav1.ObjectMeta{Name: "a"}, Spec: coordinationv1.LeaseSpec{RenewTime: &fresh, LeaseDurationSeconds: &d}}
	h.leases["b"] = &coordinationv1.Lease{ObjectMeta: metav1.ObjectMeta{Name: "b"}, Spec: coordinationv1.LeaseSpec{RenewTime: &stale, LeaseDurationSeconds: &d}}
	pod := func(node string, ready corev1.ConditionStatus) *corev1.Pod {
		return &corev1.Pod{Spec: corev1.PodSpec{NodeName: node}, Status: corev1.PodStatus{Phase: corev1.PodRunning,
			Conditions: []corev1.PodCondition{{Type: corev1.PodReady, Status: ready}}}}
	}
	h.pods["x/1"], h.pods["x/2"] = pod("a", corev1.ConditionTrue), pod("a", corev1.ConditionFalse)
	v := h.Voices(now)
	if !v[0].Alive || v[0].Ready != 1 || v[0].NotReady != 1 {
		t.Fatalf("a: %+v", v[0])
	}
	if v[1].Alive {
		t.Fatalf("b must be silent: %+v", v[1])
	}
}

func TestPodEvents(t *testing.T) {
	h := &Hub{leases: map[string]*coordinationv1.Lease{}, pods: map[string]*corev1.Pod{}, subs: map[chan Event]bool{}}
	c := make(chan Event, 4)
	h.subs[c] = true
	p := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "web-7d9f-abc", Namespace: "x", Labels: map[string]string{"app": "web"}},
		Spec: corev1.PodSpec{NodeName: "n1"}, Status: corev1.PodStatus{Phase: corev1.PodRunning, Conditions: []corev1.PodCondition{{Type: corev1.PodReady, Status: corev1.ConditionTrue}}}}
	h.pod(p, false)
	if e := <-c; e.Type != "pod" || e.Phase != "joined" || e.Name != "web" || e.Node != "n1" {
		t.Fatalf("%+v", e)
	}
	h.pod(p, false)
	select {
	case e := <-c:
		t.Fatalf("no change, no event: %+v", e)
	default:
	}
	h.pod(p, true)
	if e := <-c; e.Phase != "left" {
		t.Fatalf("%+v", e)
	}
}
