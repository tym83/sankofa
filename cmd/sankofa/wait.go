package main

import (
	"fmt"
	"os"
	"os/exec"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/tym83/sankofa/pkg/atlas"
	"github.com/tym83/sankofa/pkg/card"
	"github.com/tym83/sankofa/pkg/crumbs"
	"github.com/tym83/sankofa/pkg/reader"
)

func crumbPicker(cmd *cobra.Command) (*crumbs.Picker, error) {
	s, err := loadCards(cmd)
	if err != nil {
		return nil, err
	}
	st, err := reader.Load()
	if err != nil {
		return nil, err
	}
	last := ""
	if n := len(st.Path); n > 0 {
		last = st.Path[n-1]
	}
	return &crumbs.Picker{Set: s, Seen: st.Seen, Last: last}, nil
}

func crumbLine(c *card.Card, osc bool, width int) string {
	u := cardPoint(c).URL()
	line := c.Wow
	if width > 10 && len([]rune(line)) > width-4 {
		line = string([]rune(line)[:width-5]) + "…"
	}
	return atlas.Hyperlink(osc, u, line+" →")
}

func crumbCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "crumb",
		Short: "Print one crumb: a single surprising line with a link (for prompts and scripts)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			p, err := crumbPicker(cmd)
			if err != nil {
				return err
			}
			if c := p.Next(); c != nil {
				fmt.Fprintln(cmd.OutOrStdout(), crumbLine(c, isTerminal(cmd.OutOrStdout()), 0))
			}
			return nil
		},
	}
}

// waitCmd runs any command and, while it runs, shows crumbs under a spinner.
// Output of the command passes through untouched; crumbs go to the terminal
// only, never into pipes or CI logs.
func waitCmd() *cobra.Command {
	var every time.Duration
	c := &cobra.Command{
		Use:   "wait -- COMMAND [ARGS...]",
		Short: "Run a long command and read something surprising while it works",
		Example: `  sankofa wait -- kubectl rollout status deploy/web
  sankofa wait -- kubepkg install sankofa-genre-hip-hop`,
		Args:               cobra.MinimumNArgs(1),
		DisableFlagParsing: false,
		RunE: func(cmd *cobra.Command, args []string) error {
			run := exec.Command(args[0], args[1:]...)
			run.Stdin, run.Stdout, run.Stderr = os.Stdin, os.Stdout, os.Stderr
			tty := isTerminal(os.Stderr)
			var p *crumbs.Picker
			if tty {
				p, _ = crumbPicker(cmd)
			}
			if err := run.Start(); err != nil {
				return err
			}
			done := make(chan error, 1)
			go func() { done <- run.Wait() }()
			if p == nil {
				return <-done
			}
			spin := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
			tick := time.NewTicker(120 * time.Millisecond)
			defer tick.Stop()
			cur := p.Next()
			changed := time.Now()
			for i := 0; ; i++ {
				select {
				case err := <-done:
					fmt.Fprint(os.Stderr, "\r\x1b[2K")
					return err
				case <-tick.C:
					if time.Since(changed) > every {
						cur, changed = p.Next(), time.Now()
					}
					if cur != nil {
						fmt.Fprintf(os.Stderr, "\r\x1b[2K%s %s", spin[i%len(spin)], crumbLine(cur, true, termWidth()-2))
					}
				}
			}
		},
	}
	c.Flags().DurationVar(&every, "every", 8*time.Second, "how long each crumb stays")
	return c
}

func termWidth() int {
	if w, _, err := term.GetSize(int(os.Stderr.Fd())); err == nil && w > 0 {
		return w
	}
	return 100
}
