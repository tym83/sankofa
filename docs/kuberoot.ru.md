# Sankofa на kuberoot

Профиль Sankofa строится из **edge**. Скрипт `hack/kuberoot.sh` извлекает
закреплённый коммит kuberoot во временный каталог, добавляет `distros/sankofa`
и вызывает штатный `hack/hetzner.sh`. Исходный checkout kuberoot не меняется.
По умолчанию он находится в `../kuberoot`; переопределение — через
`KUBEROOT_SRC` и `KUBEROOT_REF`.

В образ узла встроены статические бинарники `griot` и `sankofa`. На control
plane Griot запускает kinit после API server. Память хранится в
`/var/lib/griot/memory.db`; у установленного узла `/var` находится на разделе
состояния системного диска. История live-системы временная: устанавливайте
узлы до запуска рабочих нагрузок. Топология стенда: **один control plane и
два worker**. Репликация памяти и несколько одновременно публикующих
endpoint экземпляров Griot пока не поддерживаются.

Service `sankofa-system/griot` не имеет selector. Griot регистрирует IP узла
в Endpoints, порт HTTPS — 8443. Сертификат соответствует DNS-имени Service;
его CA повторно записывается в APIService истории и конфигурации вебхуков.
CRD, namespace, RBAC и вебхуки устанавливаются как addons. Карточки и квесты
встроены в Griot. Собственные контейнерные образы и registry не нужны. Носитель по умолчанию
передаёт `kuberoot.distro=edge` для подписки на базовые пакеты; встроенный
профиль служб остаётся Sankofa.
Служба узла использует admin kubeconfig по схеме референсной интеграции;
RBAC ServiceAccount сохранён и для обычного запуска Griot как Deployment.

## Сборка

На рабочей машине нужны Bash, Python 3, Git, kubectl, checkout kuberoot и
доступ к workshop. Тяжёлая сборка и Go-тесты выполняются только в сборщике.

```sh
hack/kuberoot.sh builder
kubectl --kubeconfig "$HOME/workshop.txt" --context admin@workshop \
  -n tenant-sankofa wait pod/sankofa-builder --for=condition=Ready --timeout=180s
hack/kuberoot.sh test
export KUBEROOT_VERSION=0.1.0-sankofa.2
hack/kuberoot.sh build amd64
hack/kuberoot.sh media amd64
```

Собственные ресурсы сборщика в `tenant-sankofa`: PVC `sankofa-build`, Pod и
Service `sankofa-builder`. Исходники, кеши и результаты находятся под `/work`.
Файловый сервер отдаёт только `/work/out`, без `/work/trust` и `/work/kube`.
Контейнера registry нет. Суммарный CPU request сборщика — 100m; число
параллельных компиляторов ограничено четырьмя. Каждая VM стенда имеет
1 vCPU и 4 GiB RAM. Перед созданием VM проверяйте квоту. Ради стенда нельзя
менять музей или увеличивать квоту.

Перед bootstrap и тестами установите Linux amd64 kubectl v1.37.2 внутри
сборщика в `/work/bin/kubectl`. Скачайте его с
`https://dl.k8s.io/release/v1.37.2/bin/linux/amd64/kubectl`, проверьте по
соседнему файлу `kubectl.sha256` и сделайте исполняемым. Hydrophone v0.8.0
установите в `/work/bin/hydrophone` из официального
[release](https://github.com/kubernetes-sigs/hydrophone/releases/tag/v0.8.0):
перед распаковкой проверьте `hydrophone_Linux_x86_64.tar.gz` по
`hydrophone_0.8.0_checksums.txt`. Войти в сборщик можно через
`hack/kuberoot.sh sh`.

## Запуск и установка

```sh
hack/kuberoot.sh node sankofa-1 amd64
hack/kuberoot.sh node sankofa-2 amd64
hack/kuberoot.sh node sankofa-3 amd64
```

Создаются только VMInstance/VMDisk с префиксом `sankofa-` в `tenant-sankofa`.
При тесной квоте дождитесь импорта и запуска каждой VM перед следующей.
В статусе собственных VMInstance/VirtualMachineInstance найдите внутренние
IP трёх узлов. Во всех вызовах kubectl к workshop явно указывайте
`--kubeconfig "$HOME/workshop.txt" --context admin@workshop -n tenant-sankofa`.

Внутри сборщика выполните `hack/kuberoot/bootstrap.py install IP1 IP2 IP3`,
указав `KUBECTL` с путём к kubectl. Скрипт проверяет дистрибутив Sankofa и
пустой диск `vdb`, устанавливает систему на диск и оставляет узлы работающими
с носителя. У каждой собственной VMInstance выставьте `spec.runStrategy: Halted` и
дождитесь исчезновения соответствующей VirtualMachineInstance. Затем замените
`spec.disks` на `[{"name":"sankofa-N-system"}]` и выставьте `runStrategy: Always`.
Узел загрузится с установленного диска. Перед присоединением проверьте новые
IP: они могут измениться. Не повторяйте команду `node` для установленной VM —
она снова подключит загрузочный носитель.

На этом стенде Helm-контроллер VMInstance может ждать Ready от остановленной
VM и задерживать следующий запуск. После задания Always и единственного
системного диска выполните на рабочей машине
`python3 hack/kuberoot/start-installed.py`. Скрипт проверяет заданное состояние
и применяет его только к трём собственным остановленным VirtualMachine.
Данные дисков и другие тенанты не меняются; повторный запуск при уже
применённой конфигурации ничего не делает.

Затем внутри сборщика выполните `hack/kuberoot/bootstrap.py join IP1 IP2 IP3`.
Скрипт проверит установленный boot slot и присоединит узлы 2 и 3 как workers.
Приватный kubeconfig сохраняется в `/work/kube/sankofa.conf`. Не включайте его
в репозиторий или архивы результатов. Его current-context используется для
дальнейших тестов. Workshop kubeconfig не применяется к вложенному кластеру.

## Проверки

В сборщике, после передачи актуальных исходников через `hack/kuberoot.sh test`:

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

Используйте Hydrophone v0.8.0 из официального release и проверьте checksum
архива перед распаковкой. Conformance-скрипт закрепляет официальный образ
Kubernetes v1.37.2 по SHA-256 digest индекса, проверяет три Ready-узла,
APIService и вебхуки Sankofa, затем запускает весь conformance в четыре потока
(число потоков меняется через `CONFORMANCE_PARALLEL`).
В `/work/results` сохраняются вывод, JUnit и e2e-логи upstream, идентификатор
образа, версия runner, состояние узлов и вебхуков, строгий итоговый отчёт.
Успех требует **462 пройденных теста, ноль ошибок и ноль пропущенных
conformance-тестов**. Исключений через skip нет. Отсутствующий отчёт или
другое число тестов завершают скрипт ошибкой.

Шесть функциональных проверок создают уникальные ресурсы и удаляют только их:

- Карточки есть в кластере; `sankofa dict --plain` читает также карточку,
  созданную только на сервере.
- Deployment записан в память, удалён и восстановлен с прежней spec и новым UID.
- При глобальном доступе к API истории внутренний SubjectAccessReview
  разрешает одну namespace и запрещает/фильтрует другую.
- Защищённая namespace не удаляется до совета, после преждевременной речи
  вождя и после обычных голосов; удаляется после заключительной речи вождя.
- Двенадцать CronJob с `H 3 * * *` получают разные допустимые минуты.
- Credits молчит без метки namespace и предупреждает после её установки.

Диагностика службы узла: kubeconfig `/work/trust/admin.kubeconfig`, context
`kuberoot`, `--server https://NODE_IP:50000`; ресурсы `osconfigs`,
`nodeservices griot`, `bootentries` и подресурс логов службы. После рестарта
Griot заново создаёт сертификат и восстанавливает доверие, сохраняя память
на диске.

Документация runner: <https://github.com/kubernetes-sigs/hydrophone>.
Результаты завершённого прогона приведены ниже и сохранены в артефактах.

## Подписанные обновления и сохранность памяти

При изменении бинарников или профиля соберите образ с новым
`KUBEROOT_VERSION`, затем выполните `hack/kuberoot.sh bundle amd64`. Архив,
digest и подпись окажутся в `/work/out/amd64/bundles`. Из сборщика запустите
`python3 hack/kuberoot/upgrade.py VERSION BUNDLE_URL SHA256 IP1 IP2 IP3`.
BUNDLE_URL указывает на Service сборщика, порт 8080. Каждый узел проверяет
подпись встроенным ключом, подготавливает неактивный слот, перезагружается
и должен подтвердить версию и состояние Good до обновления следующего узла.

Перед conformance скрипт `hack/e2e/persistence.py` дополнительно проверяет,
что удалённый объект можно восстановить после настоящей перезагрузки control
plane. Кроме переменных E2E задайте `SANKOFA_NODE_IP` и
`SANKOFA_NODE_KUBECONFIG=/work/trust/admin.kubeconfig`. Этот тест намеренно
перезагружает control plane; другие тесты в это время не должны работать.

Профиль службы Griot задаёт `KUBE_FEATURE_WatchListClient=false` для этой базы
edge/kine: на стенде начальный streaming-list не завершался bookmark-событием.
Обычный LIST с последующим WATCH сохраняет границу resourceVersion и позволяет
регистратору начать работу. Выбор upstream conformance-тестов не меняется.

## Проверено на стенде — 2026-11-12

Все три установленных узла работали на `0.1.0-sankofa.2`, Kubernetes v1.37.2,
ядре 6.18.62-kuberoot и containerd 2.4.2. Control plane — `kuberoot-a23175`,
worker-узлы — `kuberoot-0c599e` и `kuberoot-2dc975`.

| Проверка | Результат |
| --- | --- |
| `go test ./...` в сборщике | Успешно |
| Функциональные E2E | 6/6 пройдено |
| Перезагрузка control plane и восстановление из памяти | Успешно |
| Upstream conformance, четыре потока | **462/462, 0 ошибок, 0 пропущенных выбранных тестов** |
| Состояние после conformance | 3 Ready-узла, API истории Available, Griot Running |

Полный conformance-набор выполнялся 2520.338 секунды; Hydrophone завершился
с кодом 0. Остальные 2744 upstream-сценария не входят в стандартную выборку
Conformance. Ни один выбранный conformance-тест не исключён. Официальный
образ закреплён по digest:
`registry.k8s.io/conformance@sha256:d503a15722ea23662c482b72ce01ee6e9efec1e8b9c2d3834aa0c51bb2d0832a`.

Артефакты сохранены в сборщике под `/work/results`; успешный прогон находится
в `conformance-20261112-parallel/`: `junit_01.xml`, `e2e.log`, `hydrophone.log`,
`summary.json`, данные образа и окружения. Ранние неудачные E2E и прерванный
последовательный conformance сохранены отдельно и не считаются результатом
приёмки. Экспортированный архив:
`~/Downloads/sankofa-kuberoot-validation-2026-11-12.tar.gz`.

Загрузочный носитель и подписанный bundle оставлены на PVC сборщика в
`/work/out/amd64`. SHA-256 bundle:
`f00f7bec372293b6ed39263e802b27450916656d8bb27952ad37e314fc399340`.
В артефактах также есть контрольные суммы бинарников и носителя. Приватные
kubeconfig и ключи подписи находятся вне архива и файлового сервера. Музей
и квота tenant не изменялись.
