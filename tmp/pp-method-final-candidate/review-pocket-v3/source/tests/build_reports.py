"""Build offline evidence; synthetic proposals never stand in for real pages."""
import copy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_layout import ROOT, f, fixture


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    output = ROOT / 'reports'
    template_dir = ROOT.parent / 'pp-apron-layout-template-input'
    template_errors, templates = [], []
    for path in sorted(template_dir.rglob('*.json')) if template_dir.exists() else []:
        try:
            value = json.loads(path.read_text(encoding='utf-8-sig'))
            f.template_shape(value)
            templates.append((path, value))
        except (ValueError, TypeError, KeyError) as error:
            template_errors.append({'input': str(path), 'reason': str(error)})
    unique = {f.digest(value): (path, value) for path, value in templates}
    template = next(iter(unique.values()))[1] if len(unique) == 1 else None
    dependency = {'status': 'AVAILABLE' if template is not None else 'BLOCKED',
                  'expected_code': '428', 'expected_page_id': f.PAGES['428'],
                  'directory': str(template_dir), 'rejected_inputs': template_errors,
                  'reason': None if template is not None else ('Conflicting complete templates' if len(unique) > 1 else 'Complete approved native PP428 template is absent or unsupported')}
    reports, input_hashes = [], {}
    for path in sorted((ROOT.parent / 'notion-apron-layout-20261117').glob('*-PP*.json')):
        data = json.loads(path.read_text(encoding='utf-8-sig'))
        input_hashes[str(path)] = f.hashlib.sha256(path.read_bytes()).hexdigest()
        report = {'input': str(path), **f.plan(data, template)}
        report['missing_native_fields'] = [name for name in ('coverage', 'blocks') if name not in data]
        report['template_dependency'] = dependency['status']
        reports.append(report)
    if template is not None:
        reports.append({'input': 'complete PP428 template snapshot', **f.plan(template, template)})
    write(output / 'real-input-reports.json', reports)
    write(output / 'template-dependency.json', dependency)
    summary = []
    for code, page_id in f.PAGES.items():
        matching = [r for r in reports if r.get('code') == code]
        summary.append({'code': code, 'expected_page_id': page_id, 'verified_inputs': len(matching),
                        'status': 'MISSING_INPUT' if not matching else ('BLOCKED' if any(r['status'] == 'BLOCKED' for r in matching) else 'PROPOSED_LOCAL_ONLY'),
                        'reasons': sorted({r.get('reason', 'Local proposal only') for r in matching}) if matching else ['No complete PP428 snapshot available'],
                        'apply_allowed': False})
    write(output / 'per-code-summary.json', summary)
    write(output / 'input-file-hashes.json', input_hashes)
    synthetic_template = fixture('428', template=True, reviewed=True)
    write(output / 'synthetic/template-PP428.json', synthetic_template)
    for code, options in [('429', {}), ('633', {'reviewed': True}), ('662', {'box': True, 'grouped': True}), ('661', {'image': False})]:
        source = fixture(code, **options)
        proposal = f.plan(source, synthetic_template)
        assert proposal['status'] == 'PROPOSED_LOCAL_ONLY', proposal.get('reason')
        second = copy.deepcopy(source)
        second['blocks'] = proposal['proposed_body']
        assert f.plan(second, synthetic_template)['proposed_body'] == proposal['proposed_body']
        write(output / ('synthetic/source-PP' + code + '.json'), source)
        write(output / ('synthetic/proposal-PP' + code + '.json'), proposal)
    lines = ['# Local layout evidence', '', 'Synthetic examples are test data, not proposals for actual Notion pages.', '',
             '| Code | Verified real inputs | Result |', '| --- | ---: | --- |']
    lines += ['| ' + r['code'] + ' | ' + str(r['verified_inputs']) + ' | ' + r['status'] + ' |' for r in summary]
    lines += ['', 'The legacy before/after JSON files contain rendered text, no expanded native block tree and no complete child-coverage declaration. Their UUID/code pairs are verified from actual properties and page URLs. A file name is never identity evidence.', '',
              'Template dependency: ' + dependency['status'] + '. ' + (dependency['reason'] or 'One complete approved native PP428 template verified.')]
    (output / 'SUMMARY.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('Real inputs: ' + str(len(reports)) + '; blocked: ' + str(sum(r['status'] == 'BLOCKED' for r in reports)) + '; template: ' + dependency['status'])


if __name__ == '__main__':
    main()
