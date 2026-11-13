package v1alpha1

import (
	"fmt"
	"io/fs"
	"path"
	"strings"

	"sigs.k8s.io/yaml"
)

// LoadQuests reads quest definitions (*.yaml with metadata and spec).
func LoadQuests(fsys fs.FS) ([]*Quest, error) {
	var out []*Quest
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || path.Ext(p) != ".yaml" || strings.Count(path.Base(p), ".") > 1 {
			return err
		}
		data, err := fs.ReadFile(fsys, p)
		if err != nil {
			return err
		}
		q := &Quest{}
		if err := yaml.UnmarshalStrict(data, q); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
		q.APIVersion, q.Kind = GroupVersion.String(), "Quest"
		// <name>.<lang>.yaml next to the quest holds its translation.
		for _, lang := range []string{"ru"} {
			tp := strings.TrimSuffix(p, ".yaml") + "." + lang + ".yaml"
			td, err := fs.ReadFile(fsys, tp)
			if err != nil {
				continue
			}
			var t QuestText
			if err := yaml.UnmarshalStrict(td, &t); err != nil {
				return fmt.Errorf("%s: %w", tp, err)
			}
			if q.Spec.Translations == nil {
				q.Spec.Translations = map[string]QuestText{}
			}
			q.Spec.Translations[lang] = t
		}
		out = append(out, q)
		return nil
	})
	return out, err
}
