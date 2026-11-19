import copy
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / 'tests'))
import batch_apply as a
import batch_plan as b
import full_conversion as f
import full_excel
import full_regions as regions
import method_targets
import rendered_layout as r
from test_batch import drive, sync
from test_pocket import Connector

BASE = ROOT.parent
DEFAULT = dict(r.PAGES)


def read(path): return json.loads(Path(path).read_text(encoding='utf-8'))


class FullTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tmp.cleanup)
        cls.out = Path(cls.tmp.name) / 'representative.json'
        index = BASE / 'input/workbook-index.json'
        inventory = BASE / 'input/inventory-current.json'
        book = read(index)['source']['path']
        packaged = BASE / 'input/workbook.xlsx'
        if packaged.exists(): book = packaged
        f.prepare(BASE / 'captures', book, index, inventory, ['39', '42', '50', '261', '262'], cls.out)
        cls.master = read(cls.out)
        r.PAGES.clear(); r.PAGES.update(DEFAULT)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.bundle = copy.deepcopy(self.master)
        self.bundle.update(synthetic=True, implementation_sha256=b.implementation_sha())
        method_targets.configure(self.bundle['target_manifest'])
        self.addCleanup(self.restore)

    def restore(self): r.PAGES.clear(); r.PAGES.update(DEFAULT)

    def page(self, code): return next(p for p in self.bundle['pages'] if p['code'] == code)

    def approval(self, codes):
        return {'plan_sha256': r.digest(self.bundle), 'implementation_sha256': b.implementation_sha(),
                'authorisation': 'OFFLINE_FAKE_CONNECTOR_TEST', 'review_reference': 'OFFLINE_FULL_TEST_ONLY',
                'approved_codes': codes, 'approved_operation_ids': [op['id'] for p in self.bundle['pages'] if p['code'] in codes
                    for op in p['operations'] + p['property_operations'] + [p['completion_status_operation'], p['failure_status_operation']]]}

    def session(self, codes): return a.FileSession(self.work / 'runs/one', self.bundle, self.approval(codes), fake=True)

    def connector(self):
        result = Connector({c: read(BASE / ('captures/pp' + c + '.json')) for c in r.PAGES}, read(BASE / 'captures/schema.json'))
        result.home = read(BASE / 'captures/home.json')
        return result

    def test_real_all_sheet_inventory_and_duplicate_missing_codes(self):
        index = read(BASE / 'input/workbook-index.json')
        inventory = read(BASE / 'input/inventory-current.json')
        coverage = full_excel.coverage(index, inventory)
        self.assertEqual(coverage['working_copy_total'], 814)
        self.assertEqual(set(coverage['worksheets']), set(__import__('importar_pp').SHEETS))
        self.assertEqual(len(coverage['duplicates']), 7)
        for code in ['184', '492', '967']:
            with self.assertRaises(ValueError): full_excel.record(index, code)
        with self.assertRaisesRegex(ValueError, 'E168,E170'): full_excel.record(index, '787')
        self.assertEqual(len(coverage['notion_bindings']), 814)

    def test_multiline_original_is_retained_and_two_techniques_in_one_cell_refused(self):
        index=read(BASE/'input/workbook-index.json');record=next(x for x in index['records'] if x['code']=='42')
        cell=next(x for x in record['raw'] if x['cell']=='F10')
        cell['value']='Tampografia 1 Cor\n (nota própria)'
        record['groups'][0]['options'][0]['original']='Tampografia 1 Cor (nota própria)'
        self.assertIn('\n', full_excel.record(index,'42')['groups'][0]['options'][0]['original'])
        cell['value']='Tampografia 1 Cor\nDTF - Até A7';record['groups'][0]['options'][0]['original']='Tampografia 1 Cor DTF - Até A7'
        with self.assertRaisesRegex(ValueError,'F10'):full_excel.record(index,'42')

    def test_full_property_sync_is_verified_against_saved_new(self):
        connector=self.connector();response=connector.pages[r.PAGES['39']]
        old=b.page_state(a.capture_response(response,r.PAGES['39']))
        properties=copy.deepcopy(old['properties']);properties['Número de locais possíveis']=99
        original=re.search(r'<properties>\s*([\s\S]*?)\s*</properties>',response['structuredContent']['text'])[1]
        response['structuredContent']['text']=response['structuredContent']['text'].replace(original,json.dumps(properties,ensure_ascii=False),1);sync(response)
        changed=b.page_state(a.capture_response(response,r.PAGES['39']));page=self.page('39')
        page['source_state_sha256']=changed['source_state_sha256'];page['source_metadata']=b.stable_metadata(changed)
        page['property_operations']=[{'id':'39-full-properties','kind':'properties','eligible':True,
             'payload':{'command':'update_properties','page_id':r.PAGES['39'],'properties':{'Número de locais possíveis':2}}}]
        session=self.session(['39']);result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETE')
        self.assertEqual(connector.writes[-2]['properties'],{'Número de locais possíveis':2})

    def test_cancel_stops_without_next_content_or_error_status(self):
        connector=self.connector();session=self.session(['39','50']);action=session.start()
        while action['type']!='WRITE_PENDING':action=session.event({'nonce':action['nonce'],'result':connector.fetch(action['payload'],action['type'])})
        result=session.event(cancel=True)
        self.assertEqual(result['status'],'UNCERTAIN');self.assertEqual(connector.writes,[])

    def test_original_only_full_layout_and_exact_excel_shared_groups(self):
        page = self.page('39')
        self.assertTrue(page['method_complete'])
        nodes = regions.parse(page['desired_body']); _, sides = r.body_sections(nodes)
        self.assertEqual(len([n for n in nodes if n.kind == 'columns']), 1)
        self.assertTrue(all(len(row) == 2 for t in r.mappings(sides)['New'] + r.mappings(sides)['Old'] for row in t))
        self.assertEqual(page['new_groups'][0]['locations'], ['Face 1', 'Face 2'])
        self.assertTrue(page['new_groups'][0]['shared_source_group'])
        self.assertEqual(r.mappings(sides)['Old'][0][1][1], 'Tampografia 1 Cor')
        self.assertLess(next(i for i, n in enumerate(nodes) if n.kind == 'image'), next(i for i,n in enumerate(nodes) if n.kind == 'columns'))
        self.assertIn('Óculos', page['desired_body'])
        self.assertNotIn('PP428.png', page['desired_body'])

    def test_current_extra_is_preserved_and_not_falsely_complete(self):
        page = self.page('42')
        self.assertFalse(page['method_complete'])
        self.assertIn('Laser Metal - Até 360 cm2', page['new_groups'][0]['options'])
        self.assertTrue(any('ausente do Excel' in x for x in page['technical_unresolved']))
        self.assertEqual(page['property_operations'], [])

    def test_general_2colour_pending_layout_is_not_success(self):
        page = self.page('50'); self.assertFalse(page['method_complete'])
        self.assertTrue(page['operations']); self.assertEqual(page['property_operations'], [])
        connector = self.connector(); session = self.session(['50', '39'])
        result = drive(session, connector, session.start())
        self.assertEqual(result['pages']['50']['outcome'], 'PARTIAL')
        self.assertEqual(result['pages']['50']['saved_estado'], 'Erro')
        self.assertEqual(result['pages']['39']['outcome'], 'SUCCESS')

    def test_full_page_execution_verified_final_status_and_scope_receipt(self):
        connector = self.connector(); session = self.session(['39'])
        result = drive(session, connector, session.start())
        self.assertEqual(result['status'], 'COMPLETE')
        self.assertEqual(result['pages']['39']['outcome'], 'SUCCESS')
        report = result['pages']['39']
        self.assertEqual(report['completion_binding']['scope'], f.VERSION)
        self.assertTrue(report['completion_binding']['excel_sha256'])
        self.assertEqual(connector.writes[-1]['properties'], {'Estado': 'Para revisão'})
        saved = b.page_state(a.capture_response(connector.pages[r.PAGES['39']], r.PAGES['39']))
        self.assertEqual([n.raw for n in regions.parse(saved['body'])], [n.raw for n in regions.parse(self.page('39')['desired_body'])])
        journal = read(session.path)
        self.assertEqual(len(journal['receipts']), len(connector.writes))

    def test_real_bounded_browser_regions_allow_layout_but_not_false_semantic_success(self):
        connector = self.connector(); session = self.session(['262', '39'])
        result = drive(session, connector, session.start())
        self.assertEqual(result['pages']['262']['outcome'], 'PARTIAL')
        self.assertEqual(result['pages']['39']['outcome'], 'SUCCESS')
        self.assertTrue(any(x['page_id'] == r.PAGES['262'] and x['command'] == 'update_content' for x in connector.writes))
        self.assertTrue(any(x['region_evidence'].get('bounded_observations') for x in self.page('262')['operations']))
        current = b.page_state(read(BASE / 'captures/pp262.json'))
        node = next(n for n in regions.parse(current['body']) if n.kind == 'columns')
        payload = {'command': 'update_content', 'page_id': current['page_id'], 'content_updates': [{'old_str': node.raw, 'new_str': '', 'replace_all_matches': False}]}
        current['coverage'] = {'state': 'EXPLICIT_COMPLETE_EXPORT'}
        with self.assertRaises(ValueError): regions.inspect(current, payload)

    def test_removed_or_mismatched_browser_observation_does_not_unlock_containers(self):
        page = self.page('262'); state = b.page_state(read(BASE / 'captures/pp262.json'))
        bounded = copy.deepcopy(page['bounded_region_evidence'])
        bounded['regions'][1]['tables'][0][1][2] = 'different body note'
        desired, operations, proof = f.render(state, page['excel'], page['new_groups'], page['technical_unresolved'], 'mismatch', bounded)
        self.assertEqual(operations, []); self.assertIn('blocked_region', proof)

    def test_complete_format_report_accounts_for_all_source_blocks(self):
        report = read(BASE / 'verification/excel-format-coverage.json')
        self.assertEqual(len(report['blocks']), 823)
        self.assertEqual(report['all_blocks_summary']['structural_errors'], 0)
        self.assertEqual(len({x['source'] for x in report['blocks']}), 823)
        for code, expected in [('42','F10'),('39','F16'),('33','F23'),('50','F29')]:
            case = report['cases'][code]
            self.assertEqual([o['cell'] for g in case['groups'] for o in g['options']], [expected])
        self.assertEqual(report['cases']['661']['images'], [])
        groups = report['cases']['558']['groups']
        self.assertEqual([g['locals'] for g in groups], [['Bolso Esquerdo'], ['Bolso Direito']])
        self.assertTrue(report['cases']['262']['merges'])
        self.assertFalse(any(x['neighbour_columns_included'] or x['visto_column_included'] for x in report['blocks']))

    def test_styled_xml_and_note_scopes_preserved_in_preview(self):
        page = self.page('262')
        self.assertIn('<columns>', page['desired_body'])
        self.assertIn('Locais apresentados no mesmo grupo do Excel.', page['desired_body'])
        self.assertIn('430.00001525878906', page['desired_body'])
        self.assertTrue(any(n['side'] == 'New' for n in page['preservation']['notes']))
        self.assertTrue(any(n['side'] == 'Old' for n in page['preservation']['notes']))
        for group in page['new_groups']:
            if any('Manga' in x for x in group['locations']):
                self.assertTrue(any('DTF - Até A7' in x for x in group['options']))

    def test_prior_pocket_estado_does_not_skip_full_content(self):
        connector = self.connector(); page = connector.pages[r.PAGES['39']]
        page['structuredContent']['text'] = page['structuredContent']['text'].replace('"Estado":"A rever"', '"Estado":"Para revisão"')
        sync(page)
        current = b.page_state(a.capture_response(page, r.PAGES['39']))
        planned = self.page('39'); planned['source_state_sha256'] = current['source_state_sha256']; planned['source_metadata'] = b.stable_metadata(current)
        session = self.session(['39']); result = drive(session, connector, session.start())
        self.assertEqual(result['pages']['39']['outcome'], 'SUCCESS')
        self.assertTrue(any(x['command'] == 'update_content' for x in connector.writes))
        self.assertFalse(any(x.get('properties') == {'Estado': 'Para revisão'} for x in connector.writes))

    def test_idempotent_layout_preserves_own_yes_no_and_reason(self):
        page = self.page('39'); state = b.page_state(read(BASE / 'captures/pp39.json'))
        state['body'] = page['desired_body'].replace('- [ ] Não,', '- [x] Não,').replace('<b>Se não, porquê?</b>\n<p />', '<b>Se não, porquê?</b>\nMotivo humano próprio')
        desired, ops, proof = f.render(state, page['excel'], page['new_groups'], [], page['completion_binding']['full_scope_sha256'])
        self.assertEqual(desired, state['body']); self.assertEqual(ops, []); self.assertTrue(proof['idempotent'])
        self.assertIn('Motivo humano próprio', desired)
        broken=state['body'].replace('<column ratio="50">','<column ratio="40">',1)
        with self.assertRaises(ValueError):f.validate_layout(broken,'39')

    def test_prepare_again_with_new_capture_time_does_not_repeat_conversion(self):
        captures=self.work/'captures';shutil.copytree(BASE/'captures',captures)
        response=read(captures/'pp39.json');before=b.page_state(response);page=self.page('39')
        response['response']['structuredContent']['text']=response['response']['structuredContent']['text'].replace(before['body'],page['desired_body'],1).replace('"Estado":"A rever"','"Estado":"Para revisão"')
        response['response']['structuredContent']['page_last_edited_at']='2026-11-19T10:00:00Z'
        response['capture']['received_at_utc']='2026-11-19T10:01:00Z';sync(response['response']);a.atomic(captures/'pp39.json',response)
        template=read(captures/'pp428.json');template['capture']['received_at_utc']='2026-11-19T10:01:00Z';a.atomic(captures/'pp428.json',template)
        output=self.work/'rerun.json'
        f.prepare(captures,self.bundle['excel']['workbook'],BASE/'input/workbook-index.json',BASE/'input/inventory-current.json',['39'],output)
        planned=read(output)['pages'][0]
        self.assertEqual(planned['operations'],[]);self.assertTrue(planned['method_complete']);self.assertEqual(planned['property_operations'],[])

    def test_failed_initial_capture_is_local_error_and_does_not_block_other_page_plan(self):
        captures=self.work/'captures';shutil.copytree(BASE/'captures',captures)
        failed=read(captures/'pp42.json');failed['response']={'isError':True,'content':[],'structuredContent':None};a.atomic(captures/'pp42.json',failed)
        output=self.work/'partial-input.json'
        f.prepare(captures,self.bundle['excel']['workbook'],BASE/'input/workbook-index.json',BASE/'input/inventory-current.json',['42','39'],output)
        pages=read(output)['pages'];self.assertTrue(pages[0]['full_prepare_error']);self.assertEqual(pages[0]['operations'],[])
        self.assertTrue(pages[1]['method_complete']);self.assertTrue(pages[1]['operations'])

    def test_lost_write_never_replayed_and_next_independent_pp_runs(self):
        connector = self.connector(); connector.lost_at = 1
        session = self.session(['39', '50']); result = drive(session, connector, session.start())
        self.assertEqual(result['pages']['39']['outcome'], 'UNCERTAIN')
        self.assertIn('50', result['pages'])
        self.assertEqual(sum(x['page_id'] == r.PAGES['39'] and x['command'] == 'update_content' for x in connector.writes), 1)
        self.assertFalse(session.fence.exists())

    def test_crash_continue_does_not_replay_pending_leaf(self):
        connector = self.connector(); session = self.session(['39', '50']); action = session.start()
        while action['type'] != 'WRITE_PENDING': action = session.event({'nonce': action['nonce'], 'result': connector.fetch(action['payload'], action['type'])})
        connector.update(action['payload'])
        resumed = a.FileSession(session.root, self.bundle, self.approval(['39', '50']), fake=True)
        result = drive(resumed, connector, resumed.event(continue_batch=True))
        self.assertEqual(result['pages']['39']['outcome'], 'UNCERTAIN')
        self.assertIn('50', result['pages'])
        self.assertEqual(sum(x['page_id'] == r.PAGES['39'] and x['command'] == 'update_content' for x in connector.writes), 1)

    def test_rules_change_is_global_refusal_before_content(self):
        connector = self.connector(); connector.home['structuredContent']['text'] = connector.home['structuredContent']['text'].replace('Tampografia 1 Cor', 'Tampografia nova', 1); sync(connector.home)
        session = self.session(['39'])
        with self.assertRaises(a.SourceGuardError): drive(session, connector, session.start())
        self.assertEqual(connector.writes, [])

    def test_negative_saved_coverage_quarantines_without_success(self):
        connector = self.connector(); fetch = connector.fetch
        def truncated(request, phase):
            result = fetch(request, phase)
            if phase == 'VERIFY_PAGE': result['structuredContent']['metadata']['unknown_block_ids'] = ['actual-unknown']; sync(result)
            return result
        connector.fetch = truncated
        session = self.session(['39']); result = drive(session, connector, session.start())
        self.assertEqual(result['pages']['39']['outcome'], 'UNCERTAIN')
        self.assertFalse(any(x.get('properties') == {'Estado': 'Para revisão'} for x in connector.writes))

    def test_readonly_reconciliation_full_leaf_never_writes(self):
        connector = self.connector(); connector.lost_at = 1; session = self.session(['39'])
        drive(session, connector, session.start()); count = len(connector.writes)
        result = drive(session, connector, session.event(reconcile=True, reconcile_code='39'))
        self.assertEqual(result['status'], 'RECONCILED_STOPPED'); self.assertEqual(len(connector.writes), count)

    def test_pp601_and_protected_collection_refused(self):
        self.bundle['target_manifest']['collection'] = 'collection://166b6705-ae1f-83da-be92-87f8d804a1a5'
        self.bundle['target_manifest_sha256'] = r.digest(self.bundle['target_manifest'])
        with self.assertRaises(ValueError): self.session(['39'])
        protected = f.page_id(full_excel.inventory(read(BASE / 'input/inventory-current.json'))['601']['url'])
        with self.assertRaises(ValueError): a.validated_payload({'payload': {'command': 'update_properties', 'page_id': protected, 'properties': {'Estado': 'Erro'}}}, protected, True, True)

    def test_noimage_and_multiple_images_use_own_media_only(self):
        state = b.page_state(read(BASE / 'captures/pp39.json')); p = self.page('39')
        image = next(n for n in regions.parse(state['body']) if n.kind == 'image')
        state['body'] = state['body'].replace(image.raw, '')
        desired, _, _ = f.render(state, p['excel'], p['new_groups'], [], 'noimage')
        self.assertFalse(any(n.kind == 'image' for n in regions.parse(desired)))
        state['body'] += '\n\n' + image.raw + '\n\n' + image.raw.replace('PP39_1.png', 'PP39_2.png')
        desired, _, _ = f.render(state, p['excel'], p['new_groups'], [], 'twoimages')
        self.assertEqual(len([n for n in regions.parse(desired) if n.kind == 'image']), 2)

    def test_bottle_and_notebook_rules_are_own_source_supported(self):
        choices = f.catalog(f.rule_source(read(BASE / 'captures/home.json')))
        record = {'code': '900', 'title': 'GARRAFA metal', 'description': '', 'area': 'Brindes',
                  'groups': [{'locals': ['Corpo'], 'options': [{'original': 'Laser Circular - Até 50 cm2'}]}]}
        generated, pending, _, _ = f.generate(record, {}, choices)
        self.assertEqual(generated[0]['options'], ['Laser Circular - Até 50 cm2'])
        self.assertFalse(pending)
        self.assertFalse(any('UV' in x for x in generated[0]['options']))
        record['groups'][0]['options'][0]['original'] = 'Laser Circular - Até 25 cm2'
        generated, pending, _, _ = f.generate(record, {}, choices)
        self.assertTrue(pending); self.assertEqual(generated[0]['options'], ['Laser Circular - Até 25 cm2'])
        record.update(title='Bloco A6', groups=[{'locals': ['Capa'], 'options': [{'original': 'Sublimação - Até A4 (21x29,7cm - TAPETE RATO)'}]}])
        generated, _, _, _ = f.generate(record, {}, choices)
        self.assertTrue(any('Até A6' in x for x in generated[0]['options']))

    def test_escaped_pipe_cells_and_opaque_content(self):
        page = self.page('39'); state = b.page_state(read(BASE / 'captures/pp39.json'))
        source_table = next(n for n in regions.parse(state['body']) if n.kind == 'table')
        raw = source_table.raw.replace('Tampografia 1 Cor', 'Tampografia 1 Cor \\| referência')
        self.assertEqual(len(regions.parse(raw)[0].rows[1]), 3)
        state['body'] += '\n\n<custom-block definition-id="unknown" />'
        with self.assertRaises(ValueError): f.render(state, page['excel'], page['new_groups'], [], 'opaque')


if __name__ == '__main__': unittest.main()
