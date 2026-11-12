package main

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/tym83/sankofa/pkg/card"
)

// loadCards reads cards from --content, or from the cluster.
func loadCards(cmd *cobra.Command) (*card.Set, error) {
	dir, _ := cmd.Flags().GetString("content")
	if dir != "" {
		return card.LoadDir(dir)
	}
	return loadClusterCards(cmd)
}

var loadClusterCards = func(*cobra.Command) (*card.Set, error) {
	return nil, fmt.Errorf("no --content given and cluster access is not built in yet")
}
