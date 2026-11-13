# Built in the tenant builder by hack/kuberoot.sh, beside kuberoot's binaries.
for b in griot sankofa; do
  install -m 0755 "$OUT/sankofa/$b" "$r/usr/bin/$b"
done
mkdir -p "$r/var/lib/griot"
