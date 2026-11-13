package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/tym83/sankofa/content"
	"github.com/tym83/sankofa/pkg/atlas"
	"github.com/tym83/sankofa/pkg/roots"
)

func loadRoots(cmd *cobra.Command) (*roots.Set, error) {
	if dir, _ := cmd.Flags().GetString("content"); dir != "" {
		return roots.LoadDir(filepath.Join(dir, "..", "roots"))
	}
	return roots.LoadFS(content.Roots())
}

func rootsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "roots [ARTIST]",
		Short: "Trace how an artist stands on Black traditions, link by sourced link",
		Long: `Pick an artist or a band — Metallica, Oasis, Taylor Swift — and follow the
documented chain of influence back to the museum: to the blues, rock'n'roll,
reggae, the banjo. Every link names its sources. Without an argument, lists
everyone in the collection.`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rs, err := loadRoots(cmd)
			if err != nil {
				return err
			}
			cards, err := loadCards(cmd)
			if err != nil {
				return err
			}
			w := cmd.OutOrStdout()
			name := func(a *roots.Artist) string {
				if lang == "ru" && a.NameRU != "" {
					return a.NameRU
				}
				return a.Name
			}
			if len(args) == 0 {
				for _, id := range rs.Order {
					a := rs.ByID[id]
					g := a.Genre
					if lang == "ru" && a.GenreRU != "" {
						g = a.GenreRU
					}
					fmt.Fprintf(w, "%-28s %s · %s\n", name(a), g, (&cardYears{a.Years}).String())
				}
				return nil
			}
			found := rs.Find(args[0])
			if len(found) == 0 {
				return fmt.Errorf("%s: %q", tr("no such artist in the collection"), args[0])
			}
			a := found[0]
			paths, err := rs.Paths(a.ID, 8)
			if err != nil {
				return err
			}
			osc := isTerminal(w)
			fmt.Fprintf(w, "%s\n\n", stTitle.Render(name(a)))
			for i, p := range paths {
				if i > 0 {
					fmt.Fprintln(w)
				}
				for _, st := range p {
					claim := st.Link.Claim
					if lang == "ru" && st.Link.ClaimRU != "" {
						claim = st.Link.ClaimRU
					}
					from := name(rs.ByID[st.From])
					kind, ref, _ := strings.Cut(st.Link.To, ":")
					to := ref
					if kind == "root" {
						to = name(rs.ByID[ref])
					} else if c := cards.ByID[ref]; c != nil {
						u := cardPoint(c).URL()
						to = atlas.Hyperlink(osc, u, stLink.Render(c.Title))
					}
					indent := strings.Repeat("   ", st.Depth)
					fmt.Fprintf(w, "%s%s → %s\n", indent, from, to)
					for _, line := range strings.Split(wrap(claim, 74-len(indent)), "\n") {
						fmt.Fprintf(w, "%s   %s\n", indent, stDim.Render(line))
					}
					var srcs []string
					for _, s := range st.Link.Sources {
						srcs = append(srcs, atlas.Hyperlink(osc, s.URL, s.Title))
					}
					fmt.Fprintf(w, "%s   %s %s\n", indent, stMeta.Render(tr("Sources")+":"), strings.Join(srcs, "; "))
				}
			}
			return nil
		},
	}
}

type cardYears struct{ y []int }

func (c *cardYears) String() string {
	switch len(c.y) {
	case 1:
		return fmt.Sprint(c.y[0])
	case 2:
		return fmt.Sprintf("%d–%d", c.y[0], c.y[1])
	}
	return ""
}
