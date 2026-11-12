package v1alpha1

import (
	"strconv"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/tym83/sankofa/pkg/card"
)

// FromCard turns a content card into a Card object.
func FromCard(c *card.Card) *Card {
	o := &Card{
		TypeMeta:   metav1.TypeMeta{APIVersion: GroupVersion.String(), Kind: "Card"},
		ObjectMeta: metav1.ObjectMeta{Name: c.ID, Labels: map[string]string{"sankofa.kuberoot.dev/kind": c.Kind}},
		Spec: CardSpec{
			Kind: c.Kind, Title: c.Title, Wow: c.Wow, Years: c.Years, Zoom: c.Zoom, Era: c.Era,
			Books: c.Books, Edition: c.Edition, Pair: c.Pair, Tags: c.Tags, Genres: c.Genres,
			Further: c.Further, Dispute: c.Dispute, Body: c.Body,
		},
	}
	if c.Era != "" {
		o.Labels["sankofa.kuberoot.dev/era"] = c.Era
	}
	for _, p := range c.Places {
		o.Spec.Places = append(o.Spec.Places, Place{Name: p.Name, Lat: ftoa(p.Lat), Lon: ftoa(p.Lon)})
	}
	for _, s := range c.Sources {
		o.Spec.Sources = append(o.Spec.Sources, Source(s))
	}
	for _, m := range c.Media {
		o.Spec.Media = append(o.Spec.Media, Media(m))
	}
	return o
}

// ToCard turns a Card object back into a content card.
func ToCard(o *Card) *card.Card {
	s := o.Spec
	c := &card.Card{
		ID: o.Name, Kind: s.Kind, Title: s.Title, Wow: s.Wow, Years: s.Years, Zoom: s.Zoom, Era: s.Era,
		Books: s.Books, Edition: s.Edition, Pair: s.Pair, Tags: s.Tags, Genres: s.Genres,
		Further: s.Further, Dispute: s.Dispute, Body: s.Body,
	}
	if c.Edition == "" {
		c.Edition = card.EditionBoth
	}
	for _, p := range s.Places {
		lat, _ := strconv.ParseFloat(p.Lat, 64)
		lon, _ := strconv.ParseFloat(p.Lon, 64)
		c.Places = append(c.Places, card.Place{Name: p.Name, Lat: lat, Lon: lon})
	}
	for _, x := range s.Sources {
		c.Sources = append(c.Sources, card.Source(x))
	}
	for _, m := range s.Media {
		c.Media = append(c.Media, card.Media(m))
	}
	return c
}

func ftoa(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }
