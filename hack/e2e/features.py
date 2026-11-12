#!/usr/bin/env python3
"""Live tests against the isolated Sankofa distribution, never the workshop API."""
import json
import os
import pathlib
import subprocess
import time
import uuid

CONFIG = os.environ['SANKOFA_KUBECONFIG']
CONTEXT = os.environ['SANKOFA_CONTEXT']
KUBECTL = os.environ.get('KUBECTL', 'kubectl')
CLI = os.environ.get('SANKOFA_CLI', 'sankofa')
PREFIX = 'sankofa-e2e-' + uuid.uuid4().hex[:8]
NS, PRIVATE = PREFIX, PREFIX + '-private'
created = []


def command(binary, args, data=None, check=True):
    env = dict(os.environ, SANKOFA_CONTENT='')
    p = subprocess.run([binary, '--kubeconfig', CONFIG, '--context', CONTEXT, *args],
                       input=data, text=True, capture_output=True, timeout=90, env=env)
    if check and p.returncode:
        raise RuntimeError(f'{binary} {args}: {p.stdout}\n{p.stderr}')
    return p


def k(*args, **kwargs):
    return command(KUBECTL, list(args), **kwargs)


def cli(*args):
    return command(CLI, list(args)).stdout


def get(resource, name=None, namespace=None, user=None):
    args = ['get', resource]
    if name:
        args += [name]
    if namespace:
        args += ['-n', namespace]
    if user:
        args += ['--as', user]
    return json.loads(k(*args, '-o', 'json').stdout)


def create(kind, name, spec=None, namespace=None, api='v1', **fields):
    obj = dict(apiVersion=api, kind=kind, metadata=dict(name=name), **fields)
    if namespace:
        obj['metadata']['namespace'] = namespace
    if spec is not None:
        obj['spec'] = spec
    k('create', '-f', '-', data=json.dumps(obj))
    if not namespace:
        created.append((kind, name))
    return obj


def eventually(fn, seconds=180):
    end = time.monotonic() + seconds
    last = None
    while time.monotonic() < end:
        try:
            value = fn()
            if value:
                return value
        except (RuntimeError, KeyError) as e:
            last = e
        time.sleep(2)
    raise AssertionError(f'condition did not become true: {last}')


def denied(args, fragment):
    p = k(*args, check=False)
    assert p.returncode != 0, f'unexpected success: {args}'
    assert fragment in p.stderr, f'wrong failure: {p.stderr}'


def deployment(ns):
    return create('Deployment', 'remember', dict(replicas=0,
        selector={'matchLabels': {'app': 'remember'}},
        template={'metadata': {'labels': {'app': 'remember'}},
                  'spec': {'containers': [{'name': 'pause', 'image': 'registry.k8s.io/pause:3.10'}]}}),
        namespace=ns, api='apps/v1')


def dead(ns):
    return any(x['target']['name'] == 'remember' for x in get('timelines', namespace=ns)['items'])


def cards():
    items = eventually(lambda: get('cards')['items'])
    assert len(items) >= 10, 'embedded collection did not sync'
    # A unique server-only card proves the CLI did not use embedded/local content.
    spec = dict(items[0]['spec'], title=PREFIX, body='Server-only dictionary proof ' + PREFIX,
                edition='both')
    spec.pop('pair', None)
    create('Card', PREFIX, spec, api='sankofa.kuberoot.dev/v1alpha1')
    assert 'Server-only dictionary proof ' + PREFIX in cli('dict', PREFIX, '--plain')


def memory():
    deployment(NS)
    old = get('deployment', 'remember', NS)
    eventually(lambda: get('timelines', 'deployments.apps:remember', NS)['object']['metadata']['uid'] == old['metadata']['uid'])
    k('delete', 'deployment', 'remember', '-n', NS, '--wait=true')
    denied(['get', 'deployment', 'remember', '-n', NS], 'NotFound')
    eventually(lambda: dead(NS))
    cli('fetch', 'deployment/remember', '-n', NS)
    new = get('deployment', 'remember', NS)
    assert new['metadata']['uid'] != old['metadata']['uid']
    assert new['spec'] == old['spec'], 'fetch changed deployment spec'
    assert 'sankofa.kuberoot.dev/fetched-at' in new['metadata']['annotations']


def rbac():
    user = PREFIX + '-reader'
    # Deliberately grant the history API globally; only the inner SAR can hide memory.
    create('ClusterRoleBinding', PREFIX + '-memory', api='rbac.authorization.k8s.io/v1',
           roleRef=dict(apiGroup='rbac.authorization.k8s.io', kind='ClusterRole', name='sankofa:memory-reader'),
           subjects=[dict(kind='User', name=user)])
    create('RoleBinding', 'read', namespace=NS, api='rbac.authorization.k8s.io/v1',
           roleRef=dict(apiGroup='rbac.authorization.k8s.io', kind='ClusterRole', name='view'),
           subjects=[dict(kind='User', name=user)])
    deployment(PRIVATE)
    eventually(lambda: get('timelines', 'deployments.apps:remember', PRIVATE))
    for ns in (NS, PRIVATE):
        k('delete', 'deployment', 'remember', '-n', ns, '--wait=true')
        eventually(lambda: dead(ns))
    assert get('timelines', 'deployments.apps:remember', NS, user)['target']['name'] == 'remember'
    denied(['get', 'timelines', 'deployments.apps:remember', '-n', PRIVATE, '--as', user], 'memory follows your RBAC')
    assert get('timelines', namespace=PRIVATE, user=user)['items'] == []
    visible = json.loads(k('get', 'timelines', '-A', '--as', user, '-o', 'json').stdout)['items']
    assert any(x['metadata']['namespace'] == NS for x in visible)
    assert all(x['metadata']['namespace'] != PRIVATE for x in visible)


def kgotla():
    protected = PREFIX + '-protected'
    create('Namespace', protected)
    k('label', 'namespace', protected, 'sankofa.kuberoot.dev/kgotla=protected')
    args = ['delete', 'namespace', protected, '--wait=false']
    denied(args, 'call a council first')
    users = [PREFIX + '-alice', PREFIX + '-bob', PREFIX + '-chief']
    for user in users:
        create('ClusterRoleBinding', user, api='rbac.authorization.k8s.io/v1',
               roleRef=dict(apiGroup='rbac.authorization.k8s.io', kind='ClusterRole', name='sankofa:kgotla'),
               subjects=[dict(kind='User', name=user)])
    create('Kgotla', PREFIX, dict(target=dict(group='', resource='namespaces', name=protected),
           voices=users[:2], chief=users[2], reason='Distribution end-to-end proof'), api='sankofa.kuberoot.dev/v1alpha1')
    denied(args, 'has not decided yet')
    for user in [users[2], users[0], users[1]]:
        cli('kgotla', 'speak', PREFIX, '--as', user)
        assert get('kgotla', PREFIX)['spec']['spoken'][-1]['user'] == user
        denied(args, 'has not decided yet')
    cli('kgotla', 'speak', PREFIX, '--as', users[2])
    k(*args)
    eventually(lambda: k('get', 'namespace', protected, check=False).returncode != 0)


def polyrhythm():
    minutes = set()
    # Sequential admission must reserve different beats, even for hash collisions.
    for i in range(12):
        create('CronJob', 'beat-' + str(i), dict(schedule='H 3 * * *', suspend=True,
            jobTemplate={'spec': {'template': {'spec': {'restartPolicy': 'Never',
                'containers': [{'name': 'pause', 'image': 'registry.k8s.io/pause:3.10'}]}}}}),
            namespace=NS, api='batch/v1')
        job = get('cronjob', 'beat-' + str(i), NS)
        minute, rest = job['spec']['schedule'].split(' ', 1)
        assert rest == '3 * * *' and 0 <= int(minute) <= 59
        assert minute not in minutes, 'CronJobs share a minute'
        minutes.add(minute)
        assert job['metadata']['annotations']['sankofa.kuberoot.dev/written-schedule'] == 'H 3 * * *'


def credits():
    pod = dict(apiVersion='v1', kind='Pod', metadata=dict(name='credits', namespace=NS),
        spec={'containers': [{'name': 'pause', 'image': 'registry.k8s.io/pause:3.10'}]})
    quiet = k('create', '--dry-run=server', '-f', '-', data=json.dumps(pod))
    assert 'does not declare its' not in quiet.stderr
    k('label', 'namespace', NS, 'sankofa.kuberoot.dev/credits=warn')
    warn = k('create', '--dry-run=server', '-f', '-', data=json.dumps(pod))
    assert 'does not declare its' in warn.stderr and 'Big Mama Thornton' in warn.stderr, warn.stderr


if __name__ == '__main__':
    assert CONTEXT != 'admin@workshop', 'refusing workshop context'
    assert get('namespace', 'sankofa-system')['metadata']['name'] == 'sankofa-system'
    results = []
    try:
        create('Namespace', NS)
        create('Namespace', PRIVATE)
        for test in (cards, memory, rbac, kgotla, polyrhythm, credits):
            start = time.monotonic()
            test()
            result = dict(test=test.__name__, status='passed', seconds=round(time.monotonic()-start, 2))
            results.append(result)
            print(json.dumps(result), flush=True)
    finally:
        pathlib.Path(os.environ.get('E2E_RESULTS', 'features-results.json')).write_text(json.dumps(results, indent=2)+'\n')
        for kind, name in reversed(created):
            # Remove our own protection only for failed-test cleanup.
            if kind == 'Namespace':
                k('label', kind, name, 'sankofa.kuberoot.dev/kgotla-', check=False)
            k('delete', kind, name, '--ignore-not-found', '--wait=false', check=False)
