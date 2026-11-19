"""Reproduce actual rendered-export previews, without fetching or applying anything."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import rendered_layout as r


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    out = ROOT / 'reports'
    template = load(ROOT / 'captures/pp428.json')
    fresh = []
    for name in ('pp428', 'pp633'):
        capture = load(ROOT / ('captures/' + name + '.json'))
        result = r.plan(capture, template)
        assert result['status'] == 'BLOCKED_COVERAGE_UNKNOWN', result.get('reason')
        assert 'proposed_content' not in result
        assert result.get('quarantined_visible_content_preview'), result.get('reason')
        fresh.append({'input': 'captures/' + name + '.json', **result})
    assert fresh[0]['before_body_sha256'] == fresh[0]['after_body_sha256']
    legacy = []
    for path in sorted((ROOT / 'fixtures/historical').glob('*.json')):
        result = r.preview_legacy(load(path), template)
        assert result.get('quarantined_visible_content_preview'), (path.name, result.get('reason'))
        legacy.append({'input': str(path.relative_to(ROOT)), **result})
    assert len(legacy) == 20
    write(out / 'fresh-two.json', fresh)
    write(out / 'historical-inputs.json', legacy)
    table = []
    for code, page_id in r.PAGES.items():
        current = [x for x in fresh if x['code'] == code]
        old = [x for x in legacy if x['code'] == code]
        table.append({'code': code, 'page_id': page_id, 'fresh_read_captures': len(current), 'historical_fixtures': len(old),
                      'visible_format_checks_passed': bool(current or old), 'full_page_coverage': 'UNKNOWN', 'apply_allowed': False,
                      'current_page_observed': bool(current),
                      'source_last_edited_at': current[0]['page_last_edited_at'] if current else None,
                      'captured_at_utc': current[0]['captured_at_utc'] if current else None})
    write(out / 'real-coverage-table.json', table)
    limitation = {'status': 'BLOCKED_EXTERNAL_COVERAGE_EVIDENCE', 'missing_fields': ['truncated', 'unknown_block_count', 'unknown_block_ids'],
                  'actual_fetch_schema_file': 'captures/fetch-tool-schema.txt',
                  'evidence': ['captures/pp428.json', 'captures/pp633.json', 'captures/notion-maintenance-coverage-confirmation.json'],
                  'smallest_missing_input': 'A trustworthy complete export of each target/template with explicit no-truncation and no-unknown/omitted-subtree evidence, or a documented connector capability that supplies it.',
                  'not_a_fix': 'Adding false/zero coverage fields, inventing block UUIDs/children, or assuming missing metadata means complete.',
                  'other_nine_not_refetched': 'The initial two-page completeness gate cannot pass; no further fresh reads were spent on the other nine.'}
    write(out / 'external-limit.json', limitation)
    lines = ['# Rendered-export adapter v2', '', '**NOT READY FOR APPLICATION. Independent review pending.**', '',
             'The adapter works with the actual MCP Markdown representation. Fresh PP428 is byte-identical; fresh PP633 formats with exact visible mappings, review callout, stable media and source/history preserved. All twenty historical before/after exports also parse, format and pass visible-preservation/idempotence checks.', '',
             'The fetch schema tells callers to check truncation and unknown-block metadata. Both full received responses omit all three fields. Notion Maintenance independently confirmed it has no extra complete-export evidence or documented option for them. Every real preview remains quarantined and fails application preconditions.', '',
             '| PP | Fresh captures | Historical fixtures | Current content observed | Full-page coverage |',
             '| --- | ---: | ---: | --- | --- |']
    lines += ['| ' + row['code'] + ' | ' + str(row['fresh_read_captures']) + ' | ' + str(row['historical_fixtures']) + ' | ' + ('Yes' if row['current_page_observed'] else 'No') + ' | UNKNOWN |' for row in table]
    lines += ['', 'No full native block tree or IDs were fabricated. Source spans in note associations are local character offsets, not Notion IDs. No properties, cover, icon, approval status, page or schema writes were proposed/executed.', '',
              'Signed HTTPS query credentials were removed from saved tool captures; raw-response hashes and original structure are retained. Stable body media references and body content were not redacted. Historical input bodies remain identical to the original files. Captures are read-only evidence, not an operational import plan.']
    (out / 'SUMMARY.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    previews = out / 'quarantined'; previews.mkdir(exist_ok=True)
    for result in fresh:
        code = result['code']
        content = '# QUARANTINED visible-content preview: PP' + code + '\n\nFull-page coverage UNKNOWN. This file is not an application payload.\n\n' + result['quarantined_visible_content_preview']
        (previews / ('PP' + code + '.md')).write_text(content + '\n', encoding='utf-8')
    hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
              for directory in ('captures', 'fixtures/historical') for path in sorted((ROOT / directory).rglob('*')) if path.is_file()}
    write(out / 'input-file-hashes.json', hashes)
    print('2 fresh and 20 historical real exports passed visible-format checks; all 22 remain quarantined for unknown completeness.')


if __name__ == '__main__':
    main()
