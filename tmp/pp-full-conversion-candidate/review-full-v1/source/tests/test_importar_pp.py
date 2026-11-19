import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('importar_pp', ROOT / 'importar_pp.py')
pp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pp)
EVIDENCE = json.loads((ROOT / 'focused-source-evidence.json').read_text(encoding='utf-8'))
SID = '00000000-0000-0000-0000-000000000001'
PAGE = '00000000-0000-0000-0000-000000000002'
S = pp.NS['s']
R = pp.NS['r']


def workbook(path, evidence=None, cells=None):
    evidence = evidence or EVIDENCE[0]
    data = copy.deepcopy(cells if cells is not None else evidence['cells'])
    borders = ['<border xmlns="' + S + '"><top/></border>']
    for c in data:
        border = c.get('border', borders[0])
        if border not in borders:
            borders.append(border)
        c['fixture_style'] = borders.index(border)
    styles = ET.Element('styleSheet', xmlns=S)
    bs = ET.SubElement(styles, 'borders')
    for b in borders:
        bs.append(ET.fromstring(b))
    xfs = ET.SubElement(styles, 'cellXfs')
    for i in range(len(borders)):
        ET.SubElement(xfs, 'xf', borderId=str(i))
    names = list(pp.SHEETS) + ['Notas PP']
    wb = ET.Element('workbook', xmlns=S)
    sheets = ET.SubElement(wb, 'sheets')
    rels = ET.Element('Relationships')
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('xl/styles.xml', ET.tostring(styles))
        z.writestr('xl/sharedStrings.xml', '<sst xmlns="' + S + '"/>')
        z.writestr('docProps/core.xml', '<core><modified>fixture</modified></core>')
        for i, name in enumerate(names, 1):
            ET.SubElement(sheets, 'sheet', name=name, attrib={'{' + R + '}id': 'r' + str(i)})
            ET.SubElement(rels, 'Relationship', Id='r' + str(i), Target='worksheets/sheet' + str(i) + '.xml')
            sheet = ET.Element('worksheet', xmlns=S)
            rows = ET.SubElement(sheet, 'sheetData')
            if name == evidence['sheet']:
                byrow = {}
                for item in data:
                    col, row = pp.parts(item['cell'])
                    node = byrow.setdefault(row, ET.SubElement(rows, 'row', r=str(row)))
                    c = ET.SubElement(node, 'c', r=item['cell'], s=str(item['fixture_style']), t='inlineStr')
                    ET.SubElement(ET.SubElement(c, 'is'), 't').text = item['value']
                    if item.get('formula'):
                        ET.SubElement(c, 'f').text = '1+1'
                merges = ET.SubElement(sheet, 'mergeCells')
                for ref in evidence['merges']:
                    ET.SubElement(merges, 'mergeCell', ref=ref)
                z.writestr('xl/worksheets/_rels/sheet' + str(i) + '.xml.rels', '<Relationships><Relationship Id="comment" Target="../comments1.xml"/><Relationship Id="drawing" Target="../drawings/drawing1.xml"/></Relationships>')
                z.writestr('xl/comments1.xml', '<comments xmlns="' + S + '"><commentList><comment ref="N13"><text><t>Original human note: No, retain reason</t></text></comment></commentList></comments>')
                z.writestr('xl/drawings/drawing1.xml', '<wsDr xmlns="' + pp.NS['d'] + '" xmlns:a="' + pp.NS['a'] + '" xmlns:r="' + R + '"><oneCellAnchor><from><col>13</col><row>10</row></from><pic><a:blip r:embed="image"/></pic></oneCellAnchor></wsDr>')
                z.writestr('xl/drawings/_rels/drawing1.xml.rels', '<Relationships><Relationship Id="image" Target="../media/image.png"/></Relationships>')
                z.writestr('xl/media/image.png', b'synthetic fixture image bytes; not a real source image')
            z.writestr('xl/worksheets/sheet' + str(i) + '.xml', ET.tostring(sheet))
        z.writestr('xl/workbook.xml', ET.tostring(wb))
        z.writestr('xl/_rels/workbook.xml.rels', ET.tostring(rels))
    return path


class FakeApi:
    def __init__(self, pages=()):
        self.existing = list(pages)
        self.calls = []
        self.fail_create = False
    def pages(self, source):
        self.calls.append(('QUERY', source))
        return self.existing
    def request(self, method, path, data=None, **kwargs):
        self.calls.append((method, path))
        if method == 'POST' and path == 'pages':
            if self.fail_create:
                raise TimeoutError('uncertain create')
            return {'id': PAGE, 'url': 'fixture-page'}
        if method == 'GET' and path.startswith('pages/'):
            return {'properties': {'Código PP': {'rich_text': [{'plain_text': '428'}]}}}
        raise AssertionError('Unexpected operation: ' + repr((method, path)))
    def upload(self, *args):
        raise AssertionError('No upload expected')


class Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.path = workbook(self.directory / 'fixture.xlsx')
    def plan(self):
        return pp.extract(self.path, SID)
    def import_plan(self):
        plan = self.plan()
        record = next(r for r in plan['records'] if r['code'] == '428')
        record['images'] = []
        record['blocked'] = []
        plan['records'] = [record]
        return plan
    def test_real_pp428_six_plus_two_and_neighbour(self):
        for evidence in EVIDENCE:
            with self.subTest(workbook=evidence['workbook']):
                plan = pp.extract(workbook(self.path, evidence), SID)
                for code, counts in [('428', [6, 2]), ('633', [3, 2])]:
                    record = next(r for r in plan['records'] if r['code'] == code)
                    self.assertEqual([g['locals'] for g in record['groups']], [['Peito'], ['Bolso']])
                    self.assertEqual([len(g['options']) for g in record['groups']], counts)
                    self.assertFalse(record['blocked'])
                first = next(r for r in plan['records'] if r['code'] == '428')
                self.assertEqual([[o['cell'] for o in g['options']] for g in first['groups']], [['P' + str(n) for n in range(10, 16)], ['P16', 'P17']])
    def test_exact_raw_notes_comments_images_remain_recoverable(self):
        record = next(r for r in self.plan()['records'] if r['code'] == '428')
        expected = [{'cell': c['cell'], 'value': c['value']} for c in EVIDENCE[0]['cells'] if 9 <= pp.parts(c['cell'])[1] <= 20 and pp.clean(c['value'])]
        self.assertEqual(record['raw'], expected)
        self.assertTrue(any('Repetição' in n for n in record['notes']))
        self.assertEqual(record['images'], ['xl/media/image.png'])
        self.assertEqual(record['comments'][0]['text'], 'Original human note: No, retain reason')
        blocks = json.dumps(pp.children(record, self.plan()['source'], []), ensure_ascii=False)
        self.assertIn('Original human note: No, retain reason', blocks)
        self.assertIn('Bordado - Até 360 cm2', blocks)
    def test_shared_or_ambiguous_labels_are_not_blindly_split_and_are_blocked(self):
        cells = [c for c in EVIDENCE[0]['cells'] if pp.parts(c['cell'])[1] <= 20]
        cells = copy.deepcopy(cells)
        cells.append({**next(c for c in cells if c['cell'] == 'O10'), 'cell': 'O11', 'value': 'Manga'})
        for cell in cells:
            if cell['cell'] == 'O11':
                cell['value'] = 'Manga'
            if cell['cell'] in ('O16', 'P16'):
                cell['border'] = next(c['border'] for c in cells if c['cell'] == 'O10')
        plan = pp.extract(workbook(self.path, cells=cells), SID)
        record = next(r for r in plan['records'] if r['code'] == '428')
        self.assertEqual(len(record['groups']), 1)
        self.assertEqual(record['groups'][0]['locals'], ['Peito', 'Manga', 'Bolso'])
        self.assertEqual(len(record['groups'][0]['options']), 8)
        self.assertTrue(record['blocked'])
    def test_duplicate_and_missing_source_codes_are_held(self):
        cells = copy.deepcopy(EVIDENCE[0]['cells'])
        for cell in cells:
            if cell['cell'] == 'M21': cell['value'] = '428'
        plan = pp.extract(workbook(self.path, cells=cells), SID)
        self.assertEqual(len(plan['duplicate_codes']['428']), 2)
        self.assertTrue(all(r['blocked'] for r in plan['records']))
        for cell in cells:
            if cell['cell'] == 'M9': cell['value'] = None
            if cell['cell'] == 'O9': cell['value'] = 'LOCAL'
        cells.append({**next(c for c in cells if c['cell'] == 'O10'), 'cell': 'O9', 'value': 'LOCAL'})
        plan = pp.extract(workbook(self.path, cells=cells), SID)
        self.assertTrue(plan['orphans'])
        self.assertTrue(all(r['code'] for r in plan['records']))
    def test_import_rejects_duplicate_or_missing_codes_before_network(self):
        for mode in ['duplicate', 'missing']:
            plan = self.import_plan()
            if mode == 'duplicate': plan['records'].append(copy.deepcopy(plan['records'][0]))
            else: plan['records'][0]['code'] = ''
            api = FakeApi()
            with patch.object(pp, 'prepare_options'), self.assertRaises(ValueError):
                pp.import_records(api, plan, set(), self.directory / 'journal.json')
            self.assertEqual(api.calls, [])
    def test_changed_source_blocks_import_and_schema_prep_before_network(self):
        plan = self.import_plan()
        self.path.write_bytes(b'changed')
        for command in ['import', 'options']:
            api = FakeApi()
            with self.assertRaises(ValueError):
                if command == 'import': pp.import_records(api, plan, set(), self.directory / 'journal.json')
                else: pp.prepare_options(api, plan)
            self.assertEqual(api.calls, [])
    def test_existing_code_is_preserved_without_schema_or_page_mutations(self):
        api = FakeApi([{'id': PAGE, 'properties': {'Código PP': {'rich_text': [{'plain_text': '428'}]}}}])
        with patch.object(pp, 'prepare_options') as prepare:
            pp.import_records(api, self.import_plan(), set(), self.directory / 'journal.json')
        prepare.assert_not_called()
        self.assertEqual(api.calls, [('QUERY', SID)])
        self.assertFalse((self.directory / 'journal.json').exists())
    def test_uncertain_page_create_cannot_be_repeated_when_not_visible(self):
        plan = self.import_plan(); api = FakeApi(); api.fail_create = True
        journal = self.directory / 'journal.json'
        with patch.object(pp, 'prepare_options'):
            with self.assertRaises(TimeoutError): pp.import_records(api, plan, set(), journal)
            self.assertEqual(json.loads(journal.read_text(encoding='utf-8'))['428']['status'], 'a_criar')
            with self.assertRaises((ValueError, RuntimeError)): pp.import_records(api, plan, set(), journal)
        self.assertEqual(api.calls.count(('POST', 'pages')), 1)
    def test_confirmed_journal_page_absent_from_query_is_also_held(self):
        plan = self.import_plan(); journal = self.directory / 'journal.json'
        pp.write_json(journal, {'428': {'status': 'criado', 'page_id': PAGE}})
        api = FakeApi()
        with patch.object(pp, 'prepare_options') as prepare, self.assertRaises((ValueError, RuntimeError)):
            pp.import_records(api, plan, set(), journal)
        prepare.assert_not_called()
        self.assertNotIn(('POST', 'pages'), api.calls)
    def test_dry_run_never_constructs_api_or_mutates_files(self):
        plan = self.import_plan(); path = self.directory / 'plan.json'; pp.write_json(path, plan)
        before = {p.name: p.read_bytes() for p in self.directory.iterdir()}
        for command in ['importar', 'opcoes']:
            with patch.object(pp.sys, 'argv', ['importar_pp.py', command, '--plano', str(path)]), patch.object(pp, 'Notion', side_effect=AssertionError('No API')), patch.object(pp.urllib.request, 'urlopen', side_effect=AssertionError('No network')), patch('sys.stdout', io.StringIO()):
                pp.main()
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.directory.iterdir()})
    def test_write_timeout_and_5xx_are_not_retried(self):
        for error in [TimeoutError('ambiguous'), urllib.error.HTTPError('https://invalid', 503, 'failed', {}, io.BytesIO(b'fixture'))]:
            api = pp.Notion.__new__(pp.Notion); api.headers = {}
            with patch.object(pp.urllib.request, 'urlopen', side_effect=error) as request, patch.object(pp.time, 'sleep') as sleep, self.assertRaises((RuntimeError, TimeoutError)):
                api.request('POST', 'pages', {})
            self.assertEqual(request.call_count, 1); sleep.assert_not_called()
    def test_image_rejections_happen_before_any_api_request(self):
        api = pp.Notion.__new__(pp.Notion); api.headers = {}
        with patch.object(api, 'request', side_effect=AssertionError('No API')):
            with self.assertRaises(ValueError): api.upload('image.bmp', b'bytes')
            with self.assertRaises(ValueError): api.upload('image.png', b'x' * (20 * 1024 * 1024 + 1))


    def options_api(self, plan, *, fail_create=False, fail_cleanup=False):
        wanted = pp.schema_options(plan)
        class OptionsApi:
            def __init__(self):
                self.calls = []
                self.schema = {"properties": {name: {"type": "multi_select", "multi_select": {"options": []}} for name in wanted}}
                self.schema["properties"]["Opções de personalização"]["multi_select"]["options"] = [{"id": str(i), "name": "Existing " + str(i), "color": "blue"} for i in range(100)]
            def request(self, method, path, data=None):
                self.calls.append((method, path, copy.deepcopy(data)))
                if method == 'GET': return copy.deepcopy(self.schema)
                if method == 'POST':
                    if fail_create: raise TimeoutError('Uncertain helper create')
                    return {'id': PAGE}
                if data.get('in_trash'):
                    if fail_cleanup: raise TimeoutError('Uncertain helper cleanup')
                    return {}
                for name, prop in data.get('properties', {}).items():
                    old = self.schema['properties'][name]['multi_select']['options']
                    if path.startswith('data_sources/'):
                        self.schema['properties'][name]['multi_select']['options'] = prop['multi_select']['options']
                    else:
                        have = {o['name'] for o in old}
                        old.extend({**o, 'id': 'fixture-new', 'color': 'default'} for o in prop['multi_select'] if o['name'] not in have)
                return {}
        return OptionsApi()
    def test_helper_uncertain_create_or_cleanup_blocks_next_schema_attempt(self):
        for create in [True, False]:
            with self.subTest(create=create):
                plan = self.import_plan(); api = self.options_api(plan, fail_create=create, fail_cleanup=not create)
                journal = self.directory / ('helper-' + str(create) + '.json')
                with self.assertRaises(TimeoutError): pp.prepare_options(api, plan, journal)
                state = json.loads(journal.read_text(encoding='utf-8'))
                self.assertEqual(state['status'], 'a_criar' if create else 'criado')
                calls = len(api.calls)
                with self.assertRaises(ValueError): pp.prepare_options(api, plan, journal)
                self.assertEqual(len(api.calls), calls)
                self.assertEqual(sum(m == 'POST' for m, _, _ in api.calls), 1)
    def test_schema_helper_success_preserves_existing_options_and_records_cleanup(self):
        plan = self.import_plan(); api = self.options_api(plan); journal = self.directory / 'helper.json'
        pp.prepare_options(api, plan, journal)
        self.assertEqual(json.loads(journal.read_text(encoding='utf-8'))['status'], 'concluido')
        options = api.schema['properties']['Opções de personalização']['multi_select']['options']
        self.assertEqual(options[:100], [{'id': str(i), 'name': 'Existing ' + str(i), 'color': 'blue'} for i in range(100)])
        self.assertFalse(pp.option_patch(api.schema, pp.schema_options(plan)))
        self.assertTrue(any(data == {'in_trash': True} for _, _, data in api.calls))
    def test_legacy_ambiguous_plan_cannot_bypass_assignment_hold(self):
        plan = self.import_plan(); plan['records'][0]['groups'][0]['locals'].append('Shared')
        api = FakeApi()
        with self.assertRaises(ValueError): pp.import_records(api, plan, {'428'}, self.directory / 'journal.json')
        self.assertEqual(api.calls, [])
    def test_existing_page_reconciles_pending_journal_without_changing_manual_content(self):
        plan = self.import_plan(); journal = self.directory / 'journal.json'
        state = {'428': {'status': 'a_criar', 'source_sha256': plan['source']['sha256']}}
        pp.write_json(journal, state)
        existing = {'id': PAGE, 'properties': {'Código PP': {'rich_text': [{'plain_text': '428'}]}, 'Human': {'text': 'No, original reason'}}}
        api = FakeApi([existing])
        with patch.object(pp, 'prepare_options') as prepare:
            pp.import_records(api, plan, set(), journal)
        prepare.assert_not_called(); self.assertEqual(api.calls, [('QUERY', SID)])
        self.assertEqual(api.existing, [existing]); self.assertEqual(json.loads(journal.read_text(encoding='utf-8')), state)

    def test_cli_prepare_is_local_and_keeps_correct_group_assignments(self):
        output = self.directory / 'preview'
        with patch.object(pp.sys, 'argv', ['importar_pp.py', 'preparar', '--excel', str(self.path), '--fonte-dados', SID, '--pasta', str(output)]), patch.object(pp, 'Notion', side_effect=AssertionError('No API')), patch.object(pp.urllib.request, 'urlopen', side_effect=AssertionError('No network')), patch('sys.stdout', io.StringIO()):
            pp.main()
        plan = json.loads((output / 'plano_importacao.json').read_text(encoding='utf-8'))
        record = next(r for r in plan['records'] if r['code'] == '428')
        self.assertEqual([len(g['options']) for g in record['groups']], [6, 2])
        self.assertEqual({p.name for p in output.iterdir()}, {'plano_importacao.json', 'resumo.json', 'opcoes_notion.json', 'revisao.csv'})


if __name__ == '__main__':
    unittest.main()
