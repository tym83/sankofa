// Package roots traces how artists and bands, often far from Black music on
// the surface, stand on Black traditions: a chain of documented influences
// that ends at a card of the museum. Every link carries its own sources.
package roots

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"sort"
	"strings"

	"sigs.k8s.io/yaml"

	"github.com/tym83/sankofa/pkg/card"
)

// Source backs one link.
type Source struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// Link is one documented step of influence. To is either another artist of
// the collection ("root:<id>") or a museum card ("card:<id>").
type Link struct {
	To string `json:"to"`
	// Kind of borrowing: influence (named as an influence), cover (recorded
	// their song), sample (used a recording), member (played in the band),
	// producer, scene (came out of the same scene), teacher.
	Kind string `json:"kind,omitempty"`
	// What exactly was borrowed, for covers and samples: the song or the
	// recording and what of it (beat, handclaps, a riff).
	What    string   `json:"what,omitempty"`
	WhatRU  string   `json:"whatRu,omitempty"`
	Claim   string   `json:"claim"`
	Sources []Source `json:"sources"`
	// Russian translation of the claim.
	ClaimRU string `json:"claimRu,omitempty"`
}

// Artist is someone whose roots we trace.
type Artist struct {
	ID      string     `json:"id"`
	Name    string     `json:"name"`
	NameRU  string     `json:"nameRu,omitempty"`
	Aliases []string   `json:"aliases,omitempty"` // for search: other spellings, Cyrillic
	Years   []int      `json:"years"`
	Place   card.Place `json:"place"`
	Genre   string     `json:"genre"`
	GenreRU string     `json:"genreRu,omitempty"`
	Links   []Link     `json:"links"`
}

var validKinds = map[string]bool{"influence": true, "cover": true, "sample": true, "member": true, "producer": true, "scene": true, "teacher": true}

// Set is a loaded collection.
type Set struct {
	ByID  map[string]*Artist
	Order []string
}

// LoadFS reads every *.yaml in fsys.
func LoadFS(fsys fs.FS) (*Set, error) {
	s := &Set{ByID: map[string]*Artist{}}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || path.Ext(p) != ".yaml" {
			return err
		}
		data, err := fs.ReadFile(fsys, p)
		if err != nil {
			return err
		}
		var a Artist
		if err := yaml.UnmarshalStrict(data, &a); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
		if _, dup := s.ByID[a.ID]; dup {
			return fmt.Errorf("%s: duplicate id %q", p, a.ID)
		}
		s.ByID[a.ID] = &a
		s.Order = append(s.Order, a.ID)
		return nil
	})
	if errors.Is(err, fs.ErrNotExist) {
		return s, nil
	}
	sort.Strings(s.Order)
	return s, err
}

// LoadDir reads a directory; a missing directory is an empty set.
func LoadDir(dir string) (*Set, error) {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return &Set{ByID: map[string]*Artist{}}, nil
	}
	return LoadFS(os.DirFS(dir))
}

// Validate checks sources, references and that every artist reaches a card.
func (s *Set) Validate(cards *card.Set) []error {
	var errs []error
	for _, id := range s.Order {
		a := s.ByID[id]
		bad := func(f string, x ...any) { errs = append(errs, fmt.Errorf("roots %s: %s", id, fmt.Sprintf(f, x...))) }
		if a.Name == "" || a.Genre == "" || len(a.Years) == 0 || a.Place.Name == "" {
			bad("needs name, genre, years and place")
		}
		if len(a.Links) == 0 {
			bad("needs at least one link")
		}
		for i, l := range a.Links {
			if l.Kind != "" && !validKinds[l.Kind] {
				bad("link %d: unknown kind %q", i, l.Kind)
			}
			if (l.Kind == "sample" || l.Kind == "cover") && l.What == "" {
				bad("link %d: a %s must say what was taken", i, l.Kind)
			}
			if strings.TrimSpace(l.Claim) == "" {
				bad("link %d has no claim", i)
			}
			if len(l.Sources) < 2 {
				bad("link %d to %s has %d sources, want at least 2", i, l.To, len(l.Sources))
			}
			for _, src := range l.Sources {
				if src.Title == "" || !strings.HasPrefix(src.URL, "http") {
					bad("link %d: source needs a title and a URL", i)
				}
			}
			kind, ref, _ := strings.Cut(l.To, ":")
			switch kind {
			case "card":
				if cards.ByID[ref] == nil {
					bad("link %d: unknown card %q", i, ref)
				}
			case "root":
				if s.ByID[ref] == nil {
					bad("link %d: unknown artist %q", i, ref)
				}
			default:
				bad("link %d: to must be card:<id> or root:<id>", i)
			}
		}
		if _, err := s.Paths(id, 8); err != nil {
			bad("%v", err)
		}
	}
	return errs
}

// Step is one hop of a resolved path.
type Step struct {
	From  string // artist id
	Link  Link
	Depth int
}

// Paths returns every chain from the artist to museum cards (depth-first,
// each artist visited once per chain). An artist that cannot reach a card is
// an error.
func (s *Set) Paths(id string, maxDepth int) ([][]Step, error) {
	var out [][]Step
	var walk func(cur string, chain []Step, seen map[string]bool) error
	walk = func(cur string, chain []Step, seen map[string]bool) error {
		if len(chain) > maxDepth {
			return fmt.Errorf("chain from %s is longer than %d", id, maxDepth)
		}
		a := s.ByID[cur]
		if a == nil {
			return fmt.Errorf("unknown artist %q", cur)
		}
		for _, l := range a.Links {
			st := Step{From: cur, Link: l, Depth: len(chain)}
			next := append(append([]Step(nil), chain...), st)
			kind, ref, _ := strings.Cut(l.To, ":")
			if kind == "card" {
				out = append(out, next)
				continue
			}
			if seen[ref] {
				continue
			}
			seen2 := map[string]bool{ref: true}
			for k := range seen {
				seen2[k] = true
			}
			if err := walk(ref, next, seen2); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(id, nil, map[string]bool{id: true}); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("%s does not reach any museum card", id)
	}
	return out, nil
}

// Find looks an artist up by id, name or alias, case-insensitively.
func (s *Set) Find(q string) []*Artist {
	q = strings.ToLower(strings.TrimSpace(q))
	var exact, part []*Artist
	for _, id := range s.Order {
		a := s.ByID[id]
		names := append([]string{a.ID, a.Name, a.NameRU}, a.Aliases...)
		for _, n := range names {
			n = strings.ToLower(n)
			if n == "" {
				continue
			}
			if n == q {
				exact = append(exact, a)
				break
			}
			if strings.Contains(n, q) {
				part = append(part, a)
				break
			}
		}
	}
	if len(exact) > 0 {
		return exact
	}
	return part
}
