# Session log — Sankofa (started 2026-11-12)

## Цель
Реализовать этап 0 дистрибутива Sankofa (бывш. Блэкнетес) по concept.ru.md: карточки, Griot, CLI `sankofa`, атлас, память объектов и `fetch`, credits, веб-музей, публичный кластер на чтение.

## Текущее состояние
- Репо: ~/projects/sankofa (git, ветка feat/concept, remote нет). Go-модуль github.com/tym83/sankofa.
- Стенд: кластер workshop (`--kubeconfig ~/workshop.txt --context admin@workshop`). Тенант `sankofa` (tenant-root, квота 24 CPU/48Gi) создан 12.11; в нём Kubernetes `museum` (v1.35, 2× u1.large) — hack/workshop/*.yaml. Кубконфиг museum — секрет в tenant-sankofa (ещё не вытащен).
- Код: pkg/card, pkg/atlas, pkg/reader, pkg/history (SQLite + aggregated API history.sankofa.kuberoot.dev), cmd/griot, cmd/sankofa (content, dict, tell, fetch, obituaries), CRDs deploy/crds.
- Параллельно: агент контента (content/), агент веба (web/). Свои коммиты — только по путям, не git add -A.
- Образы: у gh нет write:packages — нужен `gh auth refresh -s write:packages` от пользователя, иначе реестр в тенанте.
- Решения: код пишет Claude в сессии; домена нет, работаем по IP; API-группа sankofa.kuberoot.dev.

## Следующий шаг
Дождаться museum Ready, вытащить кубконфиг, собрать образ griot (ko), манифесты deploy/griot, e2e память+fetch.

## Журнал
### 12.11 — старт
- Выбрано имя Sankofa, папка переименована, дизайн согласован с пользователем («ок делаем»).
- Проверено: go 1.26.5, kind есть, k3d/crane/controller-gen нет; workshop API отвечает.

### 12.11 — ядро
- Карточки, словарь TUI, CRD Card/Quest, Griot (синк карточек, запись истории, aggregated API, SAR), CLI tell/fetch/obituaries. Тесты зелёные.
- Запущены фоновые агенты: контент (~80 карточек + главы + медиа), веб-музей в стиле Snow Fall.
- Создан тенант sankofa и кластер museum.

## Distribution task — 2026-11-12

### Goal
Build the Sankofa kuberoot edge-based distribution, boot three isolated nodes in tenant-sankofa, prove all six features end to end, and retain upstream conformance evidence targeting 462/462. Document build, boot, and testing in English and Russian.

### Current state
Worktree /Users/tym83/projects/sankofa-kuberoot, branch feat/kuberoot; initially clean. Existing journal above is inherited historical context, not current distribution progress. The museum and its registry are excluded from all mutations. Heavy builds must run in our tenant builder.

### Next step
Inspect the Gachinetes reference and existing Griot, inspect tenant capacity read-only, then implement the profile and stand workflow.

### Open questions
None yet.

### Journal (append-only)
- Read repository AGENTS.md and verified the worktree and clean branch before implementation.
- Created isolated sankofa-builder Pod/PVC/Service in tenant-sankofa. Current quota has 505m free CPU requests; selected 100m builder requests and three 1-vCPU/4Gi nodes (expected 100m CPU request each). No museum resource was changed.
- Added edge-derived profile, node binaries extras, selectorless Griot Service and RBAC addons, and isolated wrapper around kuberoot's own hetzner workflow pinned to d6cb25699ba3e22fa1f8e707cd131c7409aa68dc. The stand uses one control plane and two workers; node-local memory is not HA-replicated.
- Added startup reconciliation for cards, CA bundles and node Endpoints; node memory directory is created before opening SQLite.
- go test ./... passed in sankofa-builder, including the new certificate and CA repair/idempotence tests. The base kernel is compiling remotely; Sankofa and upstream binaries are building independently in the same owned builder.
- Added six live feature checks, including a server-only Card, restore UID/spec assertions, inner-SAR denial and filtered lists, premature-chief council sequence, twelve distinct cron minutes, and positive/negative Credits warning controls.
- Verified the official registry.k8s.io/conformance:v1.37.2 image index digest d503a15722ea23662c482b72ce01ee6e9efec1e8b9c2d3834aa0c51bb2d0832a. Added pinned Hydrophone workflow and strict JUnit accounting; no conformance result is claimed yet.
- Committed Griot integration as dedf60a (signed off with the required assistance trailer). Git requires access to shared worktree metadata outside the writable root; escalation was approved, and no neighboring worktree files were edited.
- Added installation/join helper and bilingual build/boot/test documentation. Installed-node /var is persistent; initial live-media history is explicitly not promised to survive installation.
- Downloaded Hydrophone v0.8.0 to the owned builder and verified its official release checksum (revision 622f40fdea73362ca57bcdfe3a9dc534fdc36905).
- Reviewed base package startup: kuberoot.distro controls the meta-package subscription independently of the baked service profile. Media now defaults to kuberoot.distro=edge so it does not request an unpublished kuberoot-sankofa package. Corrected bootstrap identity checks to match kuberoot's OS NAME plus the required Griot service.
- Profile, scripts and bilingual docs committed as 77cd160. Client-side YAML validation and Python/shell syntax checks passed; strict JUnit acceptance was checked against complete, missing, failed and skipped synthetic reports.
- Committed the package-subscription/bootstrap correction as 48aaa01. All upstream binaries finished building; the kernel remains in progress. Prefetching the pinned Kubernetes binaries into our builder cache while waiting.
- Base Linux kernel 6.18.62 finished compiling in the builder; DRBD module build is in progress. Kubernetes v1.37.2 binaries were prefetched and kubectl installed in /work/bin. No VM has been created before complete boot artifacts exist.
- Kernel and DRBD compilation both completed successfully. The older long-running wrapper processes reported a shell parse error after their remote commands completed because the wrapper file had been edited while they were running. The current script passes bash -n; started a fresh complete hack/kuberoot.sh build followed by media, with the script now held unchanged for the run.
- Full hack/kuberoot.sh build amd64 completed successfully: Sankofa rootfs 321.4 MiB and initrd built. Boot media generation is running. No OOM kills occurred during rootfs compression within the 1Gi Alpine limit.
- Built boot media successfully (460 MiB), confirmed Griot/CLI and DRBD modules inside the squashfs, and created only sankofa-1 VMInstance plus sankofa-1-media/system VMDisk resources. Waiting for imported disks and VM readiness before allocating the next node.
- sankofa-1 booted from the generated media. Its node API responds at 10.244.24.77:50000 and lists Griot as a native kinit service. Created sankofa-2's own VM and disks; waiting for its import/boot.
- The first live control plane is Ready, its history APIService is Available, and Griot is running. This worktree contains exactly one card (bridgetower) and eleven quests; the parallel content branch is intentionally untouched. Replaced the E2E's unjustified ten-card threshold with an exact comparison against this worktree's exported source collection, retaining the server-only dictionary proof.
- All three live nodes booted (10.244.24.77, .81, .86), and bootstrap.py installed each onto its empty vdb system disk. Base edge packages (CoreDNS, local-path, metrics-server) are Ready. Halting only the three owned VMInstances before detaching their media and booting the installed disks.
- Found a workshop VMInstance controller transition issue: the Helm upgrade to runStrategy=Halted waits for VM readiness, leaving the next Always/system-only desired spec unapplied. Readback confirmed all three underlying VirtualMachines remained Halted with their old media disks despite the VMInstance specs already requesting Always and only system disks. Applied those same requested final settings directly to the three owned VirtualMachines only, preserving all other VM settings, to unblock readiness and subsequent reconciliation.
- All three owned VMs now run with only their installed system disks; IPs stayed .77/.81/.86. Added start-installed.py for the observed controller transition and verified its idempotent no-op on the configured VMs. Starting the worker-join workflow, which checks installed Good boot slots before joining.
- Installed cluster formed successfully: kuberoot-a23175 (control plane, 10.244.24.77), kuberoot-0c599e (.81), kuberoot-2dc975 (.86), all Ready on Kubernetes v1.37.2, kernel 6.18.62, containerd 2.4.2, OS image kuberoot 0.1.0-dev (sankofa). History APIService is Available and all three VMInstance applications are Ready. Running the live six-feature suite.
- First live feature run failed as intended at memory: cards passed, but no Deployment timeline appeared within 180s. Griot logs showed initial watch-list streams never receiving their end bookmarks. The profile now explicitly uses the ordinary List+Watch client path via KUBE_FEATURE_WatchListClient=false; no test is skipped or weakened.
- The same logs exposed malformed YAML in legend-or-document.yaml, preventing all quests from syncing. Fixed its quoted choice and added a regression test parsing every embedded quest. Building version 0.1.0-sankofa.1 and a signed upgrade bundle in the builder.
- Fixed image 0.1.0-sankofa.1 and signed bundle built successfully; bundle SHA-256 is 0e24e5e9d1c39a67aae7513d251588e5a63b466972db1add51fbc322cae6bc8d. Starting sequential node API upgrades. Also corrected the wrapper's media generation to pass the artifact VERSION explicitly, because upstream mkimage otherwise defaults its boot-media release metadata to 0.1.0-dev.
- Control plane successfully booted signed release 0.1.0-sankofa.1 in a Good slot; sequential worker updates are in progress. Rebuilt fresh-install media with the corrected explicit VERSION. The initial failed feature run and its Go-test/build/install/join logs are retained under /work/results.
- All three nodes completed signed upgrades to 0.1.0-sankofa.1 with Good boot slots and returned Ready. All eleven quests now sync. Re-running the unchanged feature assertions on the corrected installed distribution.
- The second run exposed a separate discovery bug: the namespaced raw history URL returned the recorded Deployment, but kubectl get timelines -n NS searched cluster scope and returned no memory. Both resources advertised Kind Timeline, so RESTMapper's Kind-to-scope mapping collided. Changed the cluster resource/objects to ClusterTimeline (and ClusterTimelineList), with regression tests exercising kubectl's actual RESTMapper path. The live tests remain ordinary kubectl calls. Building signed release 0.1.0-sankofa.2.
- Scope regression tests and go test ./... now pass. Independently ran the existing Kgotla, Polyrhythm and Credits feature functions on the stand; all three passed with their normal assertions. Retaining the full six-test run for after the discovery fix is installed.
- Signed 0.1.0-sankofa.2 bundle built with SHA-256 f00f7bec372293b6ed39263e802b27450916656d8bb27952ad37e314fc399340; sequential upgrades are running. E2E now uses its own temporary discovery cache so post-upgrade checks always see the current server schema, while keeping the same kubectl resource assertions.
- All three nodes now boot 0.1.0-sankofa.2 in Good slots; live discovery correctly advertises namespaced Timeline and cluster-scoped ClusterTimeline. Running the full six-feature suite with a fresh discovery cache, followed (only on success) by the real control-plane reboot/durable-memory check.
- Full six-feature E2E passed on installed 0.1.0-sankofa.2: cards, memory/restore, RBAC, Kgotla, Polyrhythm, Credits. The additional durability check rebooted the control plane (boot time changed from 19:45:21Z to 19:51:22Z), read the original deleted object's memory after reboot, and restored it with a new UID. Started the complete pinned upstream conformance run; results are pending.
- Committed signed-upgrade helper, real reboot E2E, fresh discovery cache and bilingual update instructions as 8d1bb9e. Python/shell syntax and git diff --check passed. Saved release .2 build/bundle/media/upgrade/Go-test/feature/persistence logs and SHA-256 checksums in /work/results/release-0.1.0-sankofa.2. Upstream runner selected exactly 462 of 3206 specs with an empty skip expression; the serial run is in progress.
- Interrupted the initial serial conformance run after 10m26s to reduce independent wait time with four workers; it had completed four cases, and is not an acceptance result. Its logs and image/state evidence are retained as conformance-20261112-serial-interrupted (the runner could not produce a valid JUnit file after the interruption). The full rerun will still select all 462 cases without skips. Added CONFORMANCE_PARALLEL, default 4, to the runner workflow and docs.
- The full four-worker upstream run completed all 462 conformance cases successfully in 2520.338 seconds (Ginkgo suite wall time 42m4.125s): 462 Passed, 0 Failed, 0 Pending. The 2744 other specs were excluded by the standard Conformance focus; no selected conformance case was skipped. Hydrophone is saving JUnit and cleaning its own nested-cluster resources. Final strict JUnit accounting and evidence export follow.
- Strict JUnit validation confirmed 462 executed, 462 passed, 0 failed, 0 selected skipped; Hydrophone and conformance.sh both exited 0. Its namespace and RBAC were cleaned up successfully. Post-run evidence confirms three Ready nodes, Available history API, Good installed release .2, and Griot Running with zero restarts since the persistence-test reboot.
- Updated both distribution guides with the tested release, builder client prerequisites, exact acceptance numbers, artifact locations and bundle digest. All requested implementation and live validation are complete; exporting the retained evidence to Downloads and performing final repository checks.
- Exported and independently verified /Users/tym83/Downloads/sankofa-kuberoot-validation-2026-11-12.tar.gz (108052 bytes; SHA-256 5a1e4e0238e464341af8461327d16f75ea5b70f95fe34b8d5be35d3fc6d459ab), with a sibling .sha256 file. Re-read archived JUnit to require all 462 selected cases to pass without failures/errors/skips, and checked archived six-feature and reboot results. Evidence private-key scan passed. Live images, signed bundles and original results remain on the owned builder PVC. Task complete; no open owner questions, no push or publication.
