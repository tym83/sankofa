package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/tym83/sankofa/pkg/atlas"
	"github.com/tym83/sankofa/pkg/credits"
)

func creditsCmd() *cobra.Command {
	var asJSON bool
	c := &cobra.Command{
		Use:   "credits (TYPE/NAME | IMAGE)",
		Short: "Show who an image stands on: its base images, sources and licences",
		Long: `Every image is built on other people's work. credits walks the declared
lineage of each container image (OCI annotations base.name, source,
licenses) and points out what is not declared.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			images := []string{args[0]}
			if strings.Contains(args[0], "/") && !strings.Contains(strings.SplitN(args[0], "/", 2)[0], ".") && !strings.Contains(args[0], ":") {
				var err error
				if images, err = workloadImages(cmd, args[0]); err != nil {
					return err
				}
			}
			r := &credits.Resolver{}
			var all []*credits.Credit
			w := cmd.OutOrStdout()
			osc := isTerminal(w)
			for _, img := range images {
				cr := r.Resolve(cmd.Context(), img)
				all = append(all, cr)
				if asJSON {
					continue
				}
				for _, l := range cr.Tree() {
					fmt.Fprintln(w, l)
				}
				if m := cr.Missing(); len(m) > 0 {
					u := atlas.Point{Focus: "big-mama-thornton", Lang: lang}.URL()
					fmt.Fprintf(w, "   not declared: %s — %s\n", strings.Join(m, ", "),
						atlas.Hyperlink(osc, u, "\"Hound Dog\" was Big Mama Thornton's first"))
				}
				fmt.Fprintln(w)
			}
			if asJSON {
				return json.NewEncoder(w).Encode(all)
			}
			return nil
		},
	}
	c.Flags().BoolVar(&asJSON, "json", false, "print JSON")
	return c
}

func workloadImages(cmd *cobra.Command, arg string) ([]string, error) {
	gvr, name, namespaced, err := target(arg)
	if err != nil {
		return nil, err
	}
	cfg, err := kubeFlags.ToRESTConfig()
	if err != nil {
		return nil, err
	}
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	var ri dynamic.ResourceInterface = dc.Resource(gvr)
	if namespaced {
		ri = dc.Resource(gvr).Namespace(namespace())
	}
	u, err := ri.Get(cmd.Context(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return podImages(u), nil
}

// podImages finds containers in a pod or in any workload's pod template.
func podImages(u *unstructured.Unstructured) []string {
	var out []string
	for _, path := range [][]string{{"spec"}, {"spec", "template", "spec"}, {"spec", "jobTemplate", "spec", "template", "spec"}} {
		for _, f := range []string{"initContainers", "containers"} {
			cs, _, _ := unstructured.NestedSlice(u.Object, append(path, f)...)
			for _, c := range cs {
				if m, ok := c.(map[string]any); ok {
					if img, ok := m["image"].(string); ok {
						out = append(out, img)
					}
				}
			}
		}
	}
	return out
}
