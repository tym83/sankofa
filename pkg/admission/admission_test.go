package admission

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	admissionv1 "k8s.io/api/admission/v1"
	authnv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	"github.com/tym83/sankofa/api/v1alpha1"
	"github.com/tym83/sankofa/pkg/credits"
)

func raw(v any) runtime.RawExtension {
	b, _ := json.Marshal(v)
	return runtime.RawExtension{Raw: b}
}

var r = (&http.Request{}).WithContext(context.Background())

func TestKgotlaGuard(t *testing.T) {
	ns := map[string]any{"apiVersion": "v1", "kind": "Namespace", "metadata": map[string]any{"name": "prod", "labels": map[string]any{Protected: "protected"}}}
	req := &admissionv1.AdmissionRequest{Operation: admissionv1.Delete, Name: "prod", Namespace: "prod", Resource: metav1.GroupVersionResource{Version: "v1", Resource: "namespaces"}, OldObject: raw(ns)}
	council := v1alpha1.Kgotla{ObjectMeta: metav1.ObjectMeta{Name: "drop-prod"}, Spec: v1alpha1.KgotlaSpec{
		Target: v1alpha1.Target{Resource: "namespaces", Name: "prod"}, Voices: []string{"ama", "kofi"}, Chief: "naledi", Reason: "migrated",
	}}
	list := func(cs ...v1alpha1.Kgotla) Councils {
		return func(context.Context) ([]v1alpha1.Kgotla, error) { return cs, nil }
	}

	if Kgotla(list())(r, req).Allowed {
		t.Fatal("protected namespace deleted without a council")
	}
	if Kgotla(list(council))(r, req).Allowed {
		t.Fatal("deleted before anyone spoke")
	}
	now := metav1.NewTime(time.Now())
	council.Spec.Spoken = []v1alpha1.Voice{{User: "ama", At: now}, {User: "naledi", At: now}, {User: "kofi", At: now}}
	if Kgotla(list(council))(r, req).Allowed {
		t.Fatal("the chief did not speak last")
	}
	council.Spec.Spoken = []v1alpha1.Voice{{User: "ama", At: now}, {User: "kofi", At: now}, {User: "naledi", At: now}}
	if !Kgotla(list(council))(r, req).Allowed {
		t.Fatal("a decided council must allow")
	}
	unprotected := map[string]any{"apiVersion": "v1", "kind": "Namespace", "metadata": map[string]any{"name": "dev"}}
	if !Kgotla(list())(r, &admissionv1.AdmissionRequest{Operation: admissionv1.Delete, OldObject: raw(unprotected)}).Allowed {
		t.Fatal("unprotected objects need no council")
	}
}

func TestKgotlaSpeech(t *testing.T) {
	fixed := time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC)
	h := KgotlaSpeech(func() time.Time { return fixed })
	base := v1alpha1.Kgotla{Spec: v1alpha1.KgotlaSpec{Target: v1alpha1.Target{Resource: "namespaces", Name: "prod"}, Voices: []string{"ama"}, Chief: "naledi", Reason: "x"}}
	next := base
	next.Spec.Spoken = []v1alpha1.Voice{{User: "someone-else"}}
	resp := h(r, &admissionv1.AdmissionRequest{Operation: admissionv1.Update, Object: raw(next), OldObject: raw(base), UserInfo: authnv1.UserInfo{Username: "ama"}})
	if !resp.Allowed || !strings.Contains(string(resp.Patch), `"user":"ama"`) {
		t.Fatalf("speaker name must come from the authenticated user: %s", resp.Patch)
	}
	if h(r, &admissionv1.AdmissionRequest{Operation: admissionv1.Update, Object: raw(next), OldObject: raw(base), UserInfo: authnv1.UserInfo{Username: "mallory"}}).Allowed {
		t.Fatal("strangers do not speak")
	}
	spoken := base
	spoken.Spec.Spoken = []v1alpha1.Voice{{User: "ama", At: metav1.NewTime(fixed)}}
	if h(r, &admissionv1.AdmissionRequest{Operation: admissionv1.Update, Object: raw(base), OldObject: raw(spoken), UserInfo: authnv1.UserInfo{Username: "ama"}}).Allowed {
		t.Fatal("what was said cannot be unsaid")
	}
}

func TestPolyrhythm(t *testing.T) {
	cj := map[string]any{"apiVersion": "batch/v1", "kind": "CronJob", "metadata": map[string]any{"name": "backup", "namespace": "db"}, "spec": map[string]any{"schedule": "H 3 * * *"}}
	taken := func(context.Context, string, string) map[int]bool { return map[int]bool{Beat("db/backup", nil): true} }
	resp := Polyrhythm(taken)(r, &admissionv1.AdmissionRequest{Operation: admissionv1.Create, Name: "backup", Namespace: "db", Object: raw(cj)})
	var ops []map[string]any
	_ = json.Unmarshal(resp.Patch, &ops)
	got := ops[0]["value"].(string)
	want := (Beat("db/backup", nil) + 1) % 60
	if !strings.HasSuffix(got, " 3 * * *") || !strings.HasPrefix(got, itoa(want)+" ") {
		t.Fatalf("schedule %q, want minute %d (the hashed one was taken)", got, want)
	}
	plain := map[string]any{"apiVersion": "batch/v1", "kind": "CronJob", "spec": map[string]any{"schedule": "0 * * * *"}}
	if resp := Polyrhythm(taken)(r, &admissionv1.AdmissionRequest{Operation: admissionv1.Create, Object: raw(plain)}); resp.Patch != nil {
		t.Fatal("explicit schedules are left alone")
	}
}

func itoa(i int) string { b, _ := json.Marshal(i); return string(b) }

func TestCredits(t *testing.T) {
	pod := map[string]any{"apiVersion": "v1", "kind": "Pod", "spec": map[string]any{"containers": []any{map[string]any{"name": "a", "image": "x"}}}}
	res := func(context.Context, string) *credits.Credit { return &credits.Credit{Ref: "x", Undeclared: true} }
	req := &admissionv1.AdmissionRequest{Operation: admissionv1.Create, Object: raw(pod)}
	if resp := Credits(res, false)(r, req); !resp.Allowed || len(resp.Warnings) == 0 {
		t.Fatal("warn mode must allow with warnings")
	}
	if Credits(res, true)(r, req).Allowed {
		t.Fatal("enforce mode must deny")
	}
	broken := func(context.Context, string) *credits.Credit { return &credits.Credit{Error: "registry down"} }
	if !Credits(broken, true)(r, req).Allowed {
		t.Fatal("unreadable registries must not block")
	}
}
