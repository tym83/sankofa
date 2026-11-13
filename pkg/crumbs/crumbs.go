// Package crumbs picks short "wow" lines to show while something is running,
// enough to make someone want to read further.
package crumbs

import (
	"math/rand/v2"

	"github.com/tym83/sankofa/pkg/card"
)

// Picker chooses crumbs: first cards the reader has not opened, preferring
// those linked from what they read last; never the same card twice in a row.
type Picker struct {
	Set  *card.Set
	Seen func(id string) bool
	Last string // last card the reader opened
	prev map[string]bool
}

// Next returns the next card to show, or nil for an empty set.
func (p *Picker) Next() *card.Card {
	if p.prev == nil {
		p.prev = map[string]bool{}
	}
	var near, fresh, any []string
	linked := map[string]bool{}
	if c := p.Set.ByID[p.Last]; c != nil {
		for _, l := range c.Links() {
			linked[l.Target] = true
		}
	}
	for _, id := range p.Set.Order {
		c := p.Set.ByID[id]
		if c.Edition != card.EditionBoth || p.prev[id] {
			continue
		}
		any = append(any, id)
		if p.Seen != nil && p.Seen(id) {
			continue
		}
		fresh = append(fresh, id)
		if linked[id] {
			near = append(near, id)
		}
	}
	pool := near
	if len(pool) == 0 {
		pool = fresh
	}
	if len(pool) == 0 {
		pool = any
	}
	if len(pool) == 0 {
		if len(p.prev) == 0 {
			return nil
		}
		p.prev = map[string]bool{}
		return p.Next()
	}
	id := pool[rand.IntN(len(pool))]
	p.prev[id] = true
	return p.Set.ByID[id]
}
