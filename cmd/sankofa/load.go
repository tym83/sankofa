package main

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/cli-runtime/pkg/genericclioptions"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/tym83/sankofa/api/v1alpha1"
	"github.com/tym83/sankofa/content"
	"github.com/tym83/sankofa/pkg/card"
)

var kubeFlags = genericclioptions.NewConfigFlags(true)

var scheme = func() *runtime.Scheme {
	s := runtime.NewScheme()
	_ = clientgoscheme.AddToScheme(s)
	_ = v1alpha1.AddToScheme(s)
	return s
}()

func kubeClient() (client.Client, error) {
	cfg, err := kubeFlags.ToRESTConfig()
	if err != nil {
		return nil, err
	}
	return client.New(cfg, client.Options{Scheme: scheme})
}

// lang is the reader's language.
var lang = "en"

// loadCards reads cards from --content, or from the cluster, in the reader's
// language.
func loadCards(cmd *cobra.Command) (*card.Set, error) {
	s, err := loadCardsRaw(cmd)
	if err != nil || lang == "" || lang == "en" {
		return s, err
	}
	for _, id := range s.Order {
		s.ByID[id] = s.Resolved(s.ByID[id]).Localized(lang)
	}
	return s, nil
}

func loadCardsRaw(cmd *cobra.Command) (*card.Set, error) {
	if dir, _ := cmd.Flags().GetString("content"); dir != "" {
		return card.LoadDir(dir)
	}
	s, err := loadClusterCards()
	if err == nil {
		return s, nil
	}
	// No cluster at hand: the cards are built into sankofa too.
	fmt.Fprintln(cmd.ErrOrStderr(), tr("No cluster reachable; reading the cards built into sankofa."))
	return card.LoadFS(content.Cards())
}

func loadClusterCards() (*card.Set, error) {
	c, err := kubeClient()
	if err != nil {
		return nil, err
	}
	var list v1alpha1.CardList
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := c.List(ctx, &list); err != nil {
		return nil, err
	}
	s := &card.Set{ByID: map[string]*card.Card{}}
	for i := range list.Items {
		cc := v1alpha1.ToCard(&list.Items[i])
		s.ByID[cc.ID] = cc
		s.Order = append(s.Order, cc.ID)
	}
	return s, nil
}
