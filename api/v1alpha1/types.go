// Package v1alpha1 is the sankofa.kuberoot.dev API: cards of the dictionary
// and quests. Every Card description ends with a link to the atlas, so
// `kubectl explain card` answers with history too.
// +kubebuilder:object:generate=true
// +groupName=sankofa.kuberoot.dev
package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/scheme"
)

// GroupVersion is the API group and version.
var GroupVersion = schema.GroupVersion{Group: "sankofa.kuberoot.dev", Version: "v1alpha1"}

var (
	SchemeBuilder = &scheme.Builder{GroupVersion: GroupVersion}
	AddToScheme   = SchemeBuilder.AddToScheme
)

func init() {
	SchemeBuilder.Register(&Card{}, &CardList{}, &Quest{}, &QuestList{}, &Kgotla{}, &KgotlaList{})
}

// Place is a point on the atlas.
type Place struct {
	Name string `json:"name"`
	// Latitude in degrees, as a decimal string.
	Lat string `json:"lat"`
	// Longitude in degrees, as a decimal string.
	Lon string `json:"lon"`
}

// Source backs the facts on a card.
type Source struct {
	Title string `json:"title"`
	// +optional
	URL string `json:"url,omitempty"`
}

// Media is a public-domain or openly licensed image or recording.
type Media struct {
	// +kubebuilder:validation:Enum=image;audio
	Type string `json:"type"`
	File string `json:"file"`
	// +optional
	Caption string `json:"caption,omitempty"`
	Credit  string `json:"credit"`
	License string `json:"license"`
	// +optional
	URL string `json:"url,omitempty"`
}

// CardSpec is one short, sourced piece of culture.
type CardSpec struct {
	// +kubebuilder:validation:Enum=person;genre;place;object;language;script;instrument;event;media;work;myth;comparison
	Kind  string `json:"kind"`
	Title string `json:"title"`
	// The one-line hook.
	Wow string `json:"wow"`
	// +kubebuilder:validation:MinItems=1
	// +kubebuilder:validation:MaxItems=2
	Years []int `json:"years"`
	// +kubebuilder:validation:MinItems=1
	Places []Place `json:"places"`
	// Atlas zoom: 1 centuries, 2 regions, 3 cities and genres, 4 people, 5 a document.
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=5
	Zoom int `json:"zoom"`
	// +optional
	Era string `json:"era,omitempty"`
	// voices (their own words), archives (records of those who traded and ruled), heirs (diaspora and memory).
	// +kubebuilder:validation:MinItems=1
	Books []string `json:"books"`
	// +kubebuilder:validation:Enum=both;m;f
	// +optional
	Edition string `json:"edition,omitempty"`
	// +optional
	Pair string `json:"pair,omitempty"`
	// +optional
	Tags []string `json:"tags,omitempty"`
	// +optional
	Genres []string `json:"genres,omitempty"`
	// For genres: the genres it grew from.
	// +optional
	Roots []string `json:"roots,omitempty"`
	// +optional
	Further []string `json:"further,omitempty"`
	// +kubebuilder:validation:MinItems=1
	Sources []Source `json:"sources"`
	// +optional
	Media []Media `json:"media,omitempty"`
	// +optional
	Dispute string `json:"dispute,omitempty"`
	// The card text with [[id]] cross-references.
	Body string `json:"body"`
}

// Card is an entry of the Sankofa dictionary. Read it with `sankofa dict`, or
// open it in the museum at #focus=<name>.
// +kubebuilder:object:root=true
// +kubebuilder:resource:scope=Cluster,shortName=cd
// +kubebuilder:printcolumn:name="Title",type=string,JSONPath=`.spec.title`
// +kubebuilder:printcolumn:name="Kind",type=string,JSONPath=`.spec.kind`
// +kubebuilder:printcolumn:name="Era",type=string,JSONPath=`.spec.era`
// +kubebuilder:printcolumn:name="Wow",type=string,JSONPath=`.spec.wow`,priority=1
type Card struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              CardSpec `json:"spec"`
}

// CardList is a list of cards.
// +kubebuilder:object:root=true
type CardList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Card `json:"items"`
}

// QuestSpec describes a quest: a dilemma, a quiz, a dictionary walk or a
// cluster task that needs knowledge to fix.
type QuestSpec struct {
	// +kubebuilder:validation:Enum=dilemma;quiz;walk;cluster
	Type  string `json:"type"`
	Title string `json:"title"`
	// The situation or the question.
	Prompt string `json:"prompt"`
	// Choices for dilemmas and quizzes.
	// +optional
	Choices []string `json:"choices,omitempty"`
	// For quizzes: the index of the right choice. Dilemmas have no right answer.
	// +optional
	Answer *int `json:"answer,omitempty"`
	// What really happened, shown after the reader answers.
	Reveal string `json:"reveal"`
	// Cards the quest opens.
	// +optional
	Cards []string `json:"cards,omitempty"`
	// For walks: the start and the goal card, and the link budget.
	// +optional
	From string `json:"from,omitempty"`
	// +optional
	To string `json:"to,omitempty"`
	// +optional
	MaxSteps int `json:"maxSteps,omitempty"`
	// For cluster quests: the check that must pass, e.g. "package rock-n-roll Installed".
	// +optional
	Check string `json:"check,omitempty"`
}

// Quest is a game that helps to understand. Play it with `sankofa quest`.
// +kubebuilder:object:root=true
// +kubebuilder:resource:scope=Cluster
// +kubebuilder:printcolumn:name="Type",type=string,JSONPath=`.spec.type`
// +kubebuilder:printcolumn:name="Title",type=string,JSONPath=`.spec.title`
type Quest struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              QuestSpec `json:"spec"`
}

// QuestList is a list of quests.
// +kubebuilder:object:root=true
type QuestList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Quest `json:"items"`
}

var _ runtime.Object = &Card{}

// Target names the object a council decides about.
type Target struct {
	// +optional
	Group    string `json:"group,omitempty"`
	Resource string `json:"resource"`
	// +optional
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

// Voice is a participant who has spoken.
type Voice struct {
	User string      `json:"user"`
	At   metav1.Time `json:"at"`
}

// KgotlaSpec is a council about one dangerous operation.
type KgotlaSpec struct {
	Target Target `json:"target"`
	// Why the operation is needed.
	Reason string `json:"reason"`
	// Users who must speak before the decision.
	// +kubebuilder:validation:MinItems=1
	Voices []string `json:"voices"`
	// The chief speaks last and fixes the decision.
	Chief string `json:"chief"`
	// Who has spoken, in order. Names are set by the admission webhook from
	// the authenticated user, never by the client.
	// +optional
	Spoken []Voice `json:"spoken,omitempty"`
}

// Kgotla is a council in the manner of the Tswana kgotla: everyone speaks,
// the chief speaks last, and only then a protected object may be deleted.
// +kubebuilder:object:root=true
// +kubebuilder:resource:scope=Cluster,shortName=council
// +kubebuilder:printcolumn:name="Target",type=string,JSONPath=`.spec.target.name`
// +kubebuilder:printcolumn:name="Chief",type=string,JSONPath=`.spec.chief`
type Kgotla struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              KgotlaSpec `json:"spec"`
}

// KgotlaList is a list of councils.
// +kubebuilder:object:root=true
type KgotlaList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Kgotla `json:"items"`
}

// Decided reports whether everyone has spoken and the chief spoke last.
func (k *Kgotla) Decided() bool {
	sp := k.Spec.Spoken
	if len(sp) == 0 || sp[len(sp)-1].User != k.Spec.Chief {
		return false
	}
	heard := map[string]bool{}
	for _, v := range sp {
		heard[v.User] = true
	}
	for _, v := range k.Spec.Voices {
		if !heard[v] {
			return false
		}
	}
	return true
}
