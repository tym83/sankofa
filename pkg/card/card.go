// Package card defines the Sankofa card format: a short, sourced piece of
// culture with coordinates in time and space, written to make people say "wow"
// and go further.
package card

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"sigs.k8s.io/yaml"
)

// Kinds of cards.
const (
	KindPerson     = "person"
	KindGenre      = "genre"
	KindPlace      = "place"
	KindObject     = "object"
	KindLanguage   = "language"
	KindScript     = "script"
	KindInstrument = "instrument"
	KindEvent      = "event"
	KindMedia      = "media"
	KindWork       = "work"
	KindMyth       = "myth"
	KindComparison = "comparison"
)

var validKinds = map[string]bool{
	KindPerson: true, KindGenre: true, KindPlace: true, KindObject: true,
	KindLanguage: true, KindScript: true, KindInstrument: true, KindEvent: true,
	KindMedia: true, KindWork: true, KindMyth: true, KindComparison: true,
}

// Books, after Pavić: the same world told by different hands.
const (
	BookVoices   = "voices"   // told by the people themselves
	BookArchives = "archives" // the record kept by those who traded and ruled
	BookHeirs    = "heirs"    // diaspora, memory, art, descendants' debates
)

// BookSymbols marks a link with the book it leads to.
var BookSymbols = map[string]string{
	BookVoices:   "❝",
	BookArchives: "▤",
	BookHeirs:    "✶",
}

// Editions, after the male and female copies of the Dictionary of the Khazars.
const (
	EditionBoth   = "both"
	EditionMale   = "m"
	EditionFemale = "f"
)

// MaxBodyWords keeps cards short: enough to inspire, not an encyclopedia entry.
const MaxBodyWords = 130

// Place is a point on the atlas.
type Place struct {
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

// Source backs every fact on the card.
type Source struct {
	Title string `json:"title"`
	URL   string `json:"url,omitempty"`
}

// Media is an image or a recording attached to a card. Only public-domain or
// openly licensed files.
type Media struct {
	Type    string `json:"type"` // image | audio
	File    string `json:"file"` // path relative to content/media
	Caption string `json:"caption,omitempty"`
	Credit  string `json:"credit"`
	License string `json:"license"`
	URL     string `json:"url,omitempty"` // where the original lives
}

// Card is one entry of the dictionary.
type Card struct {
	ID      string   `json:"id"`
	Kind    string   `json:"kind"`
	Title   string   `json:"title"`
	Wow     string   `json:"wow"`           // one-line hook shown in crumbs
	Years   []int    `json:"years"`         // [from] or [from, to]
	Places  []Place  `json:"places"`        // first is the main point
	Zoom    int      `json:"zoom"`          // 1..5, see docs/card-format.md
	Era     string   `json:"era,omitempty"` // v0..v7
	Books   []string `json:"books"`         // voices | archives | heirs
	Edition string   `json:"edition,omitempty"`
	Pair    string   `json:"pair,omitempty"` // id shared by an m/f pair
	Tags    []string `json:"tags,omitempty"`
	Genres  []string `json:"genres,omitempty"`  // genre card ids this belongs to
	Roots   []string `json:"roots,omitempty"`   // for genres: the genres it grew from
	Further []string `json:"further,omitempty"` // where to look next
	Sources []Source `json:"sources"`
	Media   []Media  `json:"media,omitempty"`
	Dispute string   `json:"dispute,omitempty"` // set when a claim is contested

	Body string `json:"body"`
	File string `json:"-"`

	// Translations by language code, from <id>.<lang>.md next to the card.
	Translations map[string]*Translation `json:"translations,omitempty"`
}

// Translation is a card in another language. Facts never differ from the
// original: only title, hook, body, place names, "further" and captions are
// translated; sources stay as they are.
type Translation struct {
	Title    string   `json:"title"`
	Wow      string   `json:"wow"`
	Places   []string `json:"places,omitempty"`  // translated place names, same order
	Further  []string `json:"further,omitempty"` // translated "further" items, same order
	Dispute  string   `json:"dispute,omitempty"`
	Captions []string `json:"captions,omitempty"` // translated media captions, same order
	Body     string   `json:"body"`
}

// Languages that cards may be translated into.
var Languages = []string{"ru"}

// Localized returns the card in a language, falling back to the original for
// anything not translated.
func (c *Card) Localized(lang string) *Card {
	t := c.Translations[lang]
	if t == nil {
		return c
	}
	out := *c
	out.Title, out.Wow, out.Body = t.Title, t.Wow, t.Body
	if t.Dispute != "" {
		out.Dispute = t.Dispute
	}
	if len(t.Further) == len(c.Further) {
		out.Further = t.Further
	}
	if len(t.Places) == len(c.Places) {
		out.Places = append([]Place(nil), c.Places...)
		for i := range out.Places {
			out.Places[i].Name = t.Places[i]
		}
	}
	if len(t.Captions) == len(c.Media) {
		out.Media = append([]Media(nil), c.Media...)
		for i := range out.Media {
			out.Media[i].Caption = t.Captions[i]
		}
	}
	return &out
}

// ParseTranslation reads <id>.<lang>.md.
func ParseTranslation(data []byte) (*Translation, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	if !bytes.HasPrefix(data, []byte("---\n")) {
		return nil, errors.New("missing front matter")
	}
	rest := data[4:]
	end := bytes.Index(rest, []byte("\n---\n"))
	if end < 0 {
		return nil, errors.New("unterminated front matter")
	}
	var t Translation
	if err := yaml.UnmarshalStrict(rest[:end], &t); err != nil {
		return nil, fmt.Errorf("front matter: %w", err)
	}
	t.Body = strings.TrimSpace(string(rest[end+5:]))
	return &t, nil
}

var linkRe = regexp.MustCompile(`\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]`)

// Link is a cross-reference inside the body: [[id]] or [[id|text]].
type Link struct {
	Target   string
	Text     string
	Explicit bool // written as [[id|text]]
	Start    int
	End      int
}

// Links returns cross-references in body order.
func (c *Card) Links() []Link {
	var out []Link
	for _, m := range linkRe.FindAllStringSubmatchIndex(c.Body, -1) {
		l := Link{Target: c.Body[m[2]:m[3]], Start: m[0], End: m[1]}
		if m[4] >= 0 {
			l.Text = c.Body[m[4]:m[5]]
			l.Explicit = true
		} else {
			l.Text = l.Target
		}
		out = append(out, l)
	}
	return out
}

// PlainBody renders the body with link markup replaced by its text.
func (c *Card) PlainBody() string {
	return linkRe.ReplaceAllStringFunc(c.Body, func(s string) string {
		m := linkRe.FindStringSubmatch(s)
		if m[2] != "" {
			return m[2]
		}
		return m[1]
	})
}

// Parse reads a card from Markdown with a YAML front matter block.
func Parse(data []byte) (*Card, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	if !bytes.HasPrefix(data, []byte("---\n")) {
		return nil, errors.New("missing front matter")
	}
	rest := data[4:]
	end := bytes.Index(rest, []byte("\n---\n"))
	if end < 0 {
		return nil, errors.New("unterminated front matter")
	}
	var c Card
	if err := yaml.UnmarshalStrict(rest[:end], &c); err != nil {
		return nil, fmt.Errorf("front matter: %w", err)
	}
	c.Body = strings.TrimSpace(string(rest[end+5:]))
	if c.Edition == "" {
		c.Edition = EditionBoth
	}
	return &c, nil
}

// Set is a loaded, validated collection of cards.
type Set struct {
	ByID  map[string]*Card
	Order []string
}

// LoadDir loads every *.md file under dir.
func LoadDir(dir string) (*Set, error) { return LoadFS(os.DirFS(dir)) }

// LoadFS loads every *.md file (except *.ru.md translations) in fsys.
func LoadFS(fsys fs.FS) (*Set, error) {
	s := &Set{ByID: map[string]*Card{}}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || path.Ext(p) != ".md" || isTranslation(p) {
			return nil
		}
		data, err := fs.ReadFile(fsys, p)
		if err != nil {
			return err
		}
		c, err := Parse(data)
		if err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
		c.File = p
		if _, dup := s.ByID[c.ID]; dup {
			return fmt.Errorf("%s: duplicate id %q", p, c.ID)
		}
		s.ByID[c.ID] = c
		s.Order = append(s.Order, c.ID)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(s.Order)
	for _, id := range s.Order {
		c := s.ByID[id]
		dir := path.Dir(c.File)
		for _, lang := range Languages {
			data, err := fs.ReadFile(fsys, path.Join(dir, id+"."+lang+".md"))
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			if err != nil {
				return nil, err
			}
			t, err := ParseTranslation(data)
			if err != nil {
				return nil, fmt.Errorf("%s.%s.md: %w", id, lang, err)
			}
			if c.Translations == nil {
				c.Translations = map[string]*Translation{}
			}
			c.Translations[lang] = t
		}
	}
	return s, nil
}

func isTranslation(p string) bool {
	for _, lang := range Languages {
		if strings.HasSuffix(p, "."+lang+".md") {
			return true
		}
	}
	return false
}

var idRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Validate returns every problem found; an empty slice means the set is good.
func (s *Set) Validate() []error {
	var errs []error
	bad := func(c *Card, f string, a ...any) {
		errs = append(errs, fmt.Errorf("%s: %s", c.ID, fmt.Sprintf(f, a...)))
	}
	pairs := map[string][]*Card{}
	for _, id := range s.Order {
		c := s.ByID[id]
		if !idRe.MatchString(c.ID) {
			bad(c, "id must be kebab-case")
		}
		if base := strings.TrimSuffix(filepath.Base(c.File), ".md"); c.File != "" && base != c.ID {
			bad(c, "file name %q must match id", base)
		}
		if !validKinds[c.Kind] {
			bad(c, "unknown kind %q", c.Kind)
		}
		if strings.TrimSpace(c.Title) == "" {
			bad(c, "title is empty")
		}
		if strings.TrimSpace(c.Wow) == "" {
			bad(c, "wow is empty: every card needs its hook")
		}
		if len(c.Years) == 0 || len(c.Years) > 2 || (len(c.Years) == 2 && c.Years[1] < c.Years[0]) {
			bad(c, "years must be [from] or [from, to]")
		}
		if len(c.Places) == 0 {
			bad(c, "needs at least one place")
		}
		for _, p := range c.Places {
			if p.Lat < -90 || p.Lat > 90 || p.Lon < -180 || p.Lon > 180 || p.Name == "" {
				bad(c, "bad place %+v", p)
			}
		}
		if c.Zoom < 1 || c.Zoom > 5 {
			bad(c, "zoom must be 1..5")
		}
		if len(c.Books) == 0 {
			bad(c, "needs at least one book")
		}
		for _, b := range c.Books {
			if _, ok := BookSymbols[b]; !ok {
				bad(c, "unknown book %q", b)
			}
		}
		switch c.Edition {
		case EditionBoth:
			if c.Pair != "" {
				bad(c, "pair is only for m/f editions")
			}
		case EditionMale, EditionFemale:
			if c.Pair == "" {
				bad(c, "edition %s needs a pair", c.Edition)
			}
			pairs[c.Pair] = append(pairs[c.Pair], c)
		default:
			bad(c, "unknown edition %q", c.Edition)
		}
		if len(c.Sources) == 0 {
			bad(c, "no sources: no fakes, every card is sourced")
		}
		for _, src := range c.Sources {
			if src.Title == "" {
				bad(c, "source without title")
			}
		}
		if n := len(strings.Fields(c.PlainBody())); n == 0 || n > MaxBodyWords {
			bad(c, "body has %d words, want 1..%d", n, MaxBodyWords)
		}
		for _, l := range c.Links() {
			if _, ok := s.ByID[l.Target]; !ok {
				bad(c, "link to unknown card %q", l.Target)
			}
		}
		for _, g := range c.Genres {
			if t, ok := s.ByID[g]; !ok || t.Kind != KindGenre {
				bad(c, "genre %q is not a genre card", g)
			}
		}
		for lang, t := range c.Translations {
			tc := &Card{Body: t.Body}
			if strings.TrimSpace(t.Title) == "" || strings.TrimSpace(t.Wow) == "" || strings.TrimSpace(t.Body) == "" {
				bad(c, "%s translation needs title, wow and body", lang)
			}
			if n := len(strings.Fields(tc.PlainBody())); n > MaxBodyWords*13/10 {
				bad(c, "%s translation has %d words, want at most %d", lang, n, MaxBodyWords*13/10)
			}
			want := map[string]int{}
			for _, l := range c.Links() {
				want[l.Target]++
			}
			got := map[string]int{}
			for _, l := range tc.Links() {
				got[l.Target]++
				if _, ok := s.ByID[l.Target]; !ok {
					bad(c, "%s translation links to unknown card %q", lang, l.Target)
				}
			}
			for id := range want {
				if got[id] == 0 {
					bad(c, "%s translation lost the link to %q", lang, id)
				}
			}
			if len(t.Places) > 0 && len(t.Places) != len(c.Places) {
				bad(c, "%s translation has %d places, want %d", lang, len(t.Places), len(c.Places))
			}
			if len(t.Further) > 0 && len(t.Further) != len(c.Further) {
				bad(c, "%s translation has %d further items, want %d", lang, len(t.Further), len(c.Further))
			}
			if len(t.Captions) > 0 && len(t.Captions) != len(c.Media) {
				bad(c, "%s translation has %d captions, want %d", lang, len(t.Captions), len(c.Media))
			}
			if (t.Dispute != "") != (c.Dispute != "") {
				bad(c, "%s translation must translate the dispute exactly when the card has one", lang)
			}
		}
		for _, g := range c.Roots {
			if c.Kind != KindGenre {
				bad(c, "only genre cards have roots")
				break
			}
			if t, ok := s.ByID[g]; !ok || t.Kind != KindGenre {
				bad(c, "root %q is not a genre card", g)
			}
		}
		for _, m := range c.Media {
			if m.Type != "image" && m.Type != "audio" {
				bad(c, "media type %q", m.Type)
			}
			if m.File == "" || m.Credit == "" || m.License == "" {
				bad(c, "media needs file, credit and license")
			}
		}
	}
	for p, cs := range pairs {
		if len(cs) != 2 || cs[0].Edition == cs[1].Edition {
			errs = append(errs, fmt.Errorf("pair %q must have exactly one m and one f card", p))
		}
	}
	return errs
}

// Backlinks returns ids of cards that link to id.
func (s *Set) Backlinks(id string) []string {
	var out []string
	for _, oid := range s.Order {
		for _, l := range s.ByID[oid].Links() {
			if l.Target == id {
				out = append(out, oid)
				break
			}
		}
	}
	return out
}

// ForEdition resolves a card for a reader's edition: an m/f card is swapped
// for its pair when the reader holds the other copy.
func (s *Set) ForEdition(id, edition string) *Card {
	c := s.ByID[id]
	if c == nil || c.Edition == EditionBoth || c.Edition == edition || edition == "" {
		return c
	}
	for _, oid := range s.Order {
		o := s.ByID[oid]
		if o.Pair == c.Pair && o.ID != c.ID {
			return o
		}
	}
	return c
}

// Resolved returns a copy of the card whose bare [[id]] links carry the
// target's title as their text, so readers see "Olaudah Equiano", not
// "equiano". Translations get the target's title in their own language.
func (s *Set) Resolved(c *Card) *Card {
	out := *c
	out.Body = s.resolveBody(c.Body, "")
	if len(c.Translations) > 0 {
		out.Translations = map[string]*Translation{}
		for lang, t := range c.Translations {
			tt := *t
			tt.Body = s.resolveBody(t.Body, lang)
			out.Translations[lang] = &tt
		}
	}
	return &out
}

func (s *Set) resolveBody(body, lang string) string {
	tmp := &Card{Body: body}
	var b strings.Builder
	last := 0
	for _, l := range tmp.Links() {
		b.WriteString(body[last:l.Start])
		t := s.ByID[l.Target]
		switch {
		case t == nil || l.Explicit:
			b.WriteString(body[l.Start:l.End])
		default:
			title := t.Title
			if tr := t.Translations[lang]; lang != "" && tr != nil {
				title = tr.Title
			}
			b.WriteString("[[" + l.Target + "|" + title + "]]")
		}
		last = l.End
	}
	b.WriteString(body[last:])
	return b.String()
}
