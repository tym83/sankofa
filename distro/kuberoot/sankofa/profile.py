"""Derive Sankofa from kuberoot edge; fail if the service anchor changes."""
import pathlib
import sys

text = pathlib.Path(sys.argv[1]).read_text()
anchor = "      - name: kube-scheduler\n        after: apiserver\n"
if text.count("\n  name: edge\n") != 1 or text.count(anchor) != 1:
    sys.exit("edge profile changed: expected metadata and control-plane scheduler")
text = text.replace("\n  name: edge\n", "\n  name: sankofa\n", 1)
# Kine does not complete the initial streaming-list bookmark on this base.
# Ordinary LIST followed by WATCH retains the resource-version boundary.
service = '''      - name: griot
        after: apiserver
        env: [KUBE_FEATURE_WatchListClient=false]
        args:
        - /usr/bin/griot
        - --kubeconfig={{kube "admin.kubeconfig"}}
        - --db=/var/lib/griot/memory.db
        - --listen={{.Node.IP}}:8443
        - --register={{.Node.IP}}
'''
sys.stdout.write(text.replace(anchor, service + anchor, 1))
