package content_test

import (
	"testing"

	"github.com/tym83/sankofa/api/v1alpha1"
	"github.com/tym83/sankofa/content"
)

func TestEmbeddedQuestsDecode(t *testing.T) {
	quests, err := v1alpha1.LoadQuests(content.Quests())
	if err != nil {
		t.Fatal(err)
	}
	if len(quests) == 0 {
		t.Fatal("embedded quest collection is empty")
	}
	for _, q := range quests {
		if q.Name == "" || q.Spec.Title == "" {
			t.Fatalf("quest has no identity: %#v", q)
		}
	}
}
