package main

import (
	"fmt"
	"math"
	"sort"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"github.com/tym83/sankofa/pkg/atlas"
	"github.com/tym83/sankofa/pkg/card"
	"github.com/tym83/sankofa/pkg/reader"
)

const (
	yearMin = 1300
	yearMax = 2026
)

func atlasCmd() *cobra.Command {
	var at string
	c := &cobra.Command{
		Use:   "atlas",
		Short: "The atlas in the terminal: a map, a timeline and the cards on them",
		Long: `Zoom is a level of generalisation, not just of scale: 1 shows five centuries
and the whole Atlantic, 2 regions, 3 cities and genres, 4 people, 5 a single
document. Every point opens in the web museum at the same place.

Keys: arrows move, + and - zoom, [ and ] move in time, { and } widen or
narrow the time window, tab picks the next card, enter reads it,
o shows the museum link, q quits.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			s, err := loadCards(cmd)
			if err != nil {
				return err
			}
			st, err := reader.Load()
			if err != nil {
				return err
			}
			m := newAtlasModel(s, st)
			if at != "" {
				p, err := atlas.Parse(at)
				if err != nil {
					return err
				}
				m.goTo(p)
			}
			if !isTerminal(cmd.OutOrStdout()) {
				m.width, m.height = 100, 36
				fmt.Fprintln(cmd.OutOrStdout(), m.View())
				return nil
			}
			if _, err := tea.NewProgram(m, tea.WithAltScreen()).Run(); err != nil {
				return err
			}
			return st.Save()
		},
	}
	c.Flags().StringVar(&at, "at", "", "open at a museum link or fragment, e.g. 't=1900-1935&zoom=3&focus=blues'")
	return c
}

type atlasModel struct {
	set           *card.Set
	st            *reader.State
	view          atlas.View
	zoom          int
	from, to      int
	sel           string
	width, height int
	showLink      bool
}

func newAtlasModel(s *card.Set, st *reader.State) *atlasModel {
	return &atlasModel{set: s, st: st, view: atlas.DefaultView, zoom: 1, from: yearMin, to: yearMax, width: 100, height: 36}
}

func (m *atlasModel) goTo(p atlas.Point) {
	if p.Zoom != 0 {
		m.zoom = p.Zoom
		m.view.Span = atlas.Spans[p.Zoom]
	}
	if p.From != 0 {
		m.from, m.to = p.From, p.From
		if p.To != 0 {
			m.to = p.To
		}
		// Show some context around a single moment.
		if m.to-m.from < 20 {
			m.from, m.to = m.from-10, m.to+10
		}
	}
	if c := m.set.ByID[p.Focus]; c != nil {
		m.sel = c.ID
		m.view.Lon, m.view.Lat = c.Places[0].Lon, c.Places[0].Lat
	}
}

// visible lists cards inside the time window that belong to this level of
// generalisation, nearest to the centre first.
func (m *atlasModel) visible() []*card.Card {
	var out []*card.Card
	for _, id := range m.set.Order {
		c := m.set.ByID[id]
		if c.Edition != card.EditionBoth && c.Edition != m.st.Edition {
			continue
		}
		if c.Zoom < m.zoom-1 || c.Zoom > m.zoom+1 {
			continue
		}
		from, to := c.Years[0], c.Years[len(c.Years)-1]
		if to < m.from || from > m.to {
			continue
		}
		out = append(out, c)
	}
	d := func(c *card.Card) float64 {
		return math.Hypot(c.Places[0].Lon-m.view.Lon, c.Places[0].Lat-m.view.Lat)
	}
	sort.SliceStable(out, func(i, j int) bool { return d(out[i]) < d(out[j]) })
	return out
}

func (m *atlasModel) Init() tea.Cmd { return nil }

func (m *atlasModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
	case tea.KeyMsg:
		step := m.view.Span / 10
		window := m.to - m.from
		switch msg.String() {
		case "q", "ctrl+c", "esc":
			return m, tea.Quit
		case "left", "h":
			m.view.Lon -= step
		case "right", "l":
			m.view.Lon += step
		case "up", "k":
			m.view.Lat = math.Min(80, m.view.Lat+step*0.6)
		case "down", "j":
			m.view.Lat = math.Max(-60, m.view.Lat-step*0.6)
		case "+", "=":
			if m.zoom < 5 {
				m.zoom++
				m.view.Span = atlas.Spans[m.zoom]
				if c := m.set.ByID[m.sel]; c != nil {
					m.view.Lon, m.view.Lat = c.Places[0].Lon, c.Places[0].Lat
				}
			}
		case "-", "_":
			if m.zoom > 1 {
				m.zoom--
				m.view.Span = atlas.Spans[m.zoom]
			}
		case "[":
			shift := max(5, window/4)
			m.from, m.to = max(yearMin, m.from-shift), max(yearMin+window, m.to-shift)
		case "]":
			shift := max(5, window/4)
			m.from, m.to = min(yearMax-window, m.from+shift), min(yearMax, m.to+shift)
		case "{":
			m.from, m.to = max(yearMin, m.from-window/4-5), min(yearMax, m.to+window/4+5)
		case "}":
			if window > 20 {
				m.from, m.to = m.from+window/4, m.to-window/4
			}
		case "tab":
			vis := m.visible()
			if len(vis) > 0 {
				i := 0
				for k, c := range vis {
					if c.ID == m.sel {
						i = k + 1
					}
				}
				m.sel = vis[i%len(vis)].ID
			}
		case "enter":
			if c := m.set.ByID[m.sel]; c != nil {
				d := newDictModel(m.set, m.st, c)
				d.width = min(m.width, 100)
				return d, nil
			}
		case "o":
			m.showLink = !m.showLink
		}
	}
	return m, nil
}

var (
	stLand  = lipgloss.NewStyle().Foreground(lipgloss.Color("#3A4A5A"))
	stPoint = lipgloss.NewStyle().Foreground(lipgloss.Color("#F2C14E")).Bold(true)
	stHere  = lipgloss.NewStyle().Foreground(lipgloss.Color("#E07A5F")).Bold(true)
	stTime  = lipgloss.NewStyle().Foreground(lipgloss.Color("#81B29A"))
)

var eras = []struct {
	ID   string
	From int
	Name string
}{
	{"v0", 1300, "Africa before"}, {"v1", 1500, "Middle Passage"}, {"v2", 1650, "Resistance"},
	{"v3", 1760, "Voices"}, {"v4", 1800, "Diaspora"}, {"v5", 1900, "Harlem & Négritude"},
	{"v6", 1950, "Civil rights"}, {"v7", 1970, "Afrofuturism"},
}

func (m *atlasModel) View() string {
	panelW := 34
	mapW := max(30, m.width-panelW-3)
	mapH := max(10, m.height-8)
	land := m.view.Braille(mapW, mapH)
	grid := make([][]string, mapH)
	for r, line := range land {
		for _, ch := range line {
			grid[r] = append(grid[r], stLand.Render(string(ch)))
		}
	}
	vis := m.visible()
	if m.sel == "" && len(vis) > 0 {
		m.sel = vis[0].ID
	}
	for _, c := range vis {
		for i, p := range c.Places {
			col, row, ok := m.view.Cell(p.Lon, p.Lat, mapW, mapH)
			if !ok {
				continue
			}
			mark := "●"
			if i > 0 {
				mark = "·"
			}
			if c.ID == m.sel {
				grid[row][col] = stHere.Render("◉")
			} else if grid[row][col] != stHere.Render("◉") {
				grid[row][col] = stPoint.Render(mark)
			}
		}
	}
	var mapLines []string
	for _, r := range grid {
		mapLines = append(mapLines, strings.Join(r, ""))
	}

	// The side panel: the selected card, briefly.
	var panel []string
	if c := m.set.ByID[m.sel]; c != nil {
		panel = append(panel, stTitle.Render(c.Title), stMeta.Render(yearsOf(c)+" · "+c.Places[0].Name), "")
		panel = append(panel, strings.Split(stWow.Render(wrap(c.Wow, panelW)), "\n")...)
		panel = append(panel, "", stDim.Render("enter: read · tab: next"))
	} else {
		panel = append(panel, stDim.Render("Nothing here in this time window."), stDim.Render("Try - to zoom out or { to widen time."))
	}
	panel = append(panel, "", stMeta.Render(fmt.Sprintf("%d cards in view", len(vis))))
	var b strings.Builder
	for i := 0; i < mapH; i++ {
		b.WriteString(mapLines[i])
		if i < len(panel) {
			b.WriteString("   " + panel[i])
		}
		b.WriteString("\n")
	}

	// The timeline: five centuries, the window highlighted, eras marked.
	tw := mapW
	bar := []rune(strings.Repeat("─", tw))
	pos := func(y int) int { return min(tw-1, max(0, (y-yearMin)*tw/(yearMax-yearMin))) }
	for i := pos(m.from); i <= pos(m.to); i++ {
		bar[i] = '━'
	}
	var labels []rune = []rune(strings.Repeat(" ", tw+10))
	for _, e := range eras {
		p := pos(e.From)
		bar[p] = '┼'
		copy(labels[p:], []rune(e.ID))
	}
	b.WriteString(stTime.Render(string(bar)) + "\n")
	b.WriteString(stDim.Render(string(labels[:tw])) + "\n")
	b.WriteString(fmt.Sprintf("%s  zoom %d  %d–%d\n", stMeta.Render("Sankofa atlas"), m.zoom, m.from, m.to))
	p := atlas.Point{From: m.from, To: m.to, Zoom: m.zoom, Focus: m.sel, Lang: lang}
	if m.showLink {
		u := p.URL()
		b.WriteString(stFooter.Render("Museum: ") + atlas.Hyperlink(true, u, u) + "\n")
	}
	b.WriteString(stFooter.Render("arrows move · +/- zoom · [ ] time · { } window · tab card · enter read · o link · q quit"))
	return b.String()
}
