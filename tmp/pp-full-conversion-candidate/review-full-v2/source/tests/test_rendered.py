import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import rendered_layout as r


def read(name):
    return json.loads((ROOT / 'captures' / name).read_text(encoding='utf-8'))


def sync(capture):
    capture['response']['content'][0]['text'] = json.dumps(capture['response']['structuredContent'], ensure_ascii=False)
    return capture


def synthetic_complete(capture):
    """Branch-test fixture only. Never saved or used as actual export evidence."""
    capture = copy.deepcopy(capture)
    capture['capture']['synthetic'] = True
    capture['response']['structuredContent'].update(truncated=False, unknown_block_count=0, unknown_block_ids=[])
    return sync(capture)


class RenderedTests(unittest.TestCase):
    def setUp(self):
        self.template = read('pp428.json')
        self.target = read('pp633.json')
    def test_actual_pp428_is_byte_identical_and_keeps_human_no_and_reason(self):
        body = r.decode_capture(self.template)['body']
        after, proof = r.format_markdown(body, '428', body)
        self.assertEqual(after, body)
        self.assertTrue(proof['review']['no']); self.assertFalse(proof['review']['yes'])
        self.assertIn('Falta transfer 1 C 126cm', after)
        self.assertEqual(r.format_markdown(after, '428', body)[0], after)
        self.assertTrue(any(n.kind == 'toggle' for n in r.descend(r.parse(body)) if n.title.startswith('Registo da revisão')))
    def test_actual_pp633_visible_content_preservation_and_no_template_reason_copy(self):
        original = copy.deepcopy(self.target)
        result = r.plan(self.target, self.template)
        self.assertEqual(result['status'], 'BLOCKED_COVERAGE_UNKNOWN')
        self.assertNotIn('proposed_content', result)
        after = result['quarantined_visible_content_preview']
        before = r.decode_capture(self.target)['body']
        self.assertFalse(r.ledger(r.parse(before)) - r.ledger(r.parse(after)))
        self.assertFalse(result['preservation']['review']['yes']); self.assertFalse(result['preservation']['review']['no'])
        self.assertNotIn('Falta transfer 1 C 126cm', after)
        self.assertEqual(self.target, original)
        self.assertEqual(len(result['preservation']['moved_notes']), 3)
        self.assertIn('Peito<br />Bolso', result['preservation']['exact_new_old_mappings']['Old'][0][1][0])
    def test_all_twenty_real_legacy_fixtures_supported_but_never_claimed_current(self):
        paths = sorted((ROOT / 'fixtures/historical').glob('*.json'))
        self.assertEqual(len(paths), 20)
        for path in paths:
            with self.subTest(input=path.name):
                source = json.loads(path.read_text(encoding='utf-8'))
                before = copy.deepcopy(source)
                result = r.preview_legacy(source, self.template)
                self.assertEqual(result['status'], 'BLOCKED_HISTORICAL_COVERAGE_UNKNOWN')
                self.assertIn('quarantined_visible_content_preview', result, result.get('reason'))
                self.assertFalse(result['apply_allowed'])
                self.assertEqual(result['source_freshness'], 'historical_fixture_not_refetched')
                self.assertEqual(source, before)
    def test_pp662_box_and_grouped_rows_keep_own_exact_mappings(self):
        source = json.loads((ROOT / 'fixtures/historical/after-PP662.json').read_text(encoding='utf-8'))
        result = r.preview_legacy(source, self.template)
        mapping = result['preservation']['exact_new_old_mappings']
        self.assertIn('Caixa', str(mapping['New']))
        self.assertEqual(len(mapping['Old'][0]), 2, 'one grouped original row stays grouped')
        self.assertIn('Por confirmar', str(mapping['New']))
    def test_pp661_missing_image_never_copies_template_image(self):
        source = json.loads((ROOT / 'fixtures/historical/after-PP661.json').read_text(encoding='utf-8'))
        result = r.preview_legacy(source, self.template)
        self.assertFalse(any(n.kind == 'image' for n in r.descend(r.parse(result['quarantined_visible_content_preview']))))
    def test_pipe_escape_backslashes_and_xml_roundtrip(self):
        self.assertEqual(r.pipe_cells(r'| A | B \| C |'), ['A', r'B \| C'])
        self.assertEqual(r.pipe_cells(r'| A \\| B |'), [r'A \\', 'B'])
        source = '| Face / local | Opções propostas | Nota |\n| --- | --- | --- |\n| Face 1<br />Face 2 | A \\| B | exact note |'
        node = r.parse(source)[0]
        converted = r.xml_table(node)
        self.assertEqual(r.parse(converted)[0].rows, [row[:2] for row in node.rows])
        styled = '<table header-row="true"><tr><td color="red">Face / local</td><td>Opções propostas</td></tr><tr><td>A</td><td>B</td></tr></table>'
        self.assertEqual(r.xml_table(r.parse(styled)[0]), styled)
    def test_truncation_unknown_blocks_and_nested_negative_evidence_refused(self):
        for field, value in [('truncated', True), ('unknown_block_count', 1), ('unknown_block_ids', ['omitted'])]:
            bad = synthetic_complete(self.target); bad['response']['structuredContent'][field] = value; sync(bad)
            result = r.plan(bad, self.template)
            self.assertEqual(result['status'], 'BLOCKED'); self.assertNotIn('quarantined_visible_content_preview', result)
        bad = synthetic_complete(self.target); bad['response']['structuredContent']['metadata']['truncated'] = True; sync(bad)
        self.assertEqual(r.plan(bad, self.template)['status'], 'BLOCKED')
    def test_absent_coverage_stays_unknown_and_cannot_pass_precondition(self):
        result = r.plan(self.target, self.template)
        self.assertEqual(result['source_coverage']['missing_fields'], ['truncated', 'unknown_block_count', 'unknown_block_ids'])
        self.assertFalse(r.verify_precondition(result, self.target))
        self.assertFalse(any(k in self.target['response']['structuredContent'] for k in result['source_coverage']['missing_fields']))
    def test_each_present_negative_is_refused_even_when_other_fields_are_missing(self):
        for field,value in [('truncated',True),('unknown_block_count',1),('unknown_block_ids',['omitted'])]:
            for placement in ('top','metadata','response-meta'):
                bad=copy.deepcopy(self.target)
                for name in ('truncated','unknown_block_count','unknown_block_ids'):bad['response']['structuredContent'].pop(name,None)
                if placement=='top':bad['response']['structuredContent'][field]=value
                elif placement=='metadata':bad['response']['structuredContent'].setdefault('metadata',{})[field]=value
                else:bad['response']['_meta']={field:value}
                sync(bad)
                with self.subTest(field=field,placement=placement),self.assertRaises(r.Refused):r.decode_capture(bad)
    def test_explicit_complete_branch_and_semantic_precondition_are_synthetic_only(self):
        target, template = synthetic_complete(self.target), synthetic_complete(self.template)
        result = r.plan(target, template)
        self.assertEqual(result['status'], 'LOCAL_PROPOSAL_PENDING_REVIEW')
        self.assertTrue(result['synthetic_capture']); self.assertFalse(result['apply_allowed'])
        self.assertTrue(r.verify_precondition(result, target))
        refreshed = copy.deepcopy(target); refreshed['capture']['received_at_utc'] = '2026-11-17T23:00:00Z'
        refreshed['response']['structuredContent']['cover']['file']['expiry_time'] = '2026-11-17T23:05:00Z'; sync(refreshed)
        self.assertTrue(r.verify_precondition(result, refreshed))
        refreshed['response']['structuredContent']['text'] = refreshed['response']['structuredContent']['text'].replace('DTF - Até A4', 'Human changed option'); sync(refreshed)
        self.assertFalse(r.verify_precondition(result, refreshed))
    def test_identity_wrong_page_request_code_and_missing_cover_icon_refused(self):
        for mode in ['id', 'request', 'code', 'cover', 'icon', 'timestamp', 'mixed-response', 'envelope']:
            bad = copy.deepcopy(self.target); value = bad['response']['structuredContent']
            if mode == 'id': value['id'] = r.PAGES['662']
            if mode == 'envelope': value['text'] = value['text'].replace('</content>', '</content></content>')
            if mode == 'request': bad['capture']['requested_id'] = r.PAGES['662']
            if mode == 'code': value['text'] = value['text'].replace('"Código PP":"633"', '"Código PP":"662"')
            if mode in ('cover', 'icon'): del value[mode]
            if mode == 'timestamp': bad['capture']['received_at_utc'] = '2026-11-17T12:00:00'
            if mode != 'mixed-response': sync(bad)
            else: bad['response']['content'][0]['text'] = '{}'
            self.assertEqual(r.plan(bad, self.template)['status'], 'BLOCKED', mode)
    def test_unclosed_unknown_hidden_and_unsupported_xml_content_refused(self):
        for source in ['<toggle>Title', '<unknown-block />', '<p onclick="x">text</p>', '<toggle>Title\n\n<!-- hidden -->\n</toggle>', '<table><tr><td>A</td><td>B</td></tr>lost text</table>', '| A | B |\n| --- | --- |\n| missing |', '<p><toggle>nested</toggle></p>']:
            with self.subTest(source=source), self.assertRaises(r.Refused):
                r.parse(source)
    def test_conflicting_yes_no_and_duplicate_current_review_refused(self):
        body = r.decode_capture(self.template)['body']
        conflicting = body.replace('- [ ] Sim,', '- [x] Sim,')
        with self.assertRaises(r.Refused): r.format_markdown(conflicting, '428', body)
        review = next(n.raw for n in r.parse(body) if r.review_state(n, '428') is not None)
        with self.assertRaises(r.Refused): r.format_markdown(review + '\n\n' + body, '428', body)


if __name__ == '__main__':
    unittest.main()
