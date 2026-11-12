package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/yaml"

	"github.com/tym83/sankofa/pkg/history"
)

// target resolves "deployment/web" or "deployments.apps/web" to a resource.
func target(arg string) (schema.GroupVersionResource, string, bool, error) {
	kind, name, ok := strings.Cut(arg, "/")
	if !ok || name == "" {
		return schema.GroupVersionResource{}, "", false, fmt.Errorf("want TYPE/NAME, e.g. deployment/web")
	}
	mapper, err := kubeFlags.ToRESTMapper()
	if err != nil {
		return schema.GroupVersionResource{}, "", false, err
	}
	gvr, err := mapper.ResourceFor(schema.ParseGroupResource(kind).WithVersion(""))
	if err != nil {
		return schema.GroupVersionResource{}, "", false, err
	}
	gvk, err := mapper.KindFor(gvr)
	if err != nil {
		return schema.GroupVersionResource{}, "", false, err
	}
	m, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
	if err != nil {
		return schema.GroupVersionResource{}, "", false, err
	}
	return gvr, name, m.Scope.Name() == meta.RESTScopeNameNamespace, nil
}

func namespace() string {
	ns, _, _ := kubeFlags.ToRawKubeConfigLoader().Namespace()
	if ns == "" {
		ns = "default"
	}
	return ns
}

func timeline(ctx context.Context, arg, at string) (*history.Timeline, schema.GroupVersionResource, string, error) {
	gvr, name, namespaced, err := target(arg)
	if err != nil {
		return nil, gvr, "", err
	}
	cfg, err := kubeFlags.ToRESTConfig()
	if err != nil {
		return nil, gvr, "", err
	}
	kc, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, gvr, "", err
	}
	ref := history.Ref{Group: gvr.Group, Resource: gvr.Resource, Name: name}
	path := "/apis/" + history.Group + "/" + history.Version + "/clustertimelines/" + history.TimelineName(ref)
	ns := ""
	if namespaced {
		ns = namespace()
		path = "/apis/" + history.Group + "/" + history.Version + "/namespaces/" + ns + "/timelines/" + history.TimelineName(ref)
	}
	req := kc.Discovery().RESTClient().Get().AbsPath(path)
	if at != "" {
		req = req.Param("at", at)
	}
	raw, err := req.DoRaw(ctx)
	if err != nil {
		if apierrors.IsNotFound(err) {
			return nil, gvr, ns, fmt.Errorf("griot has no memory of %s: %w", arg, err)
		}
		return nil, gvr, ns, err
	}
	var tl history.Timeline
	if err := json.Unmarshal(raw, &tl); err != nil {
		return nil, gvr, ns, err
	}
	return &tl, gvr, ns, nil
}

func tellCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "tell TYPE/NAME",
		Short: "Tell the life story of an object, even after it is gone",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			tl, _, _, err := timeline(cmd.Context(), args[0], "")
			if err != nil {
				return err
			}
			w := cmd.OutOrStdout()
			fmt.Fprintln(w, wrap(tl.Story, 78))
			fmt.Fprintln(w)
			for _, m := range tl.Moments {
				who := m.Manager
				if who == "" {
					who = "-"
				}
				fmt.Fprintf(w, "  %s  %-7s  %s\n", m.At.Local().Format("2006-01-02 15:04:05"), m.Verb, who)
			}
			return nil
		},
	}
}

func fetchCmd() *cobra.Command {
	var at string
	var dry bool
	c := &cobra.Command{
		Use:   "fetch TYPE/NAME",
		Short: "Sankofa: go back and fetch it. Restore an object from the cluster memory",
		Long: `Restore one object as it was at --at (RFC3339 or a duration like 2h meaning
"two hours ago"), or as it was last seen alive. Status, UID and owner
references are not restored: the object is born again.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ts := ""
			if at != "" {
				if d, err := time.ParseDuration(at); err == nil {
					ts = time.Now().Add(-d).UTC().Format(time.RFC3339)
				} else if _, err := time.Parse(time.RFC3339, at); err == nil {
					ts = at
				} else {
					return fmt.Errorf("--at wants RFC3339 or a duration")
				}
			}
			tl, gvr, ns, err := timeline(cmd.Context(), args[0], ts)
			if err != nil {
				return err
			}
			u := &unstructured.Unstructured{}
			if err := json.Unmarshal(tl.Object, &u.Object); err != nil {
				return err
			}
			reborn(u)
			if dry {
				out, _ := yaml.Marshal(u.Object)
				_, err := cmd.OutOrStdout().Write(out)
				return err
			}
			cfg, err := kubeFlags.ToRESTConfig()
			if err != nil {
				return err
			}
			dc, err := dynamic.NewForConfig(cfg)
			if err != nil {
				return err
			}
			var ri dynamic.ResourceInterface = dc.Resource(gvr)
			if ns != "" {
				ri = dc.Resource(gvr).Namespace(ns)
			}
			data, _ := json.Marshal(u.Object)
			force := true
			if _, err := ri.Patch(cmd.Context(), u.GetName(), types.ApplyPatchType, data, metav1.PatchOptions{FieldManager: "sankofa-fetch", Force: &force}); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%s fetched back (%s).\n", args[0], tl.Story)
			return nil
		},
	}
	c.Flags().StringVar(&at, "at", "", "point in time: RFC3339, or a duration back from now (e.g. 2h)")
	c.Flags().BoolVar(&dry, "dry-run", false, "print the object instead of restoring it")
	return c
}

// reborn strips what belongs to a past life.
func reborn(u *unstructured.Unstructured) {
	for _, f := range []string{"uid", "creationTimestamp", "generation", "deletionTimestamp", "deletionGracePeriodSeconds", "ownerReferences", "resourceVersion", "selfLink", "managedFields"} {
		unstructured.RemoveNestedField(u.Object, "metadata", f)
	}
	unstructured.RemoveNestedField(u.Object, "status")
	ann := u.GetAnnotations()
	delete(ann, "kubectl.kubernetes.io/last-applied-configuration")
	if ann == nil {
		ann = map[string]string{}
	}
	ann["sankofa.kuberoot.dev/fetched-at"] = time.Now().UTC().Format(time.RFC3339)
	u.SetAnnotations(ann)
}

func obituariesCmd() *cobra.Command {
	var all bool
	c := &cobra.Command{
		Use:   "obituaries",
		Short: "Who died lately: deleted objects Griot still remembers",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := kubeFlags.ToRESTConfig()
			if err != nil {
				return err
			}
			kc, err := kubernetes.NewForConfig(cfg)
			if err != nil {
				return err
			}
			p := "/apis/" + history.Group + "/" + history.Version + "/namespaces/" + namespace() + "/timelines"
			if all {
				p = "/apis/" + history.Group + "/" + history.Version + "/timelines"
			}
			raw, err := kc.Discovery().RESTClient().Get().AbsPath(p).DoRaw(cmd.Context())
			if err != nil {
				return err
			}
			var list history.TimelineList
			if err := json.Unmarshal(raw, &list); err != nil {
				return err
			}
			for _, t := range list.Items {
				m := t.Moments[len(t.Moments)-1]
				fmt.Fprintf(cmd.OutOrStdout(), "%s  %-12s %s/%s\n", m.At.Local().Format("2006-01-02 15:04"), t.Kind, t.Namespace, t.Target.Name)
			}
			if len(list.Items) == 0 {
				fmt.Fprintln(cmd.OutOrStdout(), "No one died. Or no one is remembered yet.")
			}
			return nil
		},
	}
	c.Flags().BoolVarP(&all, "all-namespaces", "A", false, "in all namespaces")
	return c
}
