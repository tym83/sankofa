package admission

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/tym83/sankofa/api/v1alpha1"
)

// Protected marks an object that may only be deleted after a council.
const Protected = "sankofa.kuberoot.dev/kgotla"

// CouncilTTL is how long a decision stays valid.
const CouncilTTL = time.Hour

// Councils lists councils.
type Councils func(ctx context.Context) ([]v1alpha1.Kgotla, error)

// Kgotla guards deletions of protected objects: they need a decided council
// (everyone spoke, the chief last) that names them, younger than CouncilTTL.
func Kgotla(list Councils) Handler {
	return func(r *http.Request, req *admissionv1.AdmissionRequest) *admissionv1.AdmissionResponse {
		if req.Operation != admissionv1.Delete {
			return Allow()
		}
		var u unstructured.Unstructured
		if err := json.Unmarshal(req.OldObject.Raw, &u.Object); err != nil {
			return Allow()
		}
		if u.GetLabels()[Protected] != "protected" && u.GetAnnotations()[Protected] != "protected" {
			return Allow()
		}
		cs, err := list(r.Context())
		if err != nil {
			return Deny(503, "kgotla: cannot read councils: %v", err)
		}
		for i := range cs {
			k := &cs[i]
			t := k.Spec.Target
			if t.Group != req.Resource.Group || t.Resource != req.Resource.Resource || t.Name != req.Name || t.Namespace != req.Namespace {
				continue
			}
			if !k.Decided() {
				return Deny(403, "kgotla %s has not decided yet: everyone must speak and %s speaks last (`sankofa kgotla speak %s`)", k.Name, k.Spec.Chief, k.Name)
			}
			if last := k.Spec.Spoken[len(k.Spec.Spoken)-1].At.Time; time.Since(last) > CouncilTTL {
				return Deny(403, "kgotla %s decided more than %s ago; call a new council", k.Name, CouncilTTL)
			}
			return Allow("kgotla " + k.Name + " decided: " + k.Spec.Reason)
		}
		return Deny(403, "%s/%s is protected: call a council first (`sankofa kgotla call %s/%s --voices ... --chief ... --reason ...`)", req.Resource.Resource, req.Name, req.Resource.Resource, req.Name)
	}
}

// KgotlaSpeech keeps the record of who spoke honest: on create the record is
// empty; on update a client may only append one voice, and its name and time
// are replaced with the authenticated user and the current time.
func KgotlaSpeech(now func() time.Time) Handler {
	return func(_ *http.Request, req *admissionv1.AdmissionRequest) *admissionv1.AdmissionResponse {
		var k, old v1alpha1.Kgotla
		if err := json.Unmarshal(req.Object.Raw, &k); err != nil {
			return Deny(400, "kgotla: %v", err)
		}
		switch req.Operation {
		case admissionv1.Create:
			if len(k.Spec.Spoken) > 0 {
				return Patch([]map[string]any{{"op": "remove", "path": "/spec/spoken"}}, "a new council starts in silence")
			}
			return Allow()
		case admissionv1.Update:
			if err := json.Unmarshal(req.OldObject.Raw, &old); err != nil {
				return Deny(400, "kgotla: %v", err)
			}
		default:
			return Allow()
		}
		if old.Spec.Target != k.Spec.Target || old.Spec.Chief != k.Spec.Chief || !equal(old.Spec.Voices, k.Spec.Voices) || old.Spec.Reason != k.Spec.Reason {
			return Deny(403, "a council cannot change its question once called")
		}
		n, o := len(k.Spec.Spoken), len(old.Spec.Spoken)
		for i := 0; i < o && i < n; i++ {
			if k.Spec.Spoken[i].User != old.Spec.Spoken[i].User || !k.Spec.Spoken[i].At.Equal(&old.Spec.Spoken[i].At) {
				return Deny(403, "what was said cannot be unsaid")
			}
		}
		switch {
		case n == o:
			return Allow()
		case n != o+1:
			return Deny(403, "speak one at a time")
		}
		user := req.UserInfo.Username
		allowed := user == k.Spec.Chief
		for _, v := range k.Spec.Voices {
			if v == user {
				allowed = true
			}
		}
		if !allowed {
			return Deny(403, "%s is not a voice of this council", user)
		}
		if old.Decided() {
			return Deny(403, "the chief has spoken; the council is closed")
		}
		return Patch([]map[string]any{
			{"op": "replace", "path": "/spec/spoken/" + strconv.Itoa(n-1), "value": v1alpha1.Voice{User: user, At: metav1.NewTime(now().UTC().Truncate(time.Second))}},
		})
	}
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
