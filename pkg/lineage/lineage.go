// Package lineage walks the genre graph: what a genre grew from, what grew
// from it, and whose work it took without credit.
package lineage

import (
	"sort"

	"github.com/tym83/sankofa/pkg/card"
)

// Node is a genre in a tree.
type Node struct {
	ID       string
	Children []*Node
	Repeat   bool // already shown above
}

// Why returns the tree of roots of a genre.
func Why(s *card.Set, id string) *Node {
	return walk(id, map[string]bool{}, func(g string) []string {
		if c := s.ByID[g]; c != nil {
			return c.Roots
		}
		return nil
	})
}

// Rdeps returns the tree of genres that grew from a genre.
func Rdeps(s *card.Set, id string) *Node {
	kids := map[string][]string{}
	for _, oid := range s.Order {
		for _, r := range s.ByID[oid].Roots {
			kids[r] = append(kids[r], oid)
		}
	}
	return walk(id, map[string]bool{}, func(g string) []string { return kids[g] })
}

func walk(id string, seen map[string]bool, next func(string) []string) *Node {
	n := &Node{ID: id}
	if seen[id] {
		n.Repeat = true
		return n
	}
	seen[id] = true
	ns := append([]string(nil), next(id)...)
	sort.Strings(ns)
	for _, c := range ns {
		n.Children = append(n.Children, walk(c, seen, next))
	}
	return n
}

// Count is the number of distinct genres in the tree, the root excluded.
func (n *Node) Count() int {
	seen := map[string]bool{}
	var f func(*Node)
	f = func(x *Node) {
		for _, c := range x.Children {
			if !c.Repeat {
				seen[c.ID] = true
				f(c)
			}
		}
	}
	f(n)
	return len(seen)
}

// InstallOrder lists a genre's lineage with roots first: history in order.
func InstallOrder(s *card.Set, id string) []string {
	var out []string
	done := map[string]bool{}
	var visit func(string)
	visit = func(g string) {
		if done[g] {
			return
		}
		done[g] = true
		if c := s.ByID[g]; c != nil {
			roots := append([]string(nil), c.Roots...)
			sort.Strings(roots)
			for _, r := range roots {
				visit(r)
			}
		}
		out = append(out, g)
	}
	visit(id)
	return out
}

// Audit lists cards tagged uncredited that belong to the genre or any of its
// roots: dependencies nobody declared.
func Audit(s *card.Set, id string) []*card.Card {
	in := map[string]bool{}
	for _, g := range InstallOrder(s, id) {
		in[g] = true
	}
	var out []*card.Card
	for _, oid := range s.Order {
		c := s.ByID[oid]
		uncredited := false
		for _, t := range c.Tags {
			if t == "uncredited" {
				uncredited = true
			}
		}
		if !uncredited {
			continue
		}
		for _, g := range c.Genres {
			if in[g] {
				out = append(out, c)
				break
			}
		}
	}
	return out
}
