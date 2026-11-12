package history

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestLifeAndRestore(t *testing.T) {
	ctx := context.Background()
	s, err := Open(filepath.Join(t.TempDir(), "h.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	gr := schema.GroupResource{Group: "apps", Resource: "deployments"}
	mk := func(replicas int64) *unstructured.Unstructured {
		u := &unstructured.Unstructured{Object: map[string]any{
			"apiVersion": "apps/v1", "kind": "Deployment",
			"metadata": map[string]any{"name": "web", "namespace": "default", "uid": "u1", "resourceVersion": "1"},
			"spec":     map[string]any{"replicas": replicas},
			"status":   map[string]any{"readyReplicas": int64(1)},
		}}
		return u
	}
	add := func(u *unstructured.Unstructured, verb string, at time.Time) {
		rec, hash, err := Normalize(gr, u)
		if err != nil {
			t.Fatal(err)
		}
		rec.Verb, rec.At = verb, at
		if err := s.Add(ctx, rec, hash); err != nil {
			t.Fatal(err)
		}
	}
	t0 := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	add(mk(1), Born, t0)
	add(mk(3), Changed, t0.Add(time.Hour))
	add(mk(3), Died, t0.Add(2*time.Hour))

	ref := Ref{Group: "apps", Resource: "deployments", Namespace: "default", Name: "web"}
	life, err := s.Life(ctx, ref)
	if err != nil || len(life) != 3 {
		t.Fatalf("life %d %v", len(life), err)
	}
	r, ok, err := s.At(ctx, ref, t0.Add(30*time.Minute))
	if err != nil || !ok || r.Verb != Born {
		t.Fatalf("at: %+v %v %v", r, ok, err)
	}
	if string(r.Object) == "" || contains(string(r.Object), "readyReplicas") || contains(string(r.Object), "resourceVersion") {
		t.Fatalf("status and revision must be stripped: %s", r.Object)
	}
	obits, _ := s.Obituaries(ctx, "default", 10)
	if len(obits) != 1 {
		t.Fatalf("obituaries %d", len(obits))
	}
	n, _ := s.Prune(ctx, t0.Add(3*time.Hour))
	if n != 2 {
		t.Fatalf("pruned %d, want 2 (the obituary stays)", n)
	}
}

func TestSecretsRedacted(t *testing.T) {
	u := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1", "kind": "Secret",
		"metadata": map[string]any{"name": "s", "namespace": "default", "uid": "u2"},
		"data":     map[string]any{"password": "aHVudGVyMg=="},
	}}
	rec, _, err := Normalize(schema.GroupResource{Resource: "secrets"}, u)
	if err != nil {
		t.Fatal(err)
	}
	if contains(string(rec.Object), "aHVudGVyMg") {
		t.Fatal("secret value leaked into history")
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
