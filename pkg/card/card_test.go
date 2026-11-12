package card

import (
	"strings"
	"testing"
)

const good = `---
id: a
kind: person
title: A
wow: wow
years: [1800, 1850]
places: [{name: X, lat: 1, lon: 2}]
zoom: 4
books: [voices]
sources: [{title: S}]
---
Hello [[b|friend]] and [[b]].
`

func mk(t *testing.T, id, edition, pair, body string) *Card {
	t.Helper()
	src := strings.Replace(good, "id: a", "id: "+id, 1)
	if edition != "" {
		src = strings.Replace(src, "zoom: 4", "zoom: 4\nedition: "+edition+"\npair: "+pair, 1)
	}
	src = strings.Replace(src, "Hello [[b|friend]] and [[b]].", body, 1)
	c, err := Parse([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func set(cs ...*Card) *Set {
	s := &Set{ByID: map[string]*Card{}}
	for _, c := range cs {
		s.ByID[c.ID] = c
		s.Order = append(s.Order, c.ID)
	}
	return s
}

func TestParseAndLinks(t *testing.T) {
	c := mk(t, "a", "", "", "Hello [[b|friend]] and [[b]].")
	ls := c.Links()
	if len(ls) != 2 || ls[0].Text != "friend" || ls[1].Text != "b" {
		t.Fatalf("links: %+v", ls)
	}
	if got := c.PlainBody(); got != "Hello friend and b." {
		t.Fatalf("plain: %q", got)
	}
	if c.Edition != EditionBoth {
		t.Fatalf("default edition %q", c.Edition)
	}
}

func TestValidate(t *testing.T) {
	s := set(mk(t, "a", "", "", "see [[missing]]"))
	errs := s.Validate()
	if len(errs) != 1 || !strings.Contains(errs[0].Error(), "missing") {
		t.Fatalf("errs: %v", errs)
	}
	if _, err := Parse([]byte("---\nid: a\nbogus: 1\n---\nx")); err == nil {
		t.Fatal("unknown key must fail")
	}
}

func TestEditions(t *testing.T) {
	m := mk(t, "douglass", EditionMale, "freedom", "m")
	f := mk(t, "jacobs", EditionFemale, "freedom", "f")
	s := set(m, f)
	if errs := s.Validate(); len(errs) != 0 {
		t.Fatal(errs)
	}
	if s.ForEdition("douglass", EditionFemale).ID != "jacobs" {
		t.Fatal("f reader must get jacobs")
	}
	if s.ForEdition("douglass", EditionMale).ID != "douglass" {
		t.Fatal("m reader keeps douglass")
	}
	if errs := set(m).Validate(); len(errs) != 1 {
		t.Fatalf("lonely pair must fail: %v", errs)
	}
}

func TestBacklinks(t *testing.T) {
	s := set(mk(t, "a", "", "", "[[b]]"), mk(t, "b", "", "", "no links"))
	if got := s.Backlinks("b"); len(got) != 1 || got[0] != "a" {
		t.Fatal(got)
	}
}

func TestResolved(t *testing.T) {
	a := mk(t, "a", "", "", "see [[b]] and [[b|her]]")
	b := mk(t, "b", "", "", "x")
	b.Title = "Bessie Smith"
	s := set(a, b)
	if got := s.Resolved(a).Body; got != "see [[b|Bessie Smith]] and [[b|her]]" {
		t.Fatal(got)
	}
	if a.Body != "see [[b]] and [[b|her]]" {
		t.Fatal("Resolved must not change the original")
	}
}
