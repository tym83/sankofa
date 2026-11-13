package main

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/tym83/sankofa/pkg/card"
	"github.com/tym83/sankofa/pkg/reader"
)

func TestDictIndexAndEdition(t *testing.T) {
	t.Setenv("SANKOFA_HOME", t.TempDir())
	s, err := card.LoadDir("../../content/cards")
	if err != nil {
		t.Fatal(err)
	}
	st, _ := reader.Load()
	st.Edition = card.EditionMale
	m := newDictModel(s, st, s.ByID["bridgetower"])
	key := func(k tea.KeyMsg) { m.Update(k) }
	key(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")})
	if !m.index {
		t.Fatal("/ must open the index")
	}
	key(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("equiano")})
	key(tea.KeyMsg{Type: tea.KeyEnter})
	if m.index || m.cur.ID != "equiano" {
		t.Fatalf("search must open equiano, got %s", m.cur.ID)
	}
	m.open(s.ByID["douglass-covey"], true)
	key(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("e")})
	if st.Edition != card.EditionFemale || m.cur.ID != "jacobs-garret" {
		t.Fatalf("e must trade the copy and swap the paired card: %s %s", st.Edition, m.cur.ID)
	}
}
