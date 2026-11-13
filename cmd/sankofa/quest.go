package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/tym83/sankofa/api/v1alpha1"
	"github.com/tym83/sankofa/pkg/card"
	"github.com/tym83/sankofa/pkg/reader"
)

func questCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "quest [NAME]",
		Short: "Play a quest: a real dilemma, a quiz, a walk through the dictionary",
		Long: `Dilemmas put you in front of a choice a real person once made. There is
no right answer and no score: after you choose, you learn what they chose
and what it cost. Quizzes have answers. Walks ask you to get from one card
to another through links, within a budget.`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			qs, err := loadQuestList(cmd)
			if err != nil {
				return err
			}
			st, err := reader.Load()
			if err != nil {
				return err
			}
			w := cmd.OutOrStdout()
			if len(args) == 0 {
				for _, q := range qs {
					mark := " "
					if done(st, q.Name) {
						mark = "✓"
					}
					fmt.Fprintf(w, "%s %-24s %-8s %s\n", mark, q.Name, q.Spec.Type, q.Spec.Title)
				}
				return nil
			}
			for i := range qs {
				if qs[i].Name == args[0] {
					return play(cmd, &qs[i], st)
				}
			}
			return fmt.Errorf("no quest %q", args[0])
		},
	}
	return c
}

func done(st *reader.State, name string) bool {
	for _, d := range st.Done {
		if d == name {
			return true
		}
	}
	return false
}

func loadQuestList(cmd *cobra.Command) ([]v1alpha1.Quest, error) {
	if dir, _ := cmd.Flags().GetString("content"); dir != "" {
		qs, err := v1alpha1.LoadQuests(os.DirFS(filepath.Join(dir, "..", "quests")))
		if err != nil {
			return nil, err
		}
		out := make([]v1alpha1.Quest, len(qs))
		for i, q := range qs {
			out[i] = *q
		}
		return out, nil
	}
	cl, err := kubeClient()
	if err != nil {
		return nil, err
	}
	var list v1alpha1.QuestList
	if err := cl.List(context.Background(), &list); err != nil {
		return nil, err
	}
	return list.Items, nil
}

func play(cmd *cobra.Command, q *v1alpha1.Quest, st *reader.State) error {
	if t, ok := q.Spec.Translations[lang]; ok {
		q.Spec.Title, q.Spec.Prompt, q.Spec.Reveal = t.Title, t.Prompt, t.Reveal
		if len(t.Choices) == len(q.Spec.Choices) {
			q.Spec.Choices = t.Choices
		}
	}
	w := cmd.OutOrStdout()
	in := bufio.NewReader(cmd.InOrStdin())
	fmt.Fprintf(w, "%s\n\n%s\n\n", stTitle.Render(q.Spec.Title), wrap(q.Spec.Prompt, 78))
	switch q.Spec.Type {
	case "dilemma", "quiz":
		for i, ch := range q.Spec.Choices {
			fmt.Fprintf(w, "  %d. %s\n", i+1, ch)
		}
		n := ask(w, in, len(q.Spec.Choices))
		if n < 0 {
			return nil
		}
		fmt.Fprintln(w)
		if q.Spec.Type == "quiz" && q.Spec.Answer != nil {
			if n == *q.Spec.Answer {
				fmt.Fprintln(w, stLink.Render(tr("Right.")))
			} else {
				fmt.Fprintf(w, "%s "+tr("The answer is:")+" %s\n", stWow.Render(tr("Not quite.")), q.Spec.Choices[*q.Spec.Answer])
			}
		} else {
			fmt.Fprintln(w, stMeta.Render(tr("There is no right answer. Here is what happened:")))
		}
	case "walk":
		s, err := loadCards(cmd)
		if err != nil {
			return err
		}
		steps, ok := walked(s, st.Path, q.Spec.From, q.Spec.To)
		switch {
		case !ok:
			fmt.Fprintf(w, "Open `sankofa dict %s` and follow links until you reach %q. Then run this quest again.\n", q.Spec.From, titleOf(s, q.Spec.To))
			return nil
		case q.Spec.MaxSteps > 0 && steps > q.Spec.MaxSteps:
			fmt.Fprintf(w, "You got there in %d steps; the budget is %d. Try a shorter way.\n", steps, q.Spec.MaxSteps)
			return nil
		default:
			fmt.Fprintf(w, "%s You walked it in %d steps.\n", stLink.Render("Done."), steps)
		}
	case "cluster":
		fmt.Fprintf(w, "This quest is solved in the cluster: %s\n", q.Spec.Check)
		return nil
	}
	fmt.Fprintln(w, wrap(q.Spec.Reveal, 78))
	if len(q.Spec.Cards) > 0 {
		fmt.Fprintf(w, "\n"+tr("Read on: sankofa dict %s\n"), q.Spec.Cards[0])
	}
	if !done(st, q.Name) {
		st.Done = append(st.Done, q.Name)
	}
	return st.Save()
}

func ask(w io.Writer, in *bufio.Reader, n int) int {
	for {
		fmt.Fprintf(w, "\n"+tr("Your choice (1-%d, q to quit): "), n)
		line, err := in.ReadString('\n')
		line = strings.TrimSpace(line)
		if line == "q" || (err != nil && line == "") {
			return -1
		}
		if i, e := strconv.Atoi(line); e == nil && i >= 1 && i <= n {
			return i - 1
		}
	}
}

// walked finds the shortest stretch of the reader's path from one card to
// another in which every step follows a link.
func walked(s *card.Set, path []string, from, to string) (int, bool) {
	best, found := 0, false
	for i, id := range path {
		if id != from {
			continue
		}
		for j := i + 1; j < len(path); j++ {
			prev := s.ByID[path[j-1]]
			if prev == nil || !linksTo(s, prev, path[j]) {
				break
			}
			if path[j] == to {
				if !found || j-i < best {
					best, found = j-i, true
				}
				break
			}
		}
	}
	return best, found
}

func linksTo(s *card.Set, c *card.Card, id string) bool {
	for _, l := range c.Links() {
		if l.Target == id || s.ForEdition(l.Target, card.EditionMale).ID == id || s.ForEdition(l.Target, card.EditionFemale).ID == id {
			return true
		}
	}
	return false
}

func titleOf(s *card.Set, id string) string {
	if c := s.ByID[id]; c != nil {
		return c.Title
	}
	return id
}
