package main

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/tym83/sankofa/pkg/card"
	"github.com/tym83/sankofa/pkg/history"
)

// entry is one line of the incident story, told by one of three books:
// voices (components speaking in events), archives (Griot's record of who
// changed what) and heirs (the objects it gave rise to).
type entry struct {
	At   time.Time
	Book string
	Who  string
	What string
	Warn bool
}

func storyCmd() *cobra.Command {
	var since time.Duration
	c := &cobra.Command{
		Use:   "story TYPE/NAME",
		Short: "Tell an incident in three books: what components said, who changed what, what it became",
		Long: `An incident told by three books, after Pavić: ❝ the voices of components
(events), ▤ the archive of changes (Griot), ✶ the heirs (owned objects and
their state). Where the books disagree, the story says so: that is usually
where the bug is.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			cfg, err := kubeFlags.ToRESTConfig()
			if err != nil {
				return err
			}
			kc, err := kubernetes.NewForConfig(cfg)
			if err != nil {
				return err
			}
			gvr, name, namespaced, err := target(args[0])
			if err != nil {
				return err
			}
			ns := ""
			if namespaced {
				ns = namespace()
			}
			cutoff := time.Now().Add(-since)
			var es []entry

			// Archives: Griot's memory of the object.
			if tl, _, _, err := timeline(ctx, args[0], ""); err == nil {
				for _, m := range tl.Moments {
					if m.At.After(cutoff) {
						es = append(es, entry{At: m.At, Book: card.BookArchives, Who: orDash(m.Manager), What: m.Verb + " " + args[0]})
					}
				}
			}
			// Heirs: pods that carry the workload's name, and their state.
			pods := []corev1.Pod{}
			if ns != "" {
				pl, err := kc.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
				if err == nil {
					for _, p := range pl.Items {
						if p.Name == name || ownedBy(p, name) {
							pods = append(pods, p)
						}
					}
				}
			}
			names := map[string]bool{name: true}
			for _, p := range pods {
				names[p.Name] = true
				for _, cs := range p.Status.ContainerStatuses {
					if cs.RestartCount > 0 {
						es = append(es, entry{At: time.Now(), Book: card.BookHeirs, Who: p.Name, What: fmt.Sprintf("container %s restarted %d times", cs.Name, cs.RestartCount), Warn: true})
					}
				}
				if p.Spec.NodeName != "" && p.Status.Phase == corev1.PodPending && p.CreationTimestamp.Time.Before(time.Now().Add(-2*time.Minute)) {
					es = append(es, entry{At: time.Now(), Book: card.BookHeirs, Who: p.Name, What: fmt.Sprintf("bound to %s but still Pending: the scheduler says yes, the kubelet has not answered", p.Spec.NodeName), Warn: true})
				}
			}
			// Voices: events about the object and its heirs.
			if ns != "" {
				el, err := kc.CoreV1().Events(ns).List(ctx, metav1.ListOptions{})
				if err == nil {
					for _, e := range el.Items {
						if !names[e.InvolvedObject.Name] && !strings.HasPrefix(e.InvolvedObject.Name, name+"-") {
							continue
						}
						at := e.LastTimestamp.Time
						if at.IsZero() {
							at = e.EventTime.Time
						}
						if at.Before(cutoff) {
							continue
						}
						who := e.Source.Component
						if who == "" {
							who = e.ReportingController
						}
						es = append(es, entry{At: at, Book: card.BookVoices, Who: orDash(who), What: e.Reason + ": " + e.Message, Warn: e.Type == corev1.EventTypeWarning})
					}
				}
			}
			sort.SliceStable(es, func(i, j int) bool { return es[i].At.Before(es[j].At) })
			w := cmd.OutOrStdout()
			fmt.Fprintf(w, "The story of %s (%s), last %s\n\n", args[0], gvr.Resource, since)
			for _, e := range es {
				line := fmt.Sprintf("%s %s  %-22s %s", card.BookSymbols[e.Book], e.At.Local().Format("15:04:05"), trim(e.Who, 22), e.What)
				if e.Warn {
					line = stWow.Render(line)
				}
				fmt.Fprintln(w, line)
			}
			if len(es) == 0 {
				fmt.Fprintln(w, "All three books are silent.")
			}
			for _, d := range disagreements(es) {
				fmt.Fprintln(w, "\n"+stTitle.Render("The books disagree: ")+d)
			}
			return nil
		},
	}
	c.Flags().DurationVar(&since, "since", 6*time.Hour, "how far back")
	return c
}

func ownedBy(p corev1.Pod, name string) bool {
	for _, o := range p.OwnerReferences {
		if o.Name == name || strings.HasPrefix(o.Name, name+"-") {
			return true
		}
	}
	return false
}

// disagreements finds places where one book contradicts another: a change in
// the archive followed by warnings in the voices.
func disagreements(es []entry) []string {
	var out []string
	for i, e := range es {
		if e.Book != card.BookArchives || !strings.HasPrefix(e.What, history.Changed) {
			continue
		}
		for _, f := range es[i+1:] {
			if f.At.Sub(e.At) > 10*time.Minute {
				break
			}
			if f.Warn && f.Book == card.BookVoices {
				out = append(out, fmt.Sprintf("the archive says %s changed it at %s, and %s began warning %s later (%s).",
					e.Who, e.At.Local().Format("15:04:05"), f.Who, f.At.Sub(e.At).Round(time.Second), f.What))
				break
			}
		}
	}
	return out
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

func trim(s string, n int) string {
	if len([]rune(s)) > n {
		return string([]rune(s)[:n-1]) + "…"
	}
	return s
}

