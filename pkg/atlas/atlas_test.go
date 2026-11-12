package atlas

import "testing"

func TestRoundTrip(t *testing.T) {
	p := Point{From: 1900, To: 1935, Place: "delta", Zoom: 3, Focus: "blues"}
	got, err := Parse("http://x/#" + p.Fragment())
	if err != nil || got != p {
		t.Fatalf("%+v %v", got, err)
	}
	if _, err := Parse("zoom=9"); err == nil {
		t.Fatal("zoom 9 must fail")
	}
}
