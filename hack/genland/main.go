// Command genland rasterises Natural Earth land (public domain, via the
// world-atlas TopoJSON) into a 0.5-degree bit mask for the terminal atlas.
//
//	go run ./hack/genland web/node_modules/world-atlas/land-50m.json pkg/atlas/land.bin
package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type topo struct {
	Transform *struct {
		Scale     [2]float64 `json:"scale"`
		Translate [2]float64 `json:"translate"`
	} `json:"transform"`
	Arcs    [][][2]float64 `json:"arcs"`
	Objects map[string]struct {
		Geometries []struct {
			Type string          `json:"type"`
			Arcs json.RawMessage `json:"arcs"`
		} `json:"geometries"`
	} `json:"objects"`
}

const W, H = 720, 360

func main() {
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	var t topo
	if err := json.Unmarshal(data, &t); err != nil {
		panic(err)
	}
	arcs := make([][][2]float64, len(t.Arcs))
	for i, a := range t.Arcs {
		var x, y float64
		for _, p := range a {
			if t.Transform != nil {
				x += p[0]
				y += p[1]
				arcs[i] = append(arcs[i], [2]float64{x*t.Transform.Scale[0] + t.Transform.Translate[0], y*t.Transform.Scale[1] + t.Transform.Translate[1]})
			} else {
				arcs[i] = append(arcs[i], p)
			}
		}
	}
	ring := func(idx []int) [][2]float64 {
		var out [][2]float64
		for _, i := range idx {
			a := arcs[i]
			if i < 0 {
				a = reverse(arcs[^i])
			}
			out = append(out, a...)
		}
		return out
	}
	var rings [][][2]float64
	for _, g := range t.Objects["land"].Geometries {
		switch g.Type {
		case "Polygon":
			var p [][]int
			_ = json.Unmarshal(g.Arcs, &p)
			for _, r := range p {
				rings = append(rings, ring(r))
			}
		case "MultiPolygon":
			var mp [][][]int
			_ = json.Unmarshal(g.Arcs, &mp)
			for _, p := range mp {
				for _, r := range p {
					rings = append(rings, ring(r))
				}
			}
		}
	}
	mask := make([]byte, W*H/8)
	for y := 0; y < H; y++ {
		lat := 90 - (float64(y)+0.5)*180/H
		for x := 0; x < W; x++ {
			lon := -180 + (float64(x)+0.5)*360/W
			in := false
			for _, r := range rings {
				if inside(r, lon, lat) {
					in = !in
				}
			}
			if in {
				i := y*W + x
				mask[i/8] |= 1 << (i % 8)
			}
		}
	}
	if err := os.WriteFile(os.Args[2], mask, 0o644); err != nil {
		panic(err)
	}
	fmt.Printf("%d rings, %d bytes\n", len(rings), len(mask))
}

func reverse(a [][2]float64) [][2]float64 {
	out := make([][2]float64, len(a))
	for i := range a {
		out[i] = a[len(a)-1-i]
	}
	return out
}

func inside(r [][2]float64, x, y float64) bool {
	in := false
	for i, j := 0, len(r)-1; i < len(r); j, i = i, i+1 {
		xi, yi, xj, yj := r[i][0], r[i][1], r[j][0], r[j][1]
		if (yi > y) != (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi {
			in = !in
		}
	}
	return in
}
