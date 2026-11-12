// Package content embeds the card collection into the Griot binary, so a
// cluster carries its memory with it.
package content

import (
	"embed"
	"io/fs"
)

//go:embed cards
var cards embed.FS

// Cards is the card collection.
func Cards() fs.FS {
	sub, err := fs.Sub(cards, "cards")
	if err != nil {
		panic(err)
	}
	return sub
}
