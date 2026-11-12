package atlas

import "testing"

func TestRoundTrip(t *testing.T) {
	p := Point{From: 1900, To: 1935, Place: "delta", Zoom: 3, Focus: "blues", Path: []string{"a", "b"}}
	got, err := Parse("http://x/#" + p.Fragment())
	if err != nil || got.Fragment() != p.Fragment() {
		t.Fatalf("%+v %v", got, err)
	}
	if _, err := Parse("zoom=9"); err == nil {
		t.Fatal("zoom 9 must fail")
	}
}

func TestSlug(t *testing.T) {
	if got := Slug("Île de Gorée"); got != "ile-de-goree" {
		t.Fatal(got)
	}
}
