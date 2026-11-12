# Sankofa on kuberoot

Sankofa derives its distribution profile from kuberoot **edge**. The wrapper
`hack/kuberoot.sh` archives the pinned kuberoot revision into a temporary tree,
adds `distros/sankofa`, then calls kuberoot's own `hack/hetzner.sh`. It never
changes the reference checkout. The default source is `../kuberoot`; set
`KUBEROOT_SRC` and `KUBEROOT_REF` to use another checkout/revision.

The node image contains static `griot` and `sankofa` binaries. On the control
plane, kinit supervises Griot after the API server starts. Griot creates
`/var/lib/griot/memory.db`; after disk installation, `/var` is the persistent
state partition. Live-media history is temporary: install before running
workloads. The tested topology is **one control plane and two workers**.
Multiple Griot endpoint publishers and replicated memory are not supported.

The `sankofa-system/griot` Service has no selector. Griot registers the node IP
as its HTTPS Endpoint, on port 8443, and reconciles serving CA bundles into
the history APIService and admission configurations. The serving certificate
matches the Service DNS name. CRDs, namespace, RBAC and webhooks are addons;
card and quest content is embedded in Griot. No Sankofa container image or
registry is involved. Media defaults to `kuberoot.distro=edge` for the base
package subscription; the baked node-service profile remains Sankofa. Node startup uses the admin kubeconfig, as in the
reference node-service integration; the addon ServiceAccount RBAC also remains
available for the ordinary Deployment installation.

## Build

Prerequisites on the workstation: Bash, Python 3, Git, kubectl, the kuberoot
checkout, and workshop credentials. Heavy builds and Go tests run in the
owned builder, never on the workstation.

```sh
hack/kuberoot.sh builder
kubectl --kubeconfig "$HOME/workshop.txt" --context admin@workshop \
  -n tenant-sankofa wait pod/sankofa-builder --for=condition=Ready --timeout=180s
hack/kuberoot.sh test
hack/kuberoot.sh build amd64
hack/kuberoot.sh media amd64
```

The builder's PVC is `sankofa-build`, Pod and Service are `sankofa-builder`,
all in `tenant-sankofa`. Sources, caches and artifacts stay under `/work`.
The file server exposes `/work/out`, not `/work/trust` or `/work/kube`.
The builder has no registry container. Its CPU requests total 100m; builds
use at most four compiler workers. Each stand VM has 1 vCPU and 4 GiB RAM.
Check tenant quota before creating nodes; never raise quota or modify the
museum to make room.

## Boot and install

```sh
hack/kuberoot.sh node sankofa-1 amd64
hack/kuberoot.sh node sankofa-2 amd64
hack/kuberoot.sh node sankofa-3 amd64
```

These commands create only `sankofa-*` VMInstance/VMDisk resources in
`tenant-sankofa`, importing media from our builder. Wait for each import and VM
before creating the next if quota is tight. Inspect the owned VMInstance and
VirtualMachineInstance status to obtain the three internal node addresses.
All workshop kubectl calls must specify `--kubeconfig "$HOME/workshop.txt"
--context admin@workshop -n tenant-sankofa` explicitly.

Run `hack/kuberoot/bootstrap.py install IP1 IP2 IP3` **inside the builder**
with `KUBECTL` pointing to its kubectl binary. It verifies the Sankofa distro
and empty `vdb`, installs each node onto that disk, and leaves it running from
media. On each owned VMInstance, set `spec.runStrategy: Halted` and wait for its
VirtualMachineInstance to disappear. Then replace `spec.disks` with just
`[{"name":"sankofa-N-system"}]` and set `runStrategy: Always`.
This boots the installed system without its media disk. Read the new VMI
addresses before joining; addresses can change across a stop/start. Do not
repeat the initial `node` command on installed VMs, since it reattaches media.

Run `hack/kuberoot/bootstrap.py join IP1 IP2 IP3` in the builder. It waits for
healthy installed boot slots and joins nodes 2 and 3 as workers using the node
API. The resulting private kubeconfig is `/work/kube/sankofa.conf`; never copy
it into this repository or evidence archives. Inspect its current-context
and use that value below. The workshop kubeconfig is never used for tests
inside the nested distribution.

## Feature and upstream tests

In the builder, after copying the current source with `hack/kuberoot.sh test`:

```sh
export KUBECTL=/work/bin/kubectl
export SANKOFA_CLI=/work/out/amd64/sankofa/sankofa
export SANKOFA_KUBECONFIG=/work/kube/sankofa.conf
export SANKOFA_CONTEXT=$($KUBECTL --kubeconfig "$SANKOFA_KUBECONFIG" config current-context)
cd /work/src/sankofa
mkdir -p /work/results
E2E_RESULTS=/work/results/features-results.json python3 hack/e2e/features.py
HYDROPHONE=/work/bin/hydrophone hack/e2e/conformance.sh
```

Use Hydrophone v0.8.0 from its official release, verifying the release
checksum before extracting it. The conformance script pins the official
Kubernetes v1.37.2 image by SHA-256 index digest, checks three Ready nodes and
Sankofa API/webhooks, then runs the complete conformance selection serially.
It retains stdout, upstream JUnit/e2e logs, image identity, runner version,
node and webhook state, and a strict summary under `/work/results`. It requires
**462 passed, zero failed, zero skipped conformance cases**. There is no skip
expression. A missing report or wrong test count fails the command.

The feature suite creates uniquely named resources and cleans up only those:

- Cluster cards and a server-only card read through `sankofa dict --plain`.
- A recorded Deployment deleted and fetched with the same spec and a new UID.
- History globally readable at the API layer, with inner SubjectAccessReview
  allowing one namespace and denying/filtering the other.
- Protected namespace deletion denied before a council, after the chief speaks
  early, and after ordinary voices; allowed only after the chief speaks last.
- Twelve `H 3 * * *` schedules converted to distinct valid minutes.
- Credits absent in an unlabelled namespace and present in a labelled namespace.

For node-service diagnostics, use the private node trust kubeconfig at
`/work/trust/admin.kubeconfig`, context `kuberoot`, and
`--server https://NODE_IP:50000`: inspect `osconfigs`, `nodeservices griot`,
`bootentries`, and the node-service log subresource. Griot restart recreates
its serving certificate and repairs trust without discarding disk memory.

Upstream runner reference: <https://github.com/kubernetes-sigs/hydrophone>.
Recorded stand results belong in the session journal and retained evidence;
the acceptance target above is not a claim of a completed run.
