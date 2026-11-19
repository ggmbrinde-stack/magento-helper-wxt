import copy
import importlib.util
import json
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch
import io

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('formatter', ROOT / 'format_layout.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)


def fixture(code='429', template=False, reviewed=False, image=True, grouped=False, box=False):
    counter = 0
    def b(kind, content='', children=None, **extra):
        nonlocal counter
        counter += 1
        payload = {'rich_text': f.rich(content), **extra}
        if children is not None:
            payload['children'] = children
        return f.node(code, 'fixture/' + str(counter), kind, payload)
    def table(side):
        locations = ['Peito', 'Bolso'] + (['Caixa'] if box else [])
        if grouped:
            locations = ['\n'.join(locations)]
        rows = [b('table_row', cells=[f.rich('Face / local'), f.rich('Opções ' + side), f.rich('Notas')])]
        for loc in locations:
            rows.append(b('table_row', cells=[f.rich(loc), f.rich(side + ': original DTF A4\nunknown option unchanged'), f.rich(loc + ': exact technical reason')]))
        return b('table', children=rows, table_width=3, has_column_header=True, has_row_header=False)
    new, old = table('New'), table('Old')
    desc = [b('heading_2', 'Descrição e notas do perfil'), b('paragraph', 'Original description / Ex: REF-' + code)]
    source = b('toggle', f.SOURCE, [b('paragraph', 'Full source cells, original notes and history ' + code)])
    review = b('callout', 'Revisão do PP ' + code, [
        b('to_do', 'Sim, aprovo a configuração New do PP ' + code + '.', checked=False),
        b('to_do', 'Não, são necessárias correções.', checked=reviewed),
        b('paragraph', 'Se não, porquê?'),
        b('paragraph', 'TEMPLATE REJECTION DO NOT COPY' if template else 'Human No: keep this exact reason ' + code)], icon={'type': 'emoji', 'emoji': '📝'})
    images = [b('image', type='file', file={'url': 'notion-file-block://stable-original-' + code}, caption=f.rich('Original caption'))] if image else []
    if template:
        for table in (new, old):
            table['table']['table_width'] = 2
            for row in f.children(table):
                row['table_row']['cells'] = row['table_row']['cells'][:2]
        cols = [b('column', children=[b('heading_2', side + title), table], width_ratio=0.5)
                for side, title, table in [('New', ' (proposta)', new), ('Old', ' (original)', old)]]
        blocks = [*images, *desc, review, b('column_list', children=cols), b('toggle', f.TECH, [b('paragraph', 'Template technical issue do not copy')]), source]
    else:
        blocks = [b('heading_2', 'Locais e personalização: nova configuração (proposta)'),
                  b('callout', 'Old proposal uncertainty: do not remove'), new,
                  b('toggle', 'Pendências técnicas', [b('paragraph', 'Exact existing location note: Bolso')]),
                  b('heading_2', 'Antes da alteração: tabela original integral'), old,
                  b('heading_2', 'Imagens'), *images, *desc, source]
        if reviewed:
            blocks.insert(0, review)
    return {'synthetic_fixture': True, 'code': code, 'page': {'id': f.PAGES[code], 'properties': {'Código PP': code, 'Estado': 'A rever', 'Human': 'No and original reason'}, 'cover': {'type': 'file', 'file': {'url': 'original-cover'}}, 'icon': None},
            'coverage': {'complete': True, 'properties_complete': True, 'truncated': False, 'has_more': False, 'omitted_children': [], 'unsupported_blocks': []},
            'blocks': blocks}


class Tests(unittest.TestCase):
    def setUp(self):
        self.template = fixture('428', template=True, reviewed=True)
    def propose(self, snapshot):
        result = f.plan(snapshot, self.template)
        self.assertEqual(result['status'], 'PROPOSED_LOCAL_ONLY', result.get('reason'))
        return result
    def test_ordinary_apron_preserves_every_original_atom_and_metadata(self):
        source = fixture(); before = copy.deepcopy(source)
        result = self.propose(source)
        self.assertEqual(source, before)
        self.assertFalse(f.atoms(source['blocks']) - f.atoms(result['proposed_body']))
        self.assertEqual(result['unchanged_page_metadata'], {k: source['page'][k] for k in ('properties', 'cover', 'icon')})
        cols = next(b for b in result['proposed_body'] if b['type'] == 'column_list')
        self.assertEqual([c['column']['width_ratio'] for c in f.children(cols)], [0.5, 0.5])
        self.assertEqual([f.label(f.children(c)[0]) for c in f.children(cols)], ['New (proposta)', 'Old (original)'])
        self.assertTrue(all(b['table']['table_width'] == 2 for b in f.walk([cols]) if b['type'] == 'table'))
        self.assertEqual(len(result['note_associations']), 4)
    def test_pp633_own_options_and_decision_preserved(self):
        source = fixture('633', reviewed=True)
        result = self.propose(source)
        self.assertTrue(result['review']['no']); self.assertFalse(result['review']['yes'])
        original = next(b for b in source['blocks'] if f.review_info(b, '633') is not None)
        after = next(b for b in result['proposed_body'] if f.review_info(b, '633') is not None)
        self.assertEqual(original, after)
        self.assertNotIn('TEMPLATE REJECTION', json.dumps(result))
    def test_pp662_box_mixed_and_grouped_rows_not_split_or_remapped(self):
        for grouped in [False, True]:
            source = fixture('662', box=True, grouped=grouped)
            result = self.propose(source)
            cols = next(b for b in result['proposed_body'] if b['type'] == 'column_list')
            tables_before = [b for b in source['blocks'] if b['type'] == 'table']
            tables_after = [b for b in f.walk([cols]) if b['type'] == 'table']
            self.assertEqual([[r['table_row']['cells'][:2] for r in f.children(t)] for t in tables_before],
                             [[r['table_row']['cells'] for r in f.children(t)] for t in tables_after])
    def test_pp661_missing_image_does_not_invent_media(self):
        result = self.propose(fixture('661', image=False))
        self.assertFalse(any(b['type'] == 'image' for b in f.walk(result['proposed_body'])))
    def test_template_rejection_and_choices_never_copied(self):
        result = self.propose(fixture())
        self.assertFalse(result['review']['yes']); self.assertFalse(result['review']['no'])
        self.assertNotIn('TEMPLATE REJECTION', json.dumps(result))
    def test_existing_yes_is_retained(self):
        source = fixture(reviewed=True)
        review = next(b for b in source['blocks'] if f.review_info(b, '429') is not None)
        choices = [b for b in f.children(review) if b['type'] == 'to_do']
        choices[0]['to_do']['checked'] = True; choices[1]['to_do']['checked'] = False
        result = self.propose(source)
        self.assertTrue(result['review']['yes']); self.assertFalse(result['review']['no'])
    def test_idempotence_and_deterministic_proposals(self):
        source = fixture('633', reviewed=True)
        first = self.propose(source)
        self.assertEqual(first, self.propose(source))
        rerun = copy.deepcopy(source); rerun['blocks'] = first['proposed_body']
        second = self.propose(rerun)
        self.assertEqual(first['proposed_body'], second['proposed_body'])
        self.assertEqual(first['after_body_sha256'], second['after_body_sha256'])
    def test_changed_source_precondition_catches_human_reason_or_property_edits(self):
        source = fixture(reviewed=True); result = self.propose(source)
        self.assertTrue(f.verify_precondition(result, source))
        wrong_plan = copy.deepcopy(result); wrong_plan['page_id'] = f.PAGES['633']
        self.assertFalse(f.verify_precondition(wrong_plan, source))
        for edit in ['property', 'body']:
            changed = copy.deepcopy(source)
            if edit == 'property': changed['page']['properties']['Human'] = 'Changed human reason'
            else: changed['blocks'][0]['callout']['rich_text'] = f.rich('Changed human reason')
            self.assertFalse(f.verify_precondition(result, changed))
    def test_scope_identity_and_wrong_template_refused(self):
        for mode in ['wrong-id', 'wrong-code', 'out-of-scope', 'conflicting-url', 'title']:
            source = fixture()
            if mode == 'wrong-id': source['page']['id'] = f.PAGES['633']
            if mode == 'wrong-code': source['code'] = '633'
            if mode == 'title': source['page']['title'] = '633 - wrong title'
            if mode == 'out-of-scope': source['page']['properties']['Código PP'] = '827'
            if mode == 'conflicting-url': source['page']['url'] = 'https://app.notion.com/p/' + f.PAGES['633']
            self.assertEqual(f.plan(source, self.template)['status'], 'BLOCKED')
        self.assertEqual(f.plan(fixture(), fixture('633', template=True))['status'], 'BLOCKED')
    def test_missing_template_and_rendered_only_exports_blocked(self):
        self.assertEqual(f.plan(fixture(), None)['status'], 'BLOCKED')
        source = fixture(); del source['blocks']; source['content'] = '<content>Looks complete</content>'
        self.assertEqual(f.plan(source, self.template)['status'], 'BLOCKED')
    def test_incomplete_truncated_unsupported_or_omitted_children_refused(self):
        for mode in ['coverage', 'truncated', 'pagination', 'child-omitted', 'child-unproved', 'unsupported', 'duplicate-id', 'archived', 'mixed-rendered']:
            source = fixture()
            if mode == 'coverage': del source['coverage']
            if mode == 'truncated': source['coverage']['truncated'] = True
            if mode == 'pagination': source['coverage']['has_more'] = True
            if mode == 'child-omitted': del source['blocks'][2]['table']['children']
            if mode == 'child-unproved': del source['blocks'][2]['children_complete']
            if mode == 'unsupported': source['blocks'][0]['type'] = 'unsupported'
            if mode == 'archived': source['blocks'][0]['archived'] = True
            if mode == 'mixed-rendered': source['content'] = 'Conflicting or unproved alternate body'
            if mode == 'duplicate-id': source['blocks'][0]['id'] = source['blocks'][1]['id']
            result = f.plan(source, self.template)
            self.assertEqual(result['status'], 'BLOCKED', mode)
            self.assertNotIn('proposed_body', result)
    def test_conflicting_review_and_repeated_sections_refused(self):
        source = fixture(reviewed=True)
        review = source['blocks'][0]
        for todo in f.children(review):
            if todo['type'] == 'to_do': todo['to_do']['checked'] = True
        self.assertEqual(f.plan(source, self.template)['status'], 'BLOCKED')
        source = fixture(); source['blocks'].insert(0, f.node('429', 'extra-New', 'heading_2', {'rich_text': f.rich('New (proposta)')}))
        source['blocks'].insert(1, f.node('429', 'extra-New-2', 'heading_2', {'rich_text': f.rich('New (proposta)')}))
        self.assertEqual(f.plan(source, self.template)['status'], 'BLOCKED')

    def test_uncontained_choices_and_incomplete_media_are_blocked(self):
        source = fixture()
        source['blocks'].append(f.node('429', 'outside-choice', 'to_do', {'rich_text': f.rich('No'), 'checked': True}))
        self.assertEqual(f.plan(source, self.template)['status'], 'BLOCKED')
        source = fixture()
        image = next(b for b in source['blocks'] if b['type'] == 'image')
        del image['image']['file']['url']
        self.assertEqual(f.plan(source, self.template)['status'], 'BLOCKED')
        source = fixture()
        source['blocks'] = [b for b in source['blocks'] if not (b['type'].startswith('heading_') and f.label(b) == 'Imagens')]
        self.assertEqual(f.plan(source, self.template)['status'], 'BLOCKED')
        for bad in [[], None, {'page': []}]:
            self.assertEqual(f.plan(bad, self.template)['status'], 'BLOCKED')
    def test_notes_remain_associated_with_exact_original_location_rich_text(self):
        source = fixture('662', box=True, grouped=True)
        result = self.propose(source)
        tech = next(b for b in result['proposed_body'] if b['type'] == 'toggle' and f.label(b) == f.TECH)
        for association in result['note_associations']:
            self.assertIn('Caixa', f.text(association['location']))
            self.assertTrue(any(b.get('paragraph', {}).get('rich_text') == association['note'] for b in f.walk([tech])))
        self.assertNotIn('Template technical issue', json.dumps(result))
    def test_empty_canonical_technical_toggle_is_still_idempotent(self):
        source = fixture('429', template=True)
        tech = next(b for b in source['blocks'] if b['type'] == 'toggle' and f.label(b) == f.TECH)
        tech['toggle']['children'] = []; tech['has_children'] = False; tech.pop('children_complete')
        first = self.propose(source)
        source['blocks'] = first['proposed_body']
        self.assertEqual(first['proposed_body'], self.propose(source)['proposed_body'])

    def test_cli_is_plan_only_and_cannot_overwrite_source_snapshot(self):
        import sys
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            path = Path(directory) / 'snapshot.json'
            path.write_text(json.dumps(fixture()), encoding='utf-8')
            original = path.read_bytes()
            with patch.object(sys, 'argv', ['format_layout.py', '--input', str(path), '--output', str(path)]), patch('sys.stderr', io.StringIO()), self.assertRaises(SystemExit):
                f.main()
            self.assertEqual(path.read_bytes(), original)
            output = Path(directory) / 'report.json'
            with patch.object(sys, 'argv', ['format_layout.py', '--input', str(path), '--output', str(output)]), patch('sys.stdout', io.StringIO()):
                f.main()
            self.assertEqual(json.loads(output.read_text(encoding='utf-8'))[0]['status'], 'BLOCKED')
            self.assertEqual(path.read_bytes(), original)
            with patch.object(sys, 'argv', ['format_layout.py', '--aplicar']), patch('sys.stderr', io.StringIO()), self.assertRaises(SystemExit):
                f.main()


if __name__ == '__main__':
    unittest.main()
