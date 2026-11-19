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
import batch_cli
import batch_plan as b
import method_targets
import pocket_plan as p
import rendered_layout as r
from test_batch import FakeConnector,drive,sync

DEFAULT=dict(r.PAGES)


def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))


class Connector(FakeConnector):
    def __init__(self,captures,schema):super().__init__(captures,schema);self.home=read('captures/pocket-current/home.json')
    def fetch(self,request,phase):
        if request['id']==b.HOME:self.reads.append((phase,request));return copy.deepcopy(self.home)
        return super().fetch(request,phase)


class PocketTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.work=Path(self.temp.name)
        self.addCleanup(self.restore)
        self.bundle=read('pocket-plans/full.json');self.bundle['synthetic']=True;self.bundle['implementation_sha256']=b.implementation_sha()
        book=self.work/'book';book.write_bytes(b'fake workbook');evidence=self.work/'evidence';evidence.write_bytes(b'fake evidence')
        self.bundle['excel'].update(workbook=str(book),workbook_sha256=hashlib.sha256(book.read_bytes()).hexdigest(),evidence_sha256=hashlib.sha256(evidence.read_bytes()).hexdigest());self.bundle['evidence_path']=str(evidence)
        method_targets.configure(self.bundle['target_manifest'])
        self.captures={code:read('captures/pocket-current/pp'+code+'.json') for code in p.IDS};self.schema=read('captures/final-current/schema.json')
    def restore(self):r.PAGES.clear();r.PAGES.update(DEFAULT)
    def approval(self,codes=('430',)):
        return {'plan_sha256':r.digest(self.bundle),'implementation_sha256':self.bundle['implementation_sha256'],'authorisation':'OFFLINE_FAKE_CONNECTOR_TEST',
                'review_reference':'OFFLINE_POCKET_REVIEW','approved_codes':list(codes),'approved_operation_ids':[o['id'] for page in self.bundle['pages'] if page['code'] in codes for o in page['operations']+page['property_operations']]}
    def session(self,codes=('430',),name='one'):return a.FileSession(self.work/'runs'/name,self.bundle,self.approval(codes),fake=True)
    def connector(self):return Connector(self.captures,self.schema)
    def test_exact_four_targets_shared_pockets_asymmetric_558_and_untouched_content(self):
        for page in self.bundle['pages']:
            _,before=r.body_sections(r.parse(page['source_body']));_,after=r.body_sections(r.parse(page['desired_body']))
            self.assertEqual(before['Old'].raw,after['Old'].raw)
            for loc in page['pocket_locations']:
                rows=[row for table in r.mappings(after)['New'] for row in table[1:] if loc in b.lines(row[0])]
                self.assertEqual(len(rows),1);self.assertIn(p.ONE,b.lines(rows[0][1]));self.assertNotIn(p.TWO,b.lines(rows[0][1]))
            old_table=next(n for n in before['New'].items if n.kind=='table');new_table=next(n for n in after['New'].items if n.kind=='table')
            self.assertEqual([row[2:] for row in old_table.rows],[row[2:] for row in new_table.rows])
            for old,new in zip(old_table.rows[1:],new_table.rows[1:]):
                if not set(b.lines(old[0]))&set(page['pocket_locations']):self.assertEqual(old,new)
                self.assertEqual([x for x in b.lines(old[1]) if x.startswith('DTF')],[x for x in b.lines(new[1]) if x.startswith('DTF')])
            self.assertFalse(page['whole_profile_method_complete'])
        self.assertEqual(self.bundle['pocket_scope']['locations']['558'],['Bolso Esquerdo'])
        self.assertEqual(len(self.bundle['pocket_scope']['locations']['661']),2)
    def test_full_scoped_apply_fake_connector_only_narrow_properties_and_fresh_rules(self):
        codes=tuple(p.IDS);connector=self.connector();session=self.session(codes)
        self.assertEqual(drive(session,connector,session.start())['status'],'COMPLETE');self.assertEqual(len(connector.writes),10)
        self.assertEqual(len([x for x in connector.reads if x[0]=='FETCH_RULES']),10)
        for page in self.bundle['pages']:
            saved=b.page_state(a.capture_response(connector.pages[page['page_id']],page['page_id']))
            self.assertEqual(saved['body'],page['desired_body'])
            for key in page['source_metadata']['properties']:
                if key not in ('Opções de personalização','Técnicas'):self.assertEqual(saved['properties'][key],page['source_metadata']['properties'][key])
        self.assertEqual(len([x for x in connector.writes if x['command']=='update_properties']),3)
    def test_rule_source_change_or_conflicting_view_stops_before_mutation(self):
        for name in ['changed','conflicting']:
            connector=self.connector();session=self.session(name=name)
            connector.home['structuredContent']['text']=connector.home['structuredContent']['text'].replace(p.HEADING,p.HEADING+' CHANGED')
            if name=='changed':sync(connector.home)
            self.assertEqual(drive(session,connector,session.start())['status'],'STALE');self.assertEqual(connector.writes,[])
    def test_lost_row_or_property_result_reconciles_without_retry(self):
        for index in [1,3]:
            connector=self.connector();connector.lost_at=index;session=self.session(name=str(index))
            self.assertEqual(drive(session,connector,session.start())['status'],'UNCERTAIN')
            resumed=a.FileSession(session.root,self.bundle,self.approval(),fake=True,reconcile_only=True)
            self.assertEqual(drive(resumed,connector,resumed.event(reconcile=True))['status'],'RECONCILED_STOPPED');self.assertEqual(len(connector.writes),index)
    def test_own_nonempty_rejection_and_source_change_before_write_abort(self):
        connector=self.connector();session=self.session()
        def edit(response):
            response['structuredContent']['text']=response['structuredContent']['text'].replace('Regista o motivo','Rejeitado por mim: manter notas. Regista o motivo');sync(response)
        connector.prewrite_edit=edit
        self.assertEqual(drive(session,connector,session.start())['status'],'STALE');self.assertEqual(connector.writes,[])
    def test_actual_cli_entry_with_file_events_and_fake_transport(self):
        import contextlib,io
        from unittest.mock import patch
        plan=self.work/'plan.json';approval=self.work/'approval.json';a.atomic(plan,self.bundle);a.atomic(approval,self.approval());constructor=a.FileSession
        def invoke(command,event=None):
            args=['batch_cli.py',command,'--plan',str(plan),'--approval',str(approval),'--approved-plan-sha',r.digest(self.bundle),'--apply']
            if event is not None:
                spool=self.work/('plan.json.event-'+event['nonce']+'.json');a.atomic(spool,event);args+=['--event-file',str(spool)]
            output=io.StringIO()
            with patch.object(sys,'argv',args),patch.object(a,'FileSession',lambda *x,**kw:constructor(*x,**kw,fake=True)),contextlib.redirect_stdout(output):batch_cli.main()
            return json.loads(output.getvalue())
        connector=self.connector();action=invoke('session-start')
        for _ in range(100):
            if action['type']=='FINISH':break
            result=connector.update(action['payload']) if action['type']=='WRITE_PENDING' else connector.fetch(action['payload'],action['type'])
            action=invoke('session-step',{'nonce':action['nonce'],'result':result})
        self.assertEqual(action['status'],'COMPLETE');self.assertEqual(len(connector.writes),3)
    def test_pending_independent_review_is_not_a_fabricated_apply_approval(self):
        approval=self.approval();approval['authorisation']='EXPLICIT_HUMAN_APPROVAL';approval['review_reference']=''
        with self.assertRaises(ValueError):a.Session(self.bundle,approval,fake=False)
    def test_transient_local_journal_lock_retries_only_rename_before_dispatch(self):
        from unittest.mock import patch
        original=Path.replace;calls=[]
        def transient(path,target):
            calls.append(str(target))
            if len(calls)==1:raise PermissionError('Windows destination temporarily held')
            return original(path,target)
        session=self.session()
        with patch.object(Path,'replace',transient):action=session.start()
        self.assertEqual(action['type'],'FETCH_PAGE');self.assertEqual(len(calls),2)
        self.assertEqual(json.loads(session.path.read_text(encoding='utf8'))['nonce'],action['nonce'])


if __name__=='__main__':unittest.main()
