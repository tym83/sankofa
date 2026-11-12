package v1alpha1

import (
	"fmt"
	"io/fs"
	"path"

	"sigs.k8s.io/yaml"
)

// LoadQuests reads quest definitions (*.yaml with metadata and spec).
func LoadQuests(fsys fs.FS) ([]*Quest, error) {
	var out []*Quest
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || path.Ext(p) != ".yaml" {
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
		out = append(out, q)
		return nil
	})
	return out, err
}
