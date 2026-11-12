package admission

import (
	"context"
	"encoding/json"
	"hash/fnv"
	"net/http"
	"strconv"
	"strings"

	admissionv1 "k8s.io/api/admission/v1"
	batchv1 "k8s.io/api/batch/v1"
)

// WrittenSchedule keeps the schedule as the author wrote it.
const WrittenSchedule = "sankofa.kuberoot.dev/written-schedule"

// Taken returns the minutes already used by other cron jobs with the same
// hour fields, so a new job plays on a free beat.
type Taken func(ctx context.Context, rest, self string) map[int]bool

// Polyrhythm lets a CronJob write H in its minute field, as in Jenkins: the
// minute is chosen from a stable hash of namespace/name, moved to a free beat
// if another job with the same hour fields already plays there. Like parts in
// a 12/8 ensemble, jobs interlock instead of all striking at once.
func Polyrhythm(taken Taken) Handler {
	return func(r *http.Request, req *admissionv1.AdmissionRequest) *admissionv1.AdmissionResponse {
		if req.Operation != admissionv1.Create && req.Operation != admissionv1.Update {
			return Allow()
		}
		var cj batchv1.CronJob
		if err := json.Unmarshal(req.Object.Raw, &cj); err != nil {
			return Allow()
		}
		written := cj.Spec.Schedule
		fields := strings.Fields(written)
		if len(fields) != 5 || !strings.HasPrefix(fields[0], "H") {
			return Allow()
		}
		rest := strings.Join(fields[1:], " ")
		minute := Beat(req.Namespace+"/"+req.Name, taken(r.Context(), rest, req.Namespace+"/"+req.Name))
		step := 0
		if m := strings.TrimPrefix(fields[0], "H"); strings.HasPrefix(m, "/") {
			step, _ = strconv.Atoi(m[1:])
		}
		var min string
		if step > 0 && step < 60 {
			min = strconv.Itoa(minute%step) + "/" + strconv.Itoa(step)
		} else {
			min = strconv.Itoa(minute)
		}
		schedule := min + " " + rest
		ops := []map[string]any{{"op": "replace", "path": "/spec/schedule", "value": schedule}}
		if cj.Annotations == nil {
			ops = append(ops, map[string]any{"op": "add", "path": "/metadata/annotations", "value": map[string]string{}})
		}
		ops = append(ops, map[string]any{"op": "add", "path": "/metadata/annotations/" + strings.ReplaceAll(WrittenSchedule, "/", "~1"), "value": written})
		return Patch(ops, "polyrhythm: "+written+" plays as "+schedule)
	}
}

// Beat picks a minute from the hash of key, moving forward past taken minutes.
func Beat(key string, taken map[int]bool) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(key))
	m := int(h.Sum32() % 60)
	for i := 0; i < 60; i++ {
		if !taken[(m+i)%60] {
			return (m + i) % 60
		}
	}
	return m
}
