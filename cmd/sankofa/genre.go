package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"sigs.k8s.io/yaml"

	"github.com/tym83/sankofa/api/v1alpha1"
	"github.com/tym83/sankofa/pkg/atlas"
	"github.com/tym83/sankofa/pkg/card"
	"github.com/tym83/sankofa/pkg/lineage"
)

func genreCmd() *cobra.Command {
	c := &cobra.Command{Use: "genre", Short: "Music as a dependency graph: where a genre came from and what grew from it"}
	tree := func(name, short string, f func(*card.Set, string) *lineage.Node, verb string) *cobra.Command {
		return &cobra.Command{
			Use: name + " GENRE", Short: short, Args: cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				s, err := loadCards(cmd)
				if err != nil {
					return err
				}
				g := s.ByID[args[0]]
				if g == nil || g.Kind != card.KindGenre {
					return fmt.Errorf("%q is not a genre; try `sankofa genre list`", args[0])
				}
				n := f(s, args[0])
				printTree(cmd.OutOrStdout(), s, n, "", true, true)
				fmt.Fprintf(cmd.OutOrStdout(), "\n%s %s %d genres.\n", g.Title, verb, n.Count())
				return nil
			},
		}
	}
	c.AddCommand(
		tree("why", "Show the roots a genre grew from", lineage.Why, "stands on"),
		tree("rdeps", "Show everything that grew from a genre: its gift to the world", lineage.Rdeps, "gave rise to"),
		&cobra.Command{
			Use: "list", Short: "List genres",
			RunE: func(cmd *cobra.Command, _ []string) error {
				s, err := loadCards(cmd)
				if err != nil {
					return err
				}
				for _, id := range s.Order {
					if c := s.ByID[id]; c.Kind == card.KindGenre {
						fmt.Fprintf(cmd.OutOrStdout(), "%-22s %s · %s\n", id, yearsOf(c), c.Places[0].Name)
					}
				}
				return nil
			},
		},
		&cobra.Command{
			Use:   "audit GENRE",
			Short: "Find undeclared dependencies: people whose work the genre took without credit",
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				s, err := loadCards(cmd)
				if err != nil {
					return err
				}
				found := lineage.Audit(s, args[0])
				w := cmd.OutOrStdout()
				if len(found) == 0 {
					fmt.Fprintf(w, "%s: every dependency is declared.\n", args[0])
					return nil
				}
				osc := isTerminal(w)
				fmt.Fprintf(w, "%s has %d undeclared dependencies:\n\n", args[0], len(found))
				for _, c := range found {
					u := atlas.ForCard(c).URL()
					fmt.Fprintf(w, "  ✗ %s (%s)\n    %s\n    %s\n\n", c.Title, yearsOf(c), c.Wow, atlas.Hyperlink(osc, u, "open in the atlas"))
				}
				fmt.Fprintf(w, "Declare them: `sankofa dict %s`.\n", found[0].ID)
				return nil
			},
		},
		recipesCmd(),
	)
	return c
}

func printTree(w io.Writer, s *card.Set, n *lineage.Node, prefix string, last, root bool) {
	label := n.ID
	if c := s.ByID[n.ID]; c != nil {
		label = fmt.Sprintf("%s (%s, %s)", c.Title, yearsOf(c), c.Places[0].Name)
	}
	if n.Repeat {
		label += " …"
	}
	switch {
	case root:
		fmt.Fprintln(w, label)
	case last:
		fmt.Fprintln(w, prefix+"└─ "+label)
	default:
		fmt.Fprintln(w, prefix+"├─ "+label)
	}
	next := prefix
	if !root {
		if last {
			next += "   "
		} else {
			next += "│  "
		}
	}
	for i, ch := range n.Children {
		printTree(w, s, ch, next, i == len(n.Children)-1, false)
	}
}

// recipesCmd writes one kubepkg recipe per genre. A genre package requires
// the packages of its roots, so `kubepkg install hip-hop` installs the whole
// lineage, oldest first, and each package brings its cards into the cluster.
func recipesCmd() *cobra.Command {
	var out, version string
	c := &cobra.Command{
		Use:   "recipes DIR",
		Short: "Generate kubepkg recipes for genre packages from a content directory",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := card.LoadDir(args[0])
			if err != nil {
				return err
			}
			if errs := s.Validate(); len(errs) > 0 {
				return fmt.Errorf("content does not lint: %v", errs[0])
			}
			owner := GenreOwners(s)
			n := 0
			for _, id := range s.Order {
				g := s.ByID[id]
				if g.Kind != card.KindGenre {
					continue
				}
				if err := writeRecipe(out, s, g, owner, version); err != nil {
					return err
				}
				n++
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%d genre recipes in %s\n", n, out)
			return nil
		},
	}
	c.Flags().StringVarP(&out, "out", "o", "dist/recipes", "output directory")
	c.Flags().StringVar(&version, "version", "1.0.0", "package version")
	return c
}

// GenreOwners assigns every card that belongs to genres to exactly one genre
// package (its first genre), so no two packages own the same object.
func GenreOwners(s *card.Set) map[string]string {
	owner := map[string]string{}
	for _, id := range s.Order {
		c := s.ByID[id]
		if c.Kind == card.KindGenre {
			owner[id] = id
		} else if len(c.Genres) > 0 {
			owner[id] = c.Genres[0]
		}
	}
	return owner
}

// PackageName is the kubepkg package of a genre.
func PackageName(genre string) string { return "sankofa-genre-" + genre }

func writeRecipe(out string, s *card.Set, g *card.Card, owner map[string]string, version string) error {
	pkg := PackageName(g.ID)
	dir := filepath.Join(out, pkg)
	chart := filepath.Join(dir, "charts", g.ID)
	if err := os.MkdirAll(filepath.Join(chart, "templates"), 0o755); err != nil {
		return err
	}
	var requires []map[string]string
	for _, r := range g.Roots {
		requires = append(requires, map[string]string{"package": PackageName(r), "version": "~" + version})
	}
	variant := map[string]any{
		"name": "default",
		"components": []map[string]any{{
			"name": g.ID, "path": g.ID,
			"install": map[string]string{"namespace": "sankofa-system", "releaseName": pkg},
		}},
	}
	if len(requires) > 0 {
		variant["requires"] = requires
	}
	recipe := map[string]any{
		"apiVersion": "kubepkg.dev/v1alpha1",
		"kind":       "Recipe",
		"metadata": map[string]any{
			"name": pkg,
			"annotations": map[string]string{
				"kubepkg.dev/description": g.Title + ": " + g.Wow,
				"kubepkg.dev/home":        atlas.ForCard(g).URL(),
			},
		},
		"spec": map[string]any{
			"version": version, "build": 1,
			"sources": map[string]any{"chart": map[string]string{"dir": "charts/" + g.ID}},
			"charts":  map[string]any{g.ID: map[string]any{"from": []string{"chart"}}},
			"package": map[string]any{
				"provides": []string{pkg},
				"crds":     []string{},
				"rollback": map[string]bool{"safe": true},
				"variants": []any{variant},
			},
		},
	}
	if err := writeYAML(filepath.Join(dir, "recipe.yaml"), recipe); err != nil {
		return err
	}
	if err := writeYAML(filepath.Join(chart, "Chart.yaml"), map[string]any{
		"apiVersion": "v2", "name": g.ID, "version": version, "type": "application",
		"description": g.Title + " — a genre of the Sankofa atlas",
	}); err != nil {
		return err
	}
	var docs []string
	for _, id := range s.Order {
		if owner[id] != g.ID {
			continue
		}
		o := v1alpha1.FromCard(s.Resolved(s.ByID[id]))
		o.Labels["sankofa.kuberoot.dev/genre"] = g.ID
		data, err := yaml.Marshal(o)
		if err != nil {
			return err
		}
		if strings.Contains(string(data), "{{") || strings.Contains(string(data), "}}") {
			return fmt.Errorf("card %s contains Helm template braces", id)
		}
		docs = append(docs, string(data))
	}
	return os.WriteFile(filepath.Join(chart, "templates", "cards.yaml"), []byte(strings.Join(docs, "---\n")), 0o644)
}

func writeYAML(p string, v any) error {
	data, err := yaml.Marshal(v)
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}
