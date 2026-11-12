// Command sankofa is the Sankofa CLI: the dictionary, the atlas and the
// cluster memory. It also works as a kubectl plugin (kubectl sankofa).
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

func main() {
	root := &cobra.Command{
		Use:           "sankofa",
		Short:         "Go back and fetch it: a Kubernetes distribution that remembers",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.PersistentFlags().String("content", envOr("SANKOFA_CONTENT", ""), "read cards from a local content directory instead of the cluster")
	kubeFlags.AddFlags(root.PersistentFlags())
	root.AddCommand(contentCmd(), dictCmd(), tellCmd(), fetchCmd(), obituariesCmd(), creditsCmd(), genreCmd())
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "sankofa:", err)
		os.Exit(1)
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
