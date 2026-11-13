// Package admission holds the distribution's admission webhooks: Kgotla (a
// council before dangerous deletions), Polyrhythm (cron jobs that do not all
// start on the same beat) and Credits (images that declare their lineage).
package admission

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Handler decides on one admission request.
type Handler func(r *http.Request, req *admissionv1.AdmissionRequest) *admissionv1.AdmissionResponse

// Serve adapts a Handler to HTTP.
func Serve(h Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var review admissionv1.AdmissionReview
		if err := json.Unmarshal(body, &review); err != nil || review.Request == nil {
			http.Error(w, "bad AdmissionReview", http.StatusBadRequest)
			return
		}
		resp := h(r, review.Request)
		if resp == nil {
			resp = Allow()
		}
		resp.UID = review.Request.UID
		review.Response = resp
		review.Request = nil
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(review)
	}
}

// Allow admits the request.
func Allow(warnings ...string) *admissionv1.AdmissionResponse {
	return &admissionv1.AdmissionResponse{Allowed: true, Warnings: warnings}
}

// Deny refuses the request with a message.
func Deny(code int32, format string, a ...any) *admissionv1.AdmissionResponse {
	return &admissionv1.AdmissionResponse{Allowed: false, Result: &metav1.Status{
		Status: metav1.StatusFailure, Code: code, Message: fmt.Sprintf(format, a...), Reason: metav1.StatusReasonForbidden,
	}}
}

// Patch admits with a JSON patch.
func Patch(ops []map[string]any, warnings ...string) *admissionv1.AdmissionResponse {
	data, _ := json.Marshal(ops)
	pt := admissionv1.PatchTypeJSONPatch
	return &admissionv1.AdmissionResponse{Allowed: true, Patch: data, PatchType: &pt, Warnings: warnings}
}
