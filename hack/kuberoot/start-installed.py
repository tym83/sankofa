#!/usr/bin/env python3
"""Finish the Halted -> installed-disk boot transition on the three owned VMs.

The VMInstance Helm controller can wait for readiness while a VM is Halted.
After installation and VMI deletion, first set each VMInstance's desired
spec to Always with only its system disk. This helper mirrors that exact
state to the owned underlying VirtualMachines to unblock reconciliation.
"""
import json
import os
import pathlib
import subprocess

base = ['kubectl', '--kubeconfig', os.environ.get('KUBECONFIG_WORKSHOP', str(pathlib.Path.home()/'workshop.txt')),
        '--context', os.environ.get('KUBE_CONTEXT', 'admin@workshop'), '-n', 'tenant-sankofa', '--request-timeout=20s']


def read(kind, name):
    return json.loads(subprocess.check_output(base+['get', kind, name, '-o', 'json']))


for i in (1, 2, 3):
    short = f'sankofa-{i}'
    name = 'vm-instance-' + short
    desired = read('vminstance', short)['spec']
    assert desired['runStrategy'] == 'Always'
    assert desired['disks'] == [{'name': short+'-system'}]
    vm = read('virtualmachine', name)
    spec = vm['spec']['template']['spec']
    disk = 'disk-'+short+'-system'
    volumes = [v for v in spec['volumes'] if v['name'] == disk]
    disks = [dict(d, bootOrder=1) for d in spec['domain']['devices']['disks'] if d['name'] == disk]
    assert len(volumes) == len(disks) == 1
    if vm['spec']['runStrategy'] == 'Always' and spec['volumes'] == volumes and spec['domain']['devices']['disks'] == disks:
        print(name+': already configured for its installed disk')
        continue
    assert vm['spec']['runStrategy'] == 'Halted', 'halt the owned VM before changing its boot disk'
    p = subprocess.run(base+['get', 'vmi', name, '--ignore-not-found', '-o', 'name'], capture_output=True, text=True, check=True)
    assert not p.stdout.strip(), 'wait for the halted VMI to disappear'
    patch = {'spec': {'runStrategy': 'Always', 'template': {'spec': {
        'volumes': volumes, 'domain': {'devices': {'disks': disks}}}}}}
    subprocess.run(base+['patch', 'virtualmachine', name, '--type', 'merge', '-p', json.dumps(patch)], check=True)
