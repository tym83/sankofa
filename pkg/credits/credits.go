// Package credits gives every image its lineage. "Hound Dog" was Big Mama
// Thornton's before it was Elvis's; the Amen break carries thousands of
// tracks and its drummer was never paid. An image that does not declare what
// it was built on hides its authors the same way.
package credits

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	v1 "github.com/google/go-containerregistry/pkg/v1"
	"github.com/google/go-containerregistry/pkg/v1/remote"
)

// OCI annotation and label keys that carry credits.
const (
	BaseName   = "org.opencontainers.image.base.name"
	BaseDigest = "org.opencontainers.image.base.digest"
	Source     = "org.opencontainers.image.source"
	Licenses   = "org.opencontainers.image.licenses"
	Authors    = "org.opencontainers.image.authors"
	Title      = "org.opencontainers.image.title"
	Version    = "org.opencontainers.image.version"
)

// Credit is one link in an image's lineage.
type Credit struct {
	Ref      string  `json:"ref"`
	Digest   string  `json:"digest,omitempty"`
	Title    string  `json:"title,omitempty"`
	Source   string  `json:"source,omitempty"`
	Licenses string  `json:"licenses,omitempty"`
	Authors  string  `json:"authors,omitempty"`
	Layers   int     `json:"layers"`
	Base     *Credit `json:"base,omitempty"`
	// Undeclared is set when the image does not say what it was built on.
	Undeclared bool   `json:"undeclared,omitempty"`
	Error      string `json:"error,omitempty"`
}

// Missing lists what the image does not declare.
func (c *Credit) Missing() []string {
	var m []string
	if c.Undeclared {
		m = append(m, "base image")
	}
	if c.Licenses == "" {
		m = append(m, "licenses")
	}
	if c.Source == "" {
		m = append(m, "source")
	}
	return m
}

// Resolver fetches credits from registries and caches them by digest.
type Resolver struct {
	Keychain authn.Keychain
	MaxDepth int
	Timeout  time.Duration

	mu    sync.Mutex
	cache map[string]*Credit
}

// Resolve walks the lineage of an image reference.
func (r *Resolver) Resolve(ctx context.Context, ref string) *Credit {
	return r.resolve(ctx, ref, 0)
}

func (r *Resolver) resolve(ctx context.Context, ref string, depth int) *Credit {
	if r.MaxDepth == 0 {
		r.MaxDepth = 6
	}
	if r.Timeout == 0 {
		r.Timeout = 10 * time.Second
	}
	if r.Keychain == nil {
		r.Keychain = authn.DefaultKeychain
	}
	r.mu.Lock()
	if r.cache == nil {
		r.cache = map[string]*Credit{}
	}
	if c, ok := r.cache[ref]; ok {
		r.mu.Unlock()
		return c
	}
	r.mu.Unlock()

	c := &Credit{Ref: ref}
	ctx, cancel := context.WithTimeout(ctx, r.Timeout)
	defer cancel()
	nref, err := name.ParseReference(ref)
	if err != nil {
		c.Error = err.Error()
		return c
	}
	opts := []remote.Option{remote.WithContext(ctx), remote.WithAuthFromKeychain(r.Keychain)}
	desc, err := remote.Get(nref, opts...)
	if err != nil {
		c.Error = err.Error()
		return c
	}
	c.Digest = desc.Digest.String()
	ann := map[string]string{}
	var img v1.Image
	if desc.MediaType.IsIndex() {
		idx, err := desc.ImageIndex()
		if err == nil {
			if m, err := idx.IndexManifest(); err == nil {
				for k, v := range m.Annotations {
					ann[k] = v
				}
				if len(m.Manifests) > 0 {
					img, _ = idx.Image(m.Manifests[0].Digest)
				}
			}
		}
	} else {
		img, _ = desc.Image()
	}
	if img != nil {
		if m, err := img.Manifest(); err == nil {
			for k, v := range m.Annotations {
				if ann[k] == "" {
					ann[k] = v
				}
			}
			c.Layers = len(m.Layers)
		}
		if cf, err := img.ConfigFile(); err == nil {
			for k, v := range cf.Config.Labels {
				if ann[k] == "" {
					ann[k] = v
				}
			}
		}
	}
	c.Title, c.Source, c.Licenses, c.Authors = ann[Title], ann[Source], ann[Licenses], ann[Authors]
	switch base := ann[BaseName]; {
	case base == "":
		c.Undeclared = c.Layers > 1 // a single-layer image may truly be built from scratch
	case depth+1 < r.MaxDepth:
		b := base
		if d := ann[BaseDigest]; d != "" {
			if bn, err := name.ParseReference(base); err == nil {
				b = bn.Context().Name() + "@" + d
			}
		}
		c.Base = r.resolve(ctx, b, depth+1)
	}
	r.mu.Lock()
	r.cache[ref] = c
	r.mu.Unlock()
	return c
}

// Tree renders the lineage as indented lines.
func (c *Credit) Tree() []string {
	var out []string
	for d, cur := 0, c; cur != nil; d, cur = d+1, cur.Base {
		prefix := ""
		if d > 0 {
			prefix = fmt.Sprintf("%*s└─ built on ", (d-1)*3, "")
		}
		line := prefix + cur.Ref
		if cur.Licenses != "" {
			line += "  [" + cur.Licenses + "]"
		}
		if cur.Source != "" {
			line += "  " + cur.Source
		}
		if cur.Error != "" {
			line += "  (could not read: " + cur.Error + ")"
		}
		out = append(out, line)
		if cur.Undeclared {
			out = append(out, fmt.Sprintf("%*s└─ ? base not declared", d*3, ""))
		}
	}
	return out
}
