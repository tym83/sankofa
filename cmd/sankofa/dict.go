package main

import (
	"fmt"
	"io"
	"math/rand/v2"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"github.com/tym83/sankofa/pkg/atlas"
	"github.com/tym83/sankofa/pkg/card"
	"github.com/tym83/sankofa/pkg/reader"
)

func dictCmd() *cobra.Command {
	var plain bool
	c := &cobra.Command{
		Use:   "dict [CARD]",
		Short: "Read the dictionary: follow links between cards, endlessly",
		Long: `An endless dictionary in the manner of Pavić's Dictionary of the Khazars.
Links are marked with the book they lead to: ❝ voices, ▤ archives, ✶ heirs.

Keys: tab/shift+tab select a link, enter follow it, backspace go back,
/ or i the index with search, e trade your copy (male/female edition),
r random card, o show the atlas link, q quit.`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := loadCards(cmd)
			if err != nil {
				return err
			}
			st, err := reader.Load()
			if err != nil {
				return err
			}
			start := ""
			if len(args) == 1 {
				start = args[0]
			} else {
				start = unreadCard(s, st)
			}
			c := s.ForEdition(start, st.Edition)
			if c == nil {
				return fmt.Errorf("no card %q", start)
			}
			c = s.Resolved(c)
			if plain || !isTerminal(cmd.OutOrStdout()) {
				st.Visit(c.ID)
				_ = st.Save()
				printCard(cmd.OutOrStdout(), s, c, false)
				return nil
			}
			m := newDictModel(s, st, c)
			if _, err := tea.NewProgram(m, tea.WithAltScreen()).Run(); err != nil {
				return err
			}
			return st.Save()
		},
	}
	c.Flags().BoolVar(&plain, "plain", false, "print the card instead of opening the reader")
	c.AddCommand(pathCmd())
	return c
}

func pathCmd() *cobra.Command {
	c := &cobra.Command{Use: "path", Short: "Your own book: the path you walked through the dictionary"}
	c.AddCommand(&cobra.Command{
		Use:   "export",
		Short: "Print a link that replays your path in the museum",
		RunE: func(cmd *cobra.Command, _ []string) error {
			st, err := reader.Load()
			if err != nil {
				return err
			}
			if len(st.Path) == 0 {
				return fmt.Errorf("your path is empty: open some cards with `sankofa dict` first")
			}
			p := atlas.Point{Focus: st.Path[0], Path: st.Path, Lang: lang}
			fmt.Fprintln(cmd.OutOrStdout(), p.URL())
			return nil
		},
	})
	c.AddCommand(&cobra.Command{
		Use:   "import URL",
		Short: "Walk someone else's path: it may hold the other edition's voice",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			s, err := loadCards(cmd)
			if err != nil {
				return err
			}
			p, err := atlas.Parse(args[0])
			if err != nil {
				return err
			}
			for _, id := range p.Path {
				if c := s.ByID[id]; c != nil {
					printCard(cmd.OutOrStdout(), s, c, false)
					fmt.Fprintln(cmd.OutOrStdout())
				}
			}
			return nil
		},
	})
	return c
}

// unreadCard picks a card the reader has not opened yet.
func unreadCard(s *card.Set, st *reader.State) string {
	var fresh []string
	for _, id := range s.Order {
		if !st.Seen(id) && s.ByID[id].Edition == card.EditionBoth {
			fresh = append(fresh, id)
		}
	}
	if len(fresh) == 0 {
		fresh = s.Order
	}
	return fresh[rand.IntN(len(fresh))]
}

func isTerminal(w io.Writer) bool {
	f, ok := w.(*os.File)
	if !ok {
		return false
	}
	fi, err := f.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}

func booksOf(c *card.Card) string {
	var b []string
	for _, k := range c.Books {
		b = append(b, card.BookSymbols[k])
	}
	return strings.Join(b, "")
}

func yearsOf(c *card.Card) string {
	switch len(c.Years) {
	case 1:
		return fmt.Sprint(c.Years[0])
	case 2:
		return fmt.Sprintf("%d–%d", c.Years[0], c.Years[1])
	}
	return ""
}

// printCard renders a card as plain text, with OSC 8 links when asked.
func printCard(w io.Writer, s *card.Set, c *card.Card, osc bool) {
	place := ""
	if len(c.Places) > 0 {
		place = c.Places[0].Name
	}
	fmt.Fprintf(w, "%s %s\n%s · %s · %s\n\n%s\n\n", booksOf(c), c.Title, yearsOf(c), place, tr(c.Kind), c.Wow)
	body := c.Body
	for _, l := range c.Links() {
		t := s.ByID[l.Target]
		sym := ""
		if t != nil && len(t.Books) > 0 {
			sym = card.BookSymbols[t.Books[0]]
		}
		body = strings.Replace(body, c.Body[l.Start:l.End], l.Text+sym, 1)
	}
	fmt.Fprintln(w, wrap(body, 78))
	if c.Dispute != "" {
		fmt.Fprintf(w, "\n%s%s\n", tr("Disputed: "), c.Dispute)
	}
	if len(c.Further) > 0 {
		fmt.Fprintln(w, "\n"+tr("Further:"))
		for _, f := range c.Further {
			fmt.Fprintln(w, "  ·", f)
		}
	}
	fmt.Fprintln(w, "\n"+tr("Sources:"))
	for _, src := range c.Sources {
		fmt.Fprintln(w, "  ·", atlas.Hyperlink(osc && src.URL != "", src.URL, src.Title))
	}
	u := cardPoint(c).URL()
	fmt.Fprintln(w, "\n"+tr("Atlas:"), atlas.Hyperlink(osc, u, u))
}

func wrap(s string, width int) string {
	var out []string
	for _, para := range strings.Split(s, "\n\n") {
		words := strings.Fields(para)
		line := ""
		for _, w := range words {
			if line != "" && lipgloss.Width(line)+1+lipgloss.Width(w) > width {
				out = append(out, line)
				line = w
				continue
			}
			if line == "" {
				line = w
			} else {
				line += " " + w
			}
		}
		out = append(out, line, "")
	}
	return strings.TrimRight(strings.Join(out, "\n"), "\n")
}

// --- interactive reader ---

var (
	stTitle  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#F2C14E"))
	stMeta   = lipgloss.NewStyle().Foreground(lipgloss.Color("#8A8A8A"))
	stWow    = lipgloss.NewStyle().Italic(true).Foreground(lipgloss.Color("#E07A5F"))
	stLink   = lipgloss.NewStyle().Underline(true).Foreground(lipgloss.Color("#81B29A"))
	stSel    = lipgloss.NewStyle().Reverse(true).Foreground(lipgloss.Color("#81B29A"))
	stDim    = lipgloss.NewStyle().Foreground(lipgloss.Color("#6C6C6C"))
	stFooter = lipgloss.NewStyle().Foreground(lipgloss.Color("#5F87AF"))
)

type dictModel struct {
	set      *card.Set
	st       *reader.State
	cur      *card.Card
	back     []*card.Card
	sel      int
	width    int
	height   int
	showLink bool
	note     string

	// The index: every card, filtered by what the reader types.
	index bool
	query string
	pick  int
}

func newDictModel(s *card.Set, st *reader.State, c *card.Card) *dictModel {
	m := &dictModel{set: s, st: st, width: 80}
	m.open(c, false)
	return m
}

func (m *dictModel) open(c *card.Card, push bool) {
	if push && m.cur != nil {
		m.back = append(m.back, m.cur)
	}
	m.cur = m.set.Resolved(c)
	m.sel = 0
	m.showLink = false
	m.st.Visit(c.ID)
}

func (m *dictModel) Init() tea.Cmd { return nil }

func (m *dictModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = min(msg.Width, 100)
		m.height = msg.Height
	case tea.KeyMsg:
		if m.index {
			return m.updateIndex(msg)
		}
		m.note = ""
		links := m.cur.Links()
		switch msg.String() {
		case "q", "ctrl+c", "esc":
			return m, tea.Quit
		case "tab", "right", "down":
			if len(links) > 0 {
				m.sel = (m.sel + 1) % len(links)
			}
		case "shift+tab", "left", "up":
			if len(links) > 0 {
				m.sel = (m.sel - 1 + len(links)) % len(links)
			}
		case "enter":
			if len(links) > 0 {
				if t := m.set.ForEdition(links[m.sel].Target, m.st.Edition); t != nil {
					m.open(t, true)
				}
			}
		case "backspace", "b":
			if n := len(m.back); n > 0 {
				prev := m.back[n-1]
				m.back = m.back[:n-1]
				m.open(prev, false)
			}
		case "r":
			m.open(m.set.ForEdition(unreadCard(m.set, m.st), m.st.Edition), true)
		case "/", "i":
			m.index, m.query, m.pick = true, "", 0
		case "e":
			if m.st.Edition == card.EditionMale {
				m.st.Edition = card.EditionFemale
			} else {
				m.st.Edition = card.EditionMale
			}
			_ = m.st.Save()
			if m.cur.Pair != "" {
				m.open(m.set.ForEdition(m.cur.ID, m.st.Edition), false)
			}
			m.note = tr("Your copy is now") + ": " + editionName(m.st.Edition)
		case "o":
			m.showLink = !m.showLink
		}
	}
	return m, nil
}

// matches lists cards whose title, place or kind contains the query.
func (m *dictModel) matches() []*card.Card {
	q := strings.ToLower(m.query)
	var out []*card.Card
	for _, id := range m.set.Order {
		c := m.set.ByID[id]
		if c.Edition != card.EditionBoth && c.Edition != m.st.Edition {
			continue
		}
		hay := strings.ToLower(c.Title + " " + c.Places[0].Name + " " + tr(c.Kind) + " " + yearsOf(c))
		if q == "" || strings.Contains(hay, q) {
			out = append(out, c)
		}
	}
	return out
}

func (m *dictModel) updateIndex(k tea.KeyMsg) (tea.Model, tea.Cmd) {
	list := m.matches()
	switch k.Type {
	case tea.KeyEsc:
		m.index = false
	case tea.KeyCtrlC:
		return m, tea.Quit
	case tea.KeyEnter:
		if len(list) > 0 {
			m.index = false
			m.open(list[min(m.pick, len(list)-1)], true)
		}
	case tea.KeyUp, tea.KeyShiftTab:
		if m.pick > 0 {
			m.pick--
		}
	case tea.KeyDown, tea.KeyTab:
		if m.pick < len(list)-1 {
			m.pick++
		}
	case tea.KeyBackspace:
		if r := []rune(m.query); len(r) > 0 {
			m.query = string(r[:len(r)-1])
			m.pick = 0
		}
	case tea.KeyRunes, tea.KeySpace:
		m.query += string(k.Runes)
		if k.Type == tea.KeySpace {
			m.query += " "
		}
		m.pick = 0
	}
	return m, nil
}

func (m *dictModel) indexView() string {
	var b strings.Builder
	list := m.matches()
	b.WriteString(stTitle.Render(tr("Index")) + "  " + stMeta.Render(fmt.Sprintf(tr("%d cards"), len(list))) + "\n\n")
	b.WriteString("› " + m.query + "▏\n\n")
	rows := max(5, m.height-8)
	start := 0
	if m.pick >= rows {
		start = m.pick - rows + 1
	}
	for i := start; i < len(list) && i < start+rows; i++ {
		c := list[i]
		line := fmt.Sprintf("%s %-40s %s · %s", booksOf(c), trim(c.Title, 40), yearsOf(c), tr(c.Kind))
		if i == m.pick {
			b.WriteString(stSel.Render(line) + "\n")
		} else {
			b.WriteString(line + "\n")
		}
	}
	b.WriteString("\n" + stFooter.Render(tr("type to search · ↑↓ choose · enter open · esc back")))
	return b.String()
}

func (m *dictModel) View() string {
	if m.index {
		return m.indexView()
	}
	c := m.cur
	var b strings.Builder
	place := ""
	if len(c.Places) > 0 {
		place = c.Places[0].Name
	}
	b.WriteString(stTitle.Render(booksOf(c)+" "+c.Title) + "\n")
	b.WriteString(stMeta.Render(yearsOf(c)+" · "+place+" · "+tr(c.Kind)) + "\n\n")
	b.WriteString(stWow.Render(wrap(c.Wow, m.width-4)) + "\n\n")

	// Render the body with styled links. Wrap first on plain text, then style
	// link texts in place so wrapping stays correct.
	links := c.Links()
	var sb strings.Builder
	last := 0
	for i, l := range links {
		sb.WriteString(c.Body[last:l.Start])
		sym := ""
		if t := m.set.ByID[l.Target]; t != nil && len(t.Books) > 0 {
			sym = card.BookSymbols[t.Books[0]]
		}
		txt := strings.ReplaceAll(l.Text+sym, " ", " ")
		if i == m.sel {
			sb.WriteString("\x00S" + txt + "\x00E")
		} else {
			sb.WriteString("\x00L" + txt + "\x00E")
		}
		last = l.End
	}
	sb.WriteString(c.Body[last:])
	body := wrap(sb.String(), m.width-4)
	body = styleMarks(body)
	b.WriteString(body + "\n")

	if c.Dispute != "" {
		b.WriteString("\n" + stWow.Render(tr("Disputed: ")) + wrap(c.Dispute, m.width-14) + "\n")
	}
	if len(c.Further) > 0 {
		b.WriteString("\n" + stMeta.Render(tr("Further")) + "\n")
		for _, f := range c.Further {
			b.WriteString("  · " + f + "\n")
		}
	}
	if bl := m.set.Backlinks(c.ID); len(bl) > 0 {
		b.WriteString("\n" + stMeta.Render(tr("← referenced by: ")) + strings.Join(bl, ", ") + "\n")
	}
	b.WriteString("\n" + stDim.Render(tr("Sources")+": "+sourceTitles(c)) + "\n")
	if m.showLink {
		u := cardPoint(c).URL()
		b.WriteString("\n" + stFooter.Render(tr("Atlas: ")) + atlas.Hyperlink(true, u, u) + "\n")
	}
	ed := tr("male")
	if m.st.Edition == card.EditionFemale {
		ed = tr("female")
	}
	if m.note != "" {
		b.WriteString("\n" + stWow.Render(m.note))
	}
	b.WriteString("\n" + stFooter.Render(fmt.Sprintf(tr("tab link · enter open · backspace back · / index · r random · e copy · o atlas · q quit   [%s copy · %d read]"), ed, len(m.st.Path))))
	return b.String()
}

func styleMarks(s string) string {
	var out strings.Builder
	for {
		i := strings.Index(s, "\x00")
		if i < 0 {
			out.WriteString(s)
			break
		}
		out.WriteString(s[:i])
		kind := s[i+1]
		j := strings.Index(s[i:], "\x00E")
		txt := strings.ReplaceAll(s[i+2:i+j], " ", " ")
		if kind == 'S' {
			out.WriteString(stSel.Render(txt))
		} else {
			out.WriteString(stLink.Render(txt))
		}
		s = s[i+j+2:]
	}
	return out.String()
}

func sourceTitles(c *card.Card) string {
	var t []string
	for _, s := range c.Sources {
		t = append(t, s.Title)
	}
	return strings.Join(t, "; ")
}
