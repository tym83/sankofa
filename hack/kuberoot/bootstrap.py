#!/usr/bin/env python3
"""Install or join three owned nodes from inside sankofa-builder.

Usage: bootstrap.py install|join IP1 IP2 IP3
After install, detach each VM's media disk and restart that VM before join.
Credentials stay in /work/kube and are never written into the source tree.
"""
import ipaddress
import json
import os
import pathlib
import subprocess
import sys
import time

MODE, *IPS = sys.argv[1:]
assert MODE in ('install', 'join') and len(IPS) == 3
for ip in IPS:
    ipaddress.ip_address(ip)
K = os.environ.get('KUBECTL', '/work/bin/kubectl')
TRUST = '/work/trust/admin.kubeconfig'


def nk(ip, *args, data=None):
    p = subprocess.run([K, '--kubeconfig', TRUST, '--context', 'kuberoot',
        '--server', f'https://{ip}:50000', '--request-timeout=20s', *args],
        input=data, text=True, capture_output=True, timeout=30)
    if p.returncode:
        # Never echo membership or kubeconfig payloads.
        raise RuntimeError(f'node {ip}: {p.stderr}')
    return p.stdout


def read(ip, resource, name=None):
    return json.loads(nk(ip, 'get', resource, *([name] if name else []), '-o', 'json'))


def wait(fn, timeout=900):
    until = time.monotonic()+timeout
    last = None
    while time.monotonic() < until:
        try:
            value = fn()
            if value:
                return value
        except (RuntimeError, KeyError) as e:
            last = e
        time.sleep(5)
    raise RuntimeError(f'timed out: {last}')


def create(ip, kind, name, spec):
    return nk(ip, 'create', '-f', '-', data=json.dumps(dict(
        apiVersion='node.kuberoot.dev/v1alpha1', kind=kind,
        metadata={'name': name}, spec=spec)))


def installed(ip):
    phase = read(ip, 'installation', 'sankofa-install')['status']['phase']
    if phase == 'Failed':
        raise AssertionError(f'installation failed on {ip}')
    return phase == 'Completed'


for ip in IPS:
    config = wait(lambda: read(ip, 'osconfigs')['items'][0])
    assert config['status']['distro'] == 'kuberoot', f'{ip} is not a kuberoot node'
    assert any(s['metadata']['name'] == 'griot' for s in read(ip, 'nodeservices')['items']), f'{ip} lacks the Sankofa node service'

if MODE == 'install':
    for ip in IPS:
        disks = read(ip, 'disks')['items']
        target = [d for d in disks if d['metadata']['name'] == 'vdb']
        assert len(target) == 1 and not target[0].get('status', {}).get('role'), 'vdb must be the empty system disk'
        create(ip, 'Installation', 'sankofa-install', {'disk': 'vdb', 'reboot': False})
        wait(lambda: installed(ip))
        print(f'{ip}: installed; detach media and restart the owned VM', flush=True)
else:
    for ip in IPS:
        wait(lambda: any(x['status'].get('booted') and x['status'].get('state') == 'Good'
                        for x in read(ip, 'bootentries')['items']))
    for i, ip in enumerate(IPS[1:], 2):
        name = read(ip, 'osconfigs')['items'][0]['status']['hostname']
        create(IPS[0], 'JoinTicket', 'sankofa-worker-'+str(i), {'nodeName': name, 'role': 'Worker'})
        membership = wait(lambda: read(IPS[0], 'jointicket', 'sankofa-worker-'+str(i))['status'].get('membership'))
        nk(ip, 'apply', '-f', '-', data=membership)
        print(f'{ip}: worker membership applied', flush=True)
    path = pathlib.Path('/work/kube/sankofa.conf')
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(nk(IPS[0], 'get', 'kubeconfig', 'admin', '-o', 'jsonpath={.kubeconfig}'))
    print('Cluster credentials: /work/kube/sankofa.conf', flush=True)
