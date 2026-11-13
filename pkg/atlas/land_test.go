package atlas

import (
	"os"
	"strings"
	"testing"
)

func TestLand(t *testing.T) {
	for _, p := range []struct {
		lon, lat float64
		land     bool
		name     string
	}{{3.38, 6.52, true, "Lagos"}, {-30, 10, false, "mid-Atlantic"}, {-90.05, 35.15, true, "Memphis"}, {-0.13, 51.5, true, "London"}} {
		if IsLand(p.lon, p.lat) != p.land {
			t.Errorf("%s: want land=%v", p.name, p.land)
		}
	}
	if os.Getenv("SHOW") != "" {
		t.Log("\n" + strings.Join(DefaultView.Braille(100, 28), "\n"))
	}
}
