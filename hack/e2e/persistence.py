#!/usr/bin/env python3
"""Prove deleted-object memory survives a real installed control-plane reboot.

Requires SANKOFA_NODE_IP and SANKOFA_NODE_KUBECONFIG in addition to the
feature suite's environment. Run before conformance, when no tests are active.
"""
import datetime
import json
import os
import pathlib
import subprocess
import time

import features as f

IP = os.environ['SANKOFA_NODE_IP']
TRUST = os.environ['SANKOFA_NODE_KUBECONFIG']


def nk(*args):
    p = subprocess.run([f.KUBECTL, '--kubeconfig', TRUST, '--context', 'kuberoot',
        '--server', f'https://{IP}:50000', '--request-timeout=10s', *args],
        capture_output=True, text=True, timeout=20)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return json.loads(p.stdout)


def osconfig():
    return nk('get', 'osconfigs', '-o', 'json')['items'][0]


assert f.CONTEXT != 'admin@workshop'
f.create('Namespace', f.NS)
try:
    f.deployment(f.NS)
    uid = f.get('deployment', 'remember', f.NS)['metadata']['uid']
    f.eventually(lambda: f.get('timelines', 'deployments.apps:remember', f.NS)['object']['metadata']['uid'] == uid)
    f.k('delete', 'deployment', 'remember', '-n', f.NS, '--wait=true')
    f.eventually(lambda: f.dead(f.NS))
    before = osconfig()
    slots = nk('get', 'bootentries', '-o', 'json')['items']
    assert any(s['status'].get('booted') and s['status'].get('state') == 'Good' for s in slots)
    requested = datetime.datetime.now(datetime.timezone.utc)
    stamp = requested.isoformat().replace('+00:00', 'Z')
    nk('patch', 'osconfig', before['metadata']['name'], '--type', 'merge', '-p',
       json.dumps({'spec': {'rebootRequestedAt': stamp}}), '-o', 'json')
    # Uptime rounding can move the reported boot time by a second. Require
    # a boot near the reboot request, not merely a different string.
    f.eventually(lambda: datetime.datetime.fromisoformat(osconfig()['status']['bootTime'].replace('Z', '+00:00'))
                 >= requested - datetime.timedelta(seconds=2), 300)
    tl = f.eventually(lambda: f.get('timelines', 'deployments.apps:remember', f.NS), 300)
    assert any(m['uid'] == uid and m['verb'] == 'died' for m in tl['moments'])
    f.cli('fetch', 'deployment/remember', '-n', f.NS)
    assert f.get('deployment', 'remember', f.NS)['metadata']['uid'] != uid
    result = dict(test='installed-node-memory', status='passed', oldBootTime=before['status']['bootTime'],
                  newBootTime=osconfig()['status']['bootTime'])
    pathlib.Path(os.environ.get('PERSISTENCE_RESULTS', '/work/results/persistence.json')).write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result), flush=True)
finally:
    f.k('delete', 'namespace', f.NS, '--wait=false', '--ignore-not-found', check=False)
