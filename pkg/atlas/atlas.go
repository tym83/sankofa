// Package atlas holds the shared coordinates of the terminal and web atlas, so
// that any point can be opened on either screen.
package atlas

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// DefaultBase is used when SANKOFA_MUSEUM_URL is not set.
const DefaultBase = "http://localhost:8080/"

// Point is a position in the atlas: a time span, a place, a zoom level and an
// optional focused card.
type Point struct {
	From, To int // years; zero means unset
	Place    string
	Zoom     int
	Focus    string   // card id
	Path     []string // a reader's path, replayed by the museum
	Lang     string   // the museum's language, empty for English
}

// Base returns the museum base URL.
func Base() string {
	if b := os.Getenv("SANKOFA_MUSEUM_URL"); b != "" {
		if !strings.HasSuffix(b, "/") {
			b += "/"
		}
		return b
	}
	return DefaultBase
}

// Fragment encodes the point as a URL fragment: t=1900-1935&place=delta&zoom=3&focus=blues.
func (p Point) Fragment() string {
	v := url.Values{}
	if p.From != 0 {
		t := strconv.Itoa(p.From)
		if p.To != 0 && p.To != p.From {
			t += "-" + strconv.Itoa(p.To)
		}
		v.Set("t", t)
	}
	if p.Place != "" {
		v.Set("place", p.Place)
	}
	if p.Zoom != 0 {
		v.Set("zoom", strconv.Itoa(p.Zoom))
	}
	if p.Focus != "" {
		v.Set("focus", p.Focus)
	}
	if len(p.Path) > 0 {
		v.Set("path", strings.Join(p.Path, "."))
	}
	if p.Lang != "" && p.Lang != "en" {
		v.Set("lang", p.Lang)
	}
	return v.Encode()
}

// URL is the museum link for the point.
func (p Point) URL() string { return Base() + "#" + p.Fragment() }

// Parse decodes a fragment or a full museum URL.
func Parse(s string) (Point, error) {
	if i := strings.Index(s, "#"); i >= 0 {
		s = s[i+1:]
	}
	v, err := url.ParseQuery(s)
	if err != nil {
		return Point{}, err
	}
	var p Point
	if t := v.Get("t"); t != "" {
		a, b, _ := strings.Cut(t, "-")
		if p.From, err = strconv.Atoi(a); err != nil {
			return Point{}, fmt.Errorf("bad t: %w", err)
		}
		if b != "" {
			if p.To, err = strconv.Atoi(b); err != nil {
				return Point{}, fmt.Errorf("bad t: %w", err)
			}
		}
	}
	if z := v.Get("zoom"); z != "" {
		if p.Zoom, err = strconv.Atoi(z); err != nil || p.Zoom < 1 || p.Zoom > 5 {
			return Point{}, fmt.Errorf("bad zoom %q", z)
		}
	}
	p.Place = v.Get("place")
	p.Focus = v.Get("focus")
	if path := v.Get("path"); path != "" {
		p.Path = strings.Split(path, ".")
	}
	p.Lang = v.Get("lang")
	return p, nil
}

// Hyperlink wraps text in an OSC 8 terminal hyperlink when enabled.
func Hyperlink(enabled bool, target, text string) string {
	if !enabled {
		return text
	}
	return "\x1b]8;;" + target + "\x1b\\" + text + "\x1b]8;;\x1b\\"
}

// Slug turns a place name into the place key used in fragments.
func Slug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(fold(name)) {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		case !dash && b.Len() > 0:
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.TrimSuffix(b.String(), "-")
}

// fold drops diacritics so that "Île de Gorée" becomes "ile-de-goree".
func fold(s string) string {
	t, _, err := transform.String(transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC), s)
	if err != nil {
		return s
	}
	return t
}
