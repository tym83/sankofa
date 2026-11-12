#!/usr/bin/env python3
"""Apply a signed bundle to installed nodes, one at a time, from the builder.

Usage: upgrade.py VERSION BUNDLE_URL SHA256 NODE_IP [NODE_IP ...]
The signature beside BUNDLE_URL must match the release key baked into the nodes.
"""
import ipaddress
import json
import os
import re
import subprocess
import sys
import time
import uuid

VERSION, URL, SHA, *IPS = sys.argv[1:]
assert IPS and re.fullmatch(r'[0-9a-f]{64}', SHA)
for ip in IPS:
    ipaddress.ip_address(ip)
K = os.environ.get('KUBECTL', '/work/bin/kubectl')
TRUST = os.environ.get('SANKOFA_NODE_KUBECONFIG', '/work/trust/admin.kubeconfig')


def call(ip, *args, data=None):
    p = subprocess.run([K, '--kubeconfig', TRUST, '--context', 'kuberoot',
        '--server', f'https://{ip}:50000', '--request-timeout=10s', *args],
        input=data, text=True, capture_output=True, timeout=20)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return json.loads(p.stdout)


def good(ip):
    entries = call(ip, 'get', 'bootentries', '-o', 'json')['items']
    return any(x['status'].get('booted') and x['status'].get('state') == 'Good'
               and x['status'].get('release') == VERSION for x in entries)


for ip in IPS:
    if good(ip):
        print(f'{ip}: already booted {VERSION}, Good', flush=True)
        continue
    name = 'sankofa-upgrade-'+uuid.uuid4().hex[:8]
    call(ip, 'create', '-f', '-', '-o', 'json', data=json.dumps({
        'apiVersion': 'node.kuberoot.dev/v1alpha1', 'kind': 'Upgrade',
        'metadata': {'name': name}, 'spec': {'url': URL, 'sha256': SHA, 'reboot': True}}))
    until = time.monotonic()+900
    last = ''
    while time.monotonic() < until:
        try:
            if good(ip):
                print(f'{ip}: booted {VERSION}, Good', flush=True)
                break
            status = call(ip, 'get', 'upgrade', name, '-o', 'json')['status']
            if status.get('phase') == 'Failed':
                raise AssertionError(status.get('message'))
            phase = status.get('phase', '')
            if phase != last:
                print(f'{ip}: {phase}', flush=True)
                last = phase
        except RuntimeError:
            pass  # The node API disappears during the reboot.
        time.sleep(5)
    else:
        raise AssertionError(f'{ip}: did not boot {VERSION} in a Good slot')
