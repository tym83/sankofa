#!/usr/bin/env python3
"""Require a complete upstream run; never turn missing results into success."""
import json
import pathlib
import sys
import xml.etree.ElementTree as ET

root = pathlib.Path(sys.argv[1])
reports = sorted(root.rglob('junit*.xml'))
assert reports, 'no upstream JUnit report'
cases = [c for p in reports for c in ET.parse(p).getroot().iter('testcase')]
selected = [c for c in cases if '[Conformance]' in c.get('name', '')]
executed = [c for c in selected if c.find('skipped') is None]
failures = [c.get('name') for c in executed if c.find('failure') is not None or c.find('error') is not None]
summary = dict(passed=len(executed)-len(failures), failed=len(failures),
               executed=len(executed), selected_skipped=len(selected)-len(executed),
               failures=failures, reports=[str(p.relative_to(root)) for p in reports])
(root/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
print(json.dumps(summary, indent=2))
assert summary['passed'] == 462 and not failures and not summary['selected_skipped'], 'expected 462/462 with no skipped conformance tests'
