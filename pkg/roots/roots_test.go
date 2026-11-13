package roots

import (
	"strings"
	"testing"
	"testing/fstest"

	"github.com/tym83/sankofa/pkg/card"
)

const two = `
    sources:
      - {title: a, url: "https://a"}
      - {title: b, url: "https://b"}`

func TestPaths(t *testing.T) {
	fsys := fstest.MapFS{
		"oasis.yaml":   {Data: []byte("id: oasis\nname: Oasis\nyears: [1991]\nplace: {name: M, lat: 1, lon: 1}\ngenre: britpop\nlinks:\n  - to: root:beatles\n    claim: c" + two + "\n")},
		"beatles.yaml": {Data: []byte("id: beatles\nname: The Beatles\naliases: [битлз]\nyears: [1960]\nplace: {name: L, lat: 1, lon: 1}\ngenre: rock\nlinks:\n  - to: card:rock-n-roll\n    claim: c" + two + "\n")},
	}
	s, err := LoadFS(fsys)
	if err != nil {
		t.Fatal(err)
	}
	cards := &card.Set{ByID: map[string]*card.Card{"rock-n-roll": {ID: "rock-n-roll"}}}
	if errs := s.Validate(cards); len(errs) != 0 {
		t.Fatal(errs)
	}
	ps, _ := s.Paths("oasis", 8)
	if len(ps) != 1 || len(ps[0]) != 2 || ps[0][1].Link.To != "card:rock-n-roll" {
		t.Fatalf("%+v", ps)
	}
	if f := s.Find("Битлз"); len(f) != 1 || f[0].ID != "beatles" {
		t.Fatal("alias search")
	}
	s.ByID["beatles"].Links[0].Sources = s.ByID["beatles"].Links[0].Sources[:1]
	errs := s.Validate(cards)
	if len(errs) == 0 || !strings.Contains(errs[0].Error(), "want at least 2") {
		t.Fatal("one source must fail")
	}
}
