package atlas

import "github.com/tym83/sankofa/pkg/card"

// ForCard is the atlas point a card opens at.
func ForCard(c *card.Card) Point {
	p := Point{Zoom: c.Zoom, Focus: c.ID}
	if len(c.Years) > 0 {
		p.From = c.Years[0]
	}
	if len(c.Years) > 1 {
		p.To = c.Years[1]
	}
	if len(c.Places) > 0 {
		p.Place = Slug(c.Places[0].Name)
	}
	return p
}
