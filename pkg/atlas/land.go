package atlas

import _ "embed"

// land is a 720×360 bit mask of land at 0.5 degrees, rasterised from Natural
// Earth (public domain) by hack/genland.
//
//go:embed land.bin
var land []byte

const landW, landH = 720, 360

// IsLand reports whether a point is on land.
func IsLand(lon, lat float64) bool {
	for lon < -180 {
		lon += 360
	}
	for lon >= 180 {
		lon -= 360
	}
	if lat > 90 || lat < -90 {
		return false
	}
	x := int((lon + 180) * landW / 360)
	y := int((90 - lat) * landH / 180)
	if x >= landW {
		x = landW - 1
	}
	if y >= landH {
		y = landH - 1
	}
	i := y*landW + x
	return land[i/8]&(1<<(i%8)) != 0
}

// View is the part of the world one zoom level shows.
type View struct {
	Lon, Lat float64 // centre
	Span     float64 // degrees of longitude across the screen
}

// Spans per zoom level: 1 the Atlantic world, 2 a region, 3 a country or a
// city with its hinterland, 4 a city, 5 a neighbourhood.
var Spans = map[int]float64{1: 190, 2: 70, 3: 22, 4: 7, 5: 2}

// DefaultView is the Atlantic: Africa, Europe and the Americas together.
var DefaultView = View{Lon: -25, Lat: 12, Span: Spans[1]}

// Braille renders land in a cols×rows character grid; each character holds
// 2×4 dots. Latitude is stretched to keep shapes plausible.
func (v View) Braille(cols, rows int) []string {
	dotsW, dotsH := cols*2, rows*4
	degPerDot := v.Span / float64(dotsW)
	latPerDot := degPerDot * 1.15
	lon0 := v.Lon - v.Span/2
	lat0 := v.Lat + latPerDot*float64(dotsH)/2
	bits := [4][2]rune{{0x01, 0x08}, {0x02, 0x10}, {0x04, 0x20}, {0x40, 0x80}}
	out := make([]string, rows)
	for r := 0; r < rows; r++ {
		line := make([]rune, cols)
		for c := 0; c < cols; c++ {
			var ch rune = 0x2800
			for dy := 0; dy < 4; dy++ {
				for dx := 0; dx < 2; dx++ {
					lon := lon0 + (float64(c*2+dx)+0.5)*degPerDot
					lat := lat0 - (float64(r*4+dy)+0.5)*latPerDot
					if IsLand(lon, lat) {
						ch |= bits[dy][dx]
					}
				}
			}
			line[c] = ch
		}
		out[r] = string(line)
	}
	return out
}

// Cell returns the character cell of a point, and whether it is on screen.
func (v View) Cell(lon, lat float64, cols, rows int) (int, int, bool) {
	degPerCol := v.Span / float64(cols)
	latPerRow := degPerCol / 2 * 4 * 1.15
	c := int((lon - (v.Lon - v.Span/2)) / degPerCol)
	r := int(((v.Lat + latPerRow*float64(rows)/2) - lat) / latPerRow)
	return c, r, c >= 0 && c < cols && r >= 0 && r < rows
}
