package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/tym83/sankofa/api/v1alpha1"
	"github.com/tym83/sankofa/pkg/admission"
)

func kgotlaCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "kgotla",
		Short: "Councils before dangerous deletions: everyone speaks, the chief speaks last",
		Long: `In a Tswana kgotla decisions are taken after everyone has spoken, and the
chief speaks last. Objects labelled ` + admission.Protected + `=protected cannot be
deleted until a council about them has decided.`,
	}
	var voices []string
	var chief, reason string
	call := &cobra.Command{
		Use:   "call TYPE/NAME",
		Short: "Call a council about deleting an object",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			gvr, name, namespaced, err := target(args[0])
			if err != nil {
				return err
			}
			cl, err := kubeClient()
			if err != nil {
				return err
			}
			t := v1alpha1.Target{Group: gvr.Group, Resource: gvr.Resource, Name: name}
			if namespaced {
				t.Namespace = namespace()
			}
			k := &v1alpha1.Kgotla{
				ObjectMeta: metav1.ObjectMeta{GenerateName: "council-" + strings.ToLower(name) + "-"},
				Spec:       v1alpha1.KgotlaSpec{Target: t, Reason: reason, Voices: voices, Chief: chief},
			}
			if err := cl.Create(cmd.Context(), k); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "Council %s is called. Voices: %s. %s speaks last.\nEach speaks with: sankofa kgotla speak %s\n", k.Name, strings.Join(voices, ", "), chief, k.Name)
			return nil
		},
	}
	call.Flags().StringSliceVar(&voices, "voices", nil, "users who must speak")
	call.Flags().StringVar(&chief, "chief", "", "the user who speaks last")
	call.Flags().StringVar(&reason, "reason", "", "why")
	_ = call.MarkFlagRequired("voices")
	_ = call.MarkFlagRequired("chief")
	_ = call.MarkFlagRequired("reason")

	speak := &cobra.Command{
		Use:   "speak COUNCIL",
		Short: "Speak in a council (your name is taken from your credentials)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cl, err := kubeClient()
			if err != nil {
				return err
			}
			var k v1alpha1.Kgotla
			if err := cl.Get(cmd.Context(), client.ObjectKey{Name: args[0]}, &k); err != nil {
				return err
			}
			// The webhook replaces the placeholder with the authenticated user.
			patch := map[string]any{"spec": map[string]any{"spoken": append(k.Spec.Spoken, v1alpha1.Voice{User: "me", At: metav1.NewTime(time.Now())})}}
			data, _ := json.Marshal(patch)
			if err := cl.Patch(cmd.Context(), &k, client.RawPatch("application/merge-patch+json", data)); err != nil {
				return err
			}
			state := "The council listens."
			if k.Decided() {
				state = "The chief has spoken: the council has decided."
			}
			fmt.Fprintf(cmd.OutOrStdout(), "You spoke as %s. %s\n", k.Spec.Spoken[len(k.Spec.Spoken)-1].User, state)
			return nil
		},
	}
	list := &cobra.Command{
		Use:   "list",
		Short: "List councils",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cl, err := kubeClient()
			if err != nil {
				return err
			}
			var l v1alpha1.KgotlaList
			if err := cl.List(cmd.Context(), &l); err != nil {
				return err
			}
			for _, k := range l.Items {
				var spoke []string
				for _, v := range k.Spec.Spoken {
					spoke = append(spoke, v.User)
				}
				st := "listening"
				if k.Decided() {
					st = "decided"
				}
				fmt.Fprintf(cmd.OutOrStdout(), "%-28s %-10s %s/%s  spoke: %s\n", k.Name, st, k.Spec.Target.Resource, k.Spec.Target.Name, strings.Join(spoke, " → "))
			}
			return nil
		},
	}
	c.AddCommand(call, speak, list)
	return c
}
