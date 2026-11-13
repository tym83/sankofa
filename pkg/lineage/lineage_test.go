package lineage

import (
	"reflect"
	"testing"

	"github.com/tym83/sankofa/pkg/card"
)

func set() *card.Set {
	s := &card.Set{ByID: map[string]*card.Card{}}
	add := func(c *card.Card) { s.ByID[c.ID] = c; s.Order = append(s.Order, c.ID) }
	add(&card.Card{ID: "work-songs", Kind: card.KindGenre})
	add(&card.Card{ID: "spirituals", Kind: card.KindGenre, Roots: []string{"work-songs"}})
	add(&card.Card{ID: "blues", Kind: card.KindGenre, Roots: []string{"spirituals", "work-songs"}})
	add(&card.Card{ID: "gospel", Kind: card.KindGenre, Roots: []string{"spirituals"}})
	add(&card.Card{ID: "rock-n-roll", Kind: card.KindGenre, Roots: []string{"blues", "gospel"}})
	add(&card.Card{ID: "rosetta-tharpe", Kind: card.KindPerson, Genres: []string{"gospel"}, Tags: []string{"uncredited"}})
	add(&card.Card{ID: "bessie-smith", Kind: card.KindPerson, Genres: []string{"blues"}})
	return s
}

func TestLineage(t *testing.T) {
	s := set()
	if got := InstallOrder(s, "rock-n-roll"); !reflect.DeepEqual(got, []string{"work-songs", "spirituals", "blues", "gospel", "rock-n-roll"}) {
		t.Fatal(got)
	}
	if n := Why(s, "rock-n-roll").Count(); n != 4 {
		t.Fatalf("why count %d", n)
	}
	if n := Rdeps(s, "work-songs").Count(); n != 4 {
		t.Fatalf("rdeps count %d", n)
	}
	a := Audit(s, "rock-n-roll")
	if len(a) != 1 || a[0].ID != "rosetta-tharpe" {
		t.Fatalf("audit %v", a)
	}
}
