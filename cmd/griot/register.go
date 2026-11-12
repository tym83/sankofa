package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

// The node service uses the same DNS certificate and Service as the addon.
// The stand has one control plane: SQLite and its serving endpoint stay on it.
func publishEndpoint(ctx context.Context, cl client.Client, ip string) error {
	ep := &corev1.Endpoints{
		TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "Endpoints"},
		ObjectMeta: metav1.ObjectMeta{Name: "griot", Namespace: "sankofa-system"},
		Subsets:    []corev1.EndpointSubset{{Addresses: []corev1.EndpointAddress{{IP: ip}}, Ports: []corev1.EndpointPort{{Name: "https", Port: 8443, Protocol: corev1.ProtocolTCP}}}},
	}
	return cl.Patch(ctx, ep, client.Apply, client.FieldOwner("griot-node"), client.ForceOwnership)
}

func reconcile(ctx context.Context, log *slog.Logger, cl client.Client, apiService string, ca []byte, ip string, sync bool) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	synced := !sync
	for {
		// Read through the uncached client on every attempt: CRDs may have only
		// just been installed when this process started.
		if !synced {
			if err := syncCards(ctx, log, cl); err != nil {
				log.Warn("sync cards; retrying", "err", err)
			} else {
				synced = true
			}
		}
		if err := publishCA(ctx, cl, apiService, ca); err != nil {
			log.Warn("publish API CA; retrying", "err", err)
		}
		for _, name := range []string{"sankofa-validating", "sankofa-mutating"} {
			if err := publishWebhookCA(ctx, cl, name, ca); err != nil {
				log.Warn("publish webhook CA; retrying", "name", name, "err", err)
			}
		}
		if ip != "" {
			if err := publishEndpoint(ctx, cl, ip); err != nil {
				log.Warn("publish node endpoint; retrying", "err", fmt.Errorf("%s: %w", ip, err))
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
