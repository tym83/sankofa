package history

import "testing"

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
