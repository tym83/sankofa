package admission

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	admissionv1 "k8s.io/api/admission/v1"
	corev1 "k8s.io/api/core/v1"

	"github.com/tym83/sankofa/pkg/credits"
)

// Resolve returns the credits of an image.
type Resolve func(ctx context.Context, image string) *credits.Credit

// Credits checks that every image of a new pod declares its base image,
// source and licences. With enforce it refuses the pod; otherwise it warns.
// Unreadable registries never block: the webhook fails open on errors.
func Credits(resolve Resolve, enforce bool) Handler {
	return func(r *http.Request, req *admissionv1.AdmissionRequest) *admissionv1.AdmissionResponse {
		if req.Operation != admissionv1.Create {
			return Allow()
		}
		var pod corev1.Pod
		if err := json.Unmarshal(req.Object.Raw, &pod); err != nil {
			return Allow()
		}
		ctx, cancel := context.WithTimeout(r.Context(), 13*time.Second)
		defer cancel()
		var problems []string
		for _, c := range append(pod.Spec.InitContainers, pod.Spec.Containers...) {
			cr := resolve(ctx, c.Image)
			if cr == nil || cr.Error != "" {
				continue
			}
			if m := cr.Missing(); len(m) > 0 {
				problems = append(problems, fmt.Sprintf("%s does not declare its %s", c.Image, strings.Join(m, ", ")))
			}
		}
		if len(problems) == 0 {
			return Allow()
		}
		note := `"Hound Dog" was Big Mama Thornton's before it was Elvis's: declare what you stand on (OCI annotations ` + credits.BaseName + `, ` + credits.Source + `, ` + credits.Licenses + `)`
		if enforce {
			return Deny(403, "credits: %s. %s", strings.Join(problems, "; "), note)
		}
		return Allow(append(problems, note)...)
	}
}
