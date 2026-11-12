// Package reader keeps the reader's local state: edition and reading path.
// Nothing about readers is stored on the server.
package reader

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/tym83/sankofa/pkg/card"
)

// State is what a reader carries with them.
type State struct {
	Edition string   `json:"edition"`
	Path    []string `json:"path"`
	Done    []string `json:"done,omitempty"` // finished quests
}

// Dir is where the state lives (SANKOFA_HOME or ~/.config/sankofa).
func Dir() string {
	if d := os.Getenv("SANKOFA_HOME"); d != "" {
		return d
	}
	h, _ := os.UserConfigDir()
	return filepath.Join(h, "sankofa")
}

func file() string { return filepath.Join(Dir(), "state.json") }

// Load reads the state, creating one with a random edition on first use: like
// the copies of Pavić's dictionary, each installation gets one of two.
func Load() (*State, error) {
	var s State
	data, err := os.ReadFile(file())
	switch {
	case errors.Is(err, os.ErrNotExist):
	case err != nil:
		return nil, err
	default:
		if err := json.Unmarshal(data, &s); err != nil {
			return nil, err
		}
	}
	if s.Edition != card.EditionMale && s.Edition != card.EditionFemale {
		b := make([]byte, 1)
		_, _ = rand.Read(b)
		s.Edition = card.EditionMale
		if b[0]&1 == 1 {
			s.Edition = card.EditionFemale
		}
		if err := s.Save(); err != nil {
			return nil, err
		}
	}
	return &s, nil
}

// Save writes the state.
func (s *State) Save() error {
	if err := os.MkdirAll(Dir(), 0o755); err != nil {
		return err
	}
	data, _ := json.MarshalIndent(s, "", "  ")
	return os.WriteFile(file(), data, 0o644)
}

// Visit appends a card to the path, skipping immediate repeats.
func (s *State) Visit(id string) {
	if n := len(s.Path); n > 0 && s.Path[n-1] == id {
		return
	}
	s.Path = append(s.Path, id)
}

// Seen reports whether the reader has opened the card.
func (s *State) Seen(id string) bool {
	for _, p := range s.Path {
		if p == id {
			return true
		}
	}
	return false
}

// EncodePath turns a path into a shareable token.
func EncodePath(p []string) string { return strings.Join(p, ".") }

// DecodePath reverses EncodePath.
func DecodePath(tok string) []string {
	if tok == "" {
		return nil
	}
	return strings.Split(tok, ".")
}
