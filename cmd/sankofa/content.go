package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"sigs.k8s.io/yaml"

	"github.com/tym83/sankofa/api/v1alpha1"
	"github.com/tym83/sankofa/pkg/card"
)

func contentCmd() *cobra.Command {
	c := &cobra.Command{Use: "content", Short: "Work with the card collection"}
	c.AddCommand(&cobra.Command{
		Use:   "lint DIR",
		Short: "Validate cards: sources, links, coordinates, length",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := card.LoadDir(args[0])
			if err != nil {
				return err
			}
			errs := s.Validate()
			errs = append(errs, lintQuests(filepath.Join(args[0], "..", "quests"), s)...)
			errs = append(errs, lintChapters(filepath.Join(args[0], "..", "chapters"), s)...)
			for _, e := range errs {
				fmt.Fprintln(cmd.ErrOrStderr(), e)
			}
			if len(errs) > 0 {
				return fmt.Errorf("%d problems in %d cards", len(errs), len(s.Order))
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%d cards OK\n", len(s.Order))
			return nil
		},
	})
	var out string
	exp := &cobra.Command{
		Use:   "export DIR",
		Short: "Export cards as JSON for the web museum",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := card.LoadDir(args[0])
			if err != nil {
				return err
			}
			if errs := s.Validate(); len(errs) > 0 {
				return fmt.Errorf("content does not lint: %v", errs[0])
			}
			data, err := json.MarshalIndent(Export(s), "", " ")
			if err != nil {
				return err
			}
			if out == "-" {
				_, err = cmd.OutOrStdout().Write(data)
				return err
			}
			if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
				return err
			}
			return os.WriteFile(out, data, 0o644)
		},
	}
	exp.Flags().StringVarP(&out, "out", "o", "-", "output file")
	c.AddCommand(exp)
	return c
}

// ExportedCard is a card as the web museum sees it.
type ExportedCard struct {
	*card.Card
	Backlinks []string `json:"backlinks"`
}

// Export prepares a card set for the web museum.
func Export(s *card.Set) map[string]any {
	cards := make([]ExportedCard, 0, len(s.Order))
	for _, id := range s.Order {
		cards = append(cards, ExportedCard{Card: s.Resolved(s.ByID[id]), Backlinks: s.Backlinks(id)})
	}
	return map[string]any{"version": 1, "cards": cards}
}

// lintQuests checks quests against the cards they reference.
func lintQuests(dir string, s *card.Set) []error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil
	}
	qs, err := v1alpha1.LoadQuests(os.DirFS(dir))
	if err != nil {
		return []error{err}
	}
	var errs []error
	for _, q := range qs {
		bad := func(f string, a ...any) {
			errs = append(errs, fmt.Errorf("quest %s: %s", q.Name, fmt.Sprintf(f, a...)))
		}
		sp := q.Spec
		if sp.Title == "" || sp.Prompt == "" || sp.Reveal == "" {
			bad("needs title, prompt and reveal")
		}
		switch sp.Type {
		case "dilemma", "quiz":
			if len(sp.Choices) < 2 {
				bad("needs at least two choices")
			}
			if sp.Type == "quiz" && (sp.Answer == nil || *sp.Answer < 0 || *sp.Answer >= len(sp.Choices)) {
				bad("quiz needs a valid answer index")
			}
			if sp.Type == "dilemma" && sp.Answer != nil {
				bad("a dilemma has no right answer")
			}
		case "walk":
			if s.ByID[sp.From] == nil || s.ByID[sp.To] == nil {
				bad("walk needs existing from and to cards")
			}
		case "cluster":
			if sp.Check == "" {
				bad("cluster quest needs a check")
			}
		default:
			bad("unknown type %q", sp.Type)
		}
		for _, c := range sp.Cards {
			if s.ByID[c] == nil {
				bad("unknown card %q", c)
			}
		}
	}
	return errs
}

// chapter is the front matter of a museum chapter.
type chapter struct {
	ID     string       `json:"id"`
	Title  string       `json:"title"`
	Kicker string       `json:"kicker"`
	Years  []int        `json:"years"`
	Hero   *card.Media  `json:"hero,omitempty"`
	Places []card.Place `json:"places,omitempty"`
	Cards  []string     `json:"cards"`
}

// lintChapters checks chapters against the cards: ids, links and length.
func lintChapters(dir string, s *card.Set) []error {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return []error{err}
	}
	var errs []error
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".md" || strings.HasSuffix(e.Name(), ".ru.md") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return append(errs, err)
		}
		bad := func(f string, a ...any) {
			errs = append(errs, fmt.Errorf("chapter %s: %s", e.Name(), fmt.Sprintf(f, a...)))
		}
		parts := strings.SplitN(string(data), "\n---\n", 2)
		if !strings.HasPrefix(string(data), "---\n") || len(parts) != 2 {
			bad("missing front matter")
			continue
		}
		var ch chapter
		if err := yaml.UnmarshalStrict([]byte(strings.TrimPrefix(parts[0], "---\n")), &ch); err != nil {
			bad("front matter: %v", err)
			continue
		}
		if ch.ID == "" || ch.Title == "" {
			bad("needs id and title")
		}
		for _, id := range ch.Cards {
			if s.ByID[id] == nil {
				bad("unknown card %q", id)
			}
		}
		body := &card.Card{Body: parts[1]}
		for _, l := range body.Links() {
			if s.ByID[l.Target] == nil {
				bad("link to unknown card %q", l.Target)
			}
		}
		if n := len(strings.Fields(body.PlainBody())); n < 80 || n > 450 {
			bad("text has %d words, want 80..450", n)
		}
		errs = append(errs, lintChapterTranslation(dir, e.Name(), parts[1], bad)...)
	}
	return errs
}

type chapterText struct {
	Title       string `json:"title"`
	Kicker      string `json:"kicker"`
	HeroCaption string `json:"heroCaption,omitempty"`
}

// lintChapterTranslation checks <id>.<lang>.md: same links, same paragraphs.
func lintChapterTranslation(dir, name, original string, bad func(string, ...any)) []error {
	for _, lang := range card.Languages {
		data, err := os.ReadFile(filepath.Join(dir, strings.TrimSuffix(name, ".md")+"."+lang+".md"))
		if err != nil {
			continue
		}
		parts := strings.SplitN(string(data), "\n---\n", 2)
		if !strings.HasPrefix(string(data), "---\n") || len(parts) != 2 {
			bad("%s translation: missing front matter", lang)
			continue
		}
		var t chapterText
		if err := yaml.UnmarshalStrict([]byte(strings.TrimPrefix(parts[0], "---\n")), &t); err != nil {
			bad("%s translation: %v", lang, err)
			continue
		}
		if t.Title == "" || t.Kicker == "" {
			bad("%s translation needs title and kicker", lang)
		}
		paras := func(s string) int {
			n := 0
			for _, p := range strings.Split(strings.TrimSpace(s), "\n\n") {
				if strings.TrimSpace(p) != "" {
					n++
				}
			}
			return n
		}
		if a, b := paras(original), paras(parts[1]); a != b {
			bad("%s translation has %d paragraphs, want %d (one per scroll step)", lang, b, a)
		}
		want := map[string]bool{}
		for _, l := range (&card.Card{Body: original}).Links() {
			want[l.Target] = true
		}
		for _, l := range (&card.Card{Body: parts[1]}).Links() {
			delete(want, l.Target)
		}
		for id := range want {
			bad("%s translation lost the link to %q", lang, id)
		}
	}
	return nil
}
