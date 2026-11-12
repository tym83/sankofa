package main

import (
	"context"
	"crypto/x509"
	"encoding/base64"
	"testing"

	admissionv1 "k8s.io/api/admissionregistration/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

func TestPublishWebhookCARepairsBundleWithoutRewriting(t *testing.T) {
	s := runtime.NewScheme()
	_ = admissionv1.AddToScheme(s)
	cl := fake.NewClientBuilder().WithScheme(s).WithObjects(&admissionv1.ValidatingWebhookConfiguration{
		ObjectMeta: metav1.ObjectMeta{Name: "sankofa-validating"},
		Webhooks:   []admissionv1.ValidatingWebhook{{Name: "kgotla.sankofa.kuberoot.dev", ClientConfig: admissionv1.WebhookClientConfig{CABundle: []byte("old")}}},
	}).Build()
	ctx := context.Background()
	var firstVersion string
	for i := 0; i < 2; i++ {
		if err := publishWebhookCA(ctx, cl, "sankofa-validating", []byte("new")); err != nil {
			t.Fatal(err)
		}
		var got admissionv1.ValidatingWebhookConfiguration
		if err := cl.Get(ctx, client.ObjectKey{Name: "sankofa-validating"}, &got); err != nil {
			t.Fatal(err)
		}
		if string(got.Webhooks[0].ClientConfig.CABundle) != "new" {
			t.Fatalf("wrong CA: %s", base64.StdEncoding.EncodeToString(got.Webhooks[0].ClientConfig.CABundle))
		}
		if i == 0 {
			firstVersion = got.ResourceVersion
		} else if got.ResourceVersion != firstVersion {
			t.Fatal("unchanged bundle caused a write")
		}
	}
}

func TestServingCertificateMatchesSelectorlessService(t *testing.T) {
	cert, _, err := selfSigned("griot.sankofa-system.svc")
	if err != nil {
		t.Fatal(err)
	}
	leaf, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatal(err)
	}
	if err := leaf.VerifyHostname("griot.sankofa-system.svc"); err != nil {
		t.Fatal(err)
	}
}
