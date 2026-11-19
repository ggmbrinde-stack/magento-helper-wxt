import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
import batch_apply as a
import batch_plan as b
import method_plan as m
import method_targets
import native_rows
import rendered_layout as r
from test_batch import FakeConnector,drive,sync

DEFAULT=dict(r.PAGES)


def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))


class MethodTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.work=Path(self.temp.name)
        self.addCleanup(self.restore_targets)
        self.bundle=read('plans/method.json');self.bundle['synthetic']=True
        self.bundle['implementation_sha256']=b.implementation_sha()
        book=self.work/'book';book.write_bytes(b'fake workbook');evidence=self.work/'evidence';evidence.write_bytes(b'fake evidence')
        self.bundle['excel'].update(workbook=str(book),workbook_sha256=hashlib.sha256(book.read_bytes()).hexdigest(),evidence_sha256=hashlib.sha256(evidence.read_bytes()).hexdigest())
        self.bundle['evidence_path']=str(evidence)
        method_targets.configure(self.bundle['target_manifest'])
        self.captures={code:read('captures/final-current/pp'+code+'.json') for code in r.PAGES}
        self.schema=read('captures/final-current/schema.json')
    def restore_targets(self):r.PAGES.clear();r.PAGES.update(DEFAULT)
    def approval(self,codes=('429',)):
        return {'plan_sha256':r.digest(self.bundle),'implementation_sha256':self.bundle['implementation_sha256'],
                'authorisation':'OFFLINE_FAKE_CONNECTOR_TEST','review_reference':'OFFLINE_METHOD_REVIEW','approved_codes':list(codes),
                'approved_operation_ids':[o['id'] for p in self.bundle['pages'] if p['code'] in codes for o in p['operations']+p['property_operations']]}
    def session(self,codes=('429',),name='one'):return a.FileSession(self.work/'runs'/name,self.bundle,self.approval(codes),fake=True)
    def connector(self):return FakeConnector(self.captures,self.schema)
    def test_all_eleven_source_backed_rows_and_no_op_428(self):
        self.assertEqual(len(self.bundle['pages']),11)
        first=self.bundle['pages'][0];self.assertEqual(first['code'],'428');self.assertEqual(first['status'],'NO_OP')
        self.assertEqual(first['source_body'],first['desired_body']);self.assertIn('Falta transfer 1 C 126cm',first['desired_body'])
        for page in self.bundle['pages']:
            state=b.page_state(self.captures[page['code']]);self.assertEqual(state['coverage']['state'],'UNKNOWN')
            body=state['body'];meta=b.stable_metadata(state)
            for op in page['operations']:
                self.assertEqual(op['payload']['command'],'update_content');native_rows.inspect({**state,'body':body},op['payload'])
                body,meta=a.apply_model(body,meta,op['payload'])
            self.assertEqual(body,page['desired_body']);self.assertEqual(meta,b.stable_metadata(state))
            self.assertNotIn('Falta transfer 1 C 126cm',body) if page['code']!='428' else None
        for code in ['430','558','661','662']:
            page=next(p for p in self.bundle['pages'] if p['code']==code)
            self.assertFalse(page['method_complete']);self.assertTrue(page['technical_unresolved']);self.assertEqual(page['property_operations'],[])
    def test_category_rules_a4_a6_long_sleeves_and_representative_sizes(self):
        for category,location,context,size in [('APRON','Peito',{},'A4'),('APRON','Bolso Peito',{},'A6'),('TEXTILE','Manga Comprida',{},'A7'),('TEXTILE','Costas',{},'A4'),('TOWEL_SMALL','Face 1',{},'A6'),('BLANKET','Face 1',{},'A4'),('UMBRELLA','Painel 1',{},'A4'),('PARASOL','Painel 1',{},'A3'),('SUBLIMATION','Face 1',{'article_size':'A5'},'A5')]:
            self.assertEqual(m.reference(category,location,context),size)
        self.assertIsNone(m.reference('GENERAL_GIFT','Face 1',{}))
        self.assertIsNone(m.reference('APRON','Caixa',{}))
    def test_shared_original_groups_asymmetric_558_box_hats_and_633_three_plus_two(self):
        expected={'430':[6,2],'558':[1,1],'633':[3,2],'661':[7,2],'662':[6,2,8],'786':[2],'467':[4,2,3],'840':[4,2,3]}
        for code,counts in expected.items():
            page=next(p for p in self.bundle['pages'] if p['code']==code);_,sides=r.body_sections(r.parse(page['desired_body']))
            table=next(n for n in sides['Old'].items if n.kind=='table')
            self.assertEqual([len(b.lines(row[1])) for row in table.rows[1:]],counts)
            if code in ('430','661','662'):self.assertEqual(len(b.lines(table.rows[2][0])),2)
            if code=='786':self.assertEqual(len(b.lines(table.rows[1][0])),3)
            if code in ('467','840'):self.assertIn('Chapéu',table.rows[-1][0])
            if code=='662':self.assertEqual(table.rows[-1][0],'Caixa')
        page=next(p for p in self.bundle['pages'] if p['code']=='661');self.assertNotIn('<image ',page['desired_body'])
    def test_actual_429_full_row_save_then_matching_reviewed_property(self):
        connector=self.connector();session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETE');self.assertEqual([p['command'] for p in connector.writes],['update_content','update_properties'])
        state=b.page_state(a.capture_response(connector.pages[r.PAGES['429']],r.PAGES['429']))
        self.assertIn('Bordado - Até 600 cm2',state['body'])
        proposals,unknown=b.property_proposals(state,b.schema_state(self.schema));self.assertEqual(proposals,[]);self.assertEqual(unknown,[])
    def test_all_eleven_fake_transport_preserves_pending_choices_without_partial_property_sync(self):
        codes=tuple(self.bundle['target_manifest']['targets']);connector=self.connector();session=self.session(codes)
        self.assertEqual(drive(session,connector,session.start())['status'],'COMPLETE')
        self.assertEqual(len(connector.writes),25)
        self.assertEqual([p['page_id'] for p in connector.writes if p['command']=='update_properties'],[r.PAGES['429']])
        for page in self.bundle['pages']:
            state=b.page_state(a.capture_response(connector.pages[page['page_id']],page['page_id']))
            self.assertEqual(state['body'],page['desired_body'])
            if not page['method_complete']:self.assertTrue(page['technical_unresolved'])
    def test_body_notes_saved_in_place_and_original_joint_scope_not_only_history(self):
        page=next(p for p in self.bundle['pages'] if p['code']=='633')
        _,before=r.body_sections(r.parse(page['source_body']));_,after=r.body_sections(r.parse(page['desired_body']))
        old=next(n for n in before['Old'].items if n.kind=='table');new=next(n for n in after['Old'].items if n.kind=='table')
        for col,note in enumerate(old.rows[1][2:],2):
            if note.strip():self.assertEqual(new.rows[1][col],native_rows.note_label(old.rows[1][0],note));self.assertEqual(new.rows[2][col],'')
        old_new=next(n for n in before['New'].items if n.kind=='table');new_new=next(n for n in after['New'].items if n.kind=='table')
        self.assertEqual([row[2:] for row in old_new.rows],[row[2:] for row in new_new.rows])
        self.assertNotIn('Histórico de apresentação',page['desired_body'])
    def test_row_targets_refuse_partial_missing_multiple_unsupported_or_note_loss(self):
        page=next(p for p in self.bundle['pages'] if p['code']=='429');state=b.page_state(self.captures['429']);payload=page['operations'][0]['payload']
        for mode in ['partial','missing','multiple','notes','block']:
            bad=copy.deepcopy(payload);current=copy.deepcopy(state);edit=bad['content_updates'][0]
            if mode=='partial':edit['old_str']='Peito'
            if mode=='missing':edit['old_str']='missing'
            if mode=='multiple':current['body']+='\n\n'+edit['old_str']
            if mode=='notes':edit['new_str']='| Face 1 | DTF | deleted note |'
            if mode=='block':edit['new_str']='| Face 1 | <toggle>hidden</toggle> | note |'
            with self.subTest(mode=mode),self.assertRaises(ValueError):native_rows.inspect(current,bad)
    def test_xml_row_styles_and_actual_column_toggle_case(self):
        body='<columns><column ratio="50"><toggle>New\n\n<table header-row="true"><tr><td>Face</td><td>Opções</td></tr><tr color="blue"><td color="red">Peito</td><td>DTF A7</td></tr></table>\n</toggle></column><column ratio="50">Old</column></columns>'
        rows=native_rows.spans(body);self.assertEqual(len(rows),1)
        payload={'command':'update_content','page_id':r.PAGES['429'],'content_updates':[{'old_str':rows[0][1],'new_str':rows[0][1].replace('DTF A7','DTF A4'),'replace_all_matches':False}]}
        self.assertTrue(native_rows.inspect({'body':body},payload)['eligible'])
        after=body.replace(payload['content_updates'][0]['old_str'],payload['content_updates'][0]['new_str'])
        self.assertTrue(native_rows.saved(body,after,payload));self.assertIn('color="red"',after)
    def test_lost_row_and_property_results_reconcile_without_retries(self):
        for index in (1,2):
            connector=self.connector();connector.lost_at=index;session=self.session(name=str(index))
            self.assertEqual(drive(session,connector,session.start())['status'],'UNCERTAIN')
            restarted=a.FileSession(session.root,self.bundle,self.approval(),fake=True,reconcile_only=True)
            self.assertEqual(drive(restarted,connector,restarted.event(reconcile=True))['status'],'RECONCILED_STOPPED')
            self.assertEqual(len(connector.writes),index)
    def test_inside_outside_review_and_property_races_prevent_writes(self):
        for name,old,new in [('row','Bordado - Até 240','Bordado humano'),('outside','Fonte e original do Excel','Fonte humana'),('review','Regista o motivo','Human reason'),('property','"Notas":""','"Notas":"Human"')]:
            connector=self.connector();session=self.session(name=name)
            def edit(response):
                text=response['structuredContent']['text'];self.assertIn(old,text);response['structuredContent']['text']=text.replace(old,new);sync(response)
            connector.prewrite_edit=edit
            self.assertEqual(drive(session,connector,session.start())['status'],'STALE');self.assertEqual(connector.writes,[])
    def test_exact_manifest_selection_protected_collections_601_and_group_reuse(self):
        manifest={'group_id':'next-reviewed-group','review_scope':'SYNTHETIC manifest test only','collection':method_targets.WORKING_COPY,'targets':{'999':{'page_id':'00000000000000000000000000000999','category':'TEXTILE'}}}
        method_targets.configure(manifest);self.assertEqual(set(r.PAGES),{'999'})
        for collection in ['collection://434b6705-ae1f-8372-9d2e-070435a4f043','collection://166b6705-ae1f-83da-be92-87f8d804a1a5']:
            with self.assertRaises(ValueError):method_targets.configure({**manifest,'collection':collection})
        manifest['targets']={'601':{'page_id':'00000000000000000000000000000601','mode':'NO_CHANGE'}};method_targets.configure(manifest)
        with self.assertRaises(ValueError):a.validated_payload({'payload':{'command':'update_properties','page_id':r.PAGES['601'],'properties':{'Faces':['Any']}}},r.PAGES['601'],True)
        manifest['targets']['601']['mode']='UPDATE'
        with self.assertRaises(ValueError):method_targets.configure(manifest)
    def test_new_properties_are_not_optional_and_never_partial_for_unknown_choices(self):
        approval=self.approval();approval['approved_operation_ids']=[o['id'] for p in self.bundle['pages'] if p['code']=='429' for o in p['operations']]
        with self.assertRaises(ValueError):a.Session(self.bundle,approval,fake=True)
        page=next(p for p in self.bundle['pages'] if p['code']=='430');state=b.page_state(self.captures['430'])
        with self.assertRaises(ValueError):m.validate_properties(state,{'properties':{'Técnicas':['DTF']}},b.schema_state(self.schema))
    def test_drop_digital_textile_keep_transfer_and_dtf_distinct(self):
        catalog=m.imp_options(ROOT)
        options,questions=m.transform_options(['Transfer Digital - Têxtil - A4','DTF - Até A7 (7,4x10,5cm - BOLSO | MANGA | ESTOJOS)','Transfer - Até 126 cm2 - 1 Cor'],'A6',catalog,'APRON')
        self.assertFalse(any('Transfer Digital' in x for x in options));self.assertTrue(any(x.startswith('DTF - Até A6') for x in options))
        self.assertIn('Transfer - Até 126 cm2 - 1 Cor',options);self.assertTrue(questions)


if __name__=='__main__':unittest.main()
