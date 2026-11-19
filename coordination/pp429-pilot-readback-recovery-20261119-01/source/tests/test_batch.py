import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import batch_plan as b
import batch_apply as a
import batch_cli
import rendered_layout as r
import excel_proof


def load(name):return json.loads((ROOT/'captures/current'/name).read_text(encoding='utf-8'))


def sync(response):
    response['content'][0]['text']=json.dumps(response['structuredContent'],ensure_ascii=False)
    return response


EMPTY={'structuredContent':{'suggested_edits_status':'available','text':'<discussions shown-count="0" total-count="0" />'},'isError':False}


def complete(capture):
    capture=copy.deepcopy(capture);capture['capture']['synthetic']=True
    capture['response']['structuredContent'].update(truncated=False,unknown_block_count=0,unknown_block_ids=[])
    sync(capture['response']);return capture


class FakeConnector:
    def __init__(self,captures,schema):
        self.pages={r.PAGES[code]:copy.deepcopy(cap['response']) for code,cap in captures.items()}
        self.schema=schema;self.writes=[];self.reads=[];self.comments=EMPTY
        self.fail_at=None;self.lost_at=None;self.reject_at=None;self.prewrite_edit=None;self.clock=0
    def fetch(self,request,phase):
        self.reads.append((phase,request))
        if request.get('id')==b.COLLECTION:return copy.deepcopy(self.schema)
        if self.prewrite_edit and phase=='FETCH_PREWRITE':
            edit=self.prewrite_edit;self.prewrite_edit=None;edit(self.pages[request['id']])
        return copy.deepcopy(self.pages[request['id']])
    def update(self,payload):
        self.writes.append(copy.deepcopy(payload));index=len(self.writes)
        if self.fail_at==index:raise TimeoutError('fake lost outcome before any write')
        if self.reject_at==index:return {'isError':True}
        page=self.pages[payload['page_id']];state=b.page_state(a.capture_response(page,payload['page_id']))
        body,metadata=a.apply_model(state['body'],b.stable_metadata(state),payload)
        value=page['structuredContent'];value['text']=value['text'].replace(state['body'],body,1)
        if payload['command']=='update_properties':
            import re
            old=re.search(r'<properties>\s*([\s\S]*?)\s*</properties>',value['text'])[1]
            value['text']=value['text'].replace(old,json.dumps(metadata['properties'],ensure_ascii=False),1)
        self.clock+=1;value['page_last_edited_at']='2026-11-18T12:00:'+str(self.clock).zfill(2)+'Z'
        sync(page)
        if self.lost_at==index:raise TimeoutError('fake write applied but response lost')
        return {'isError':False,'warnings':['fake warning preserved for saved-state verification']}


def drive(session,connector,action):
    for _ in range(300):
        if action['type']=='FINISH':return action
        try:
            if action['type']=='WRITE_PENDING':result=connector.update(action['payload'])
            elif action['type']=='FETCH_COMMENTS':result=copy.deepcopy(connector.comments)
            else:result=connector.fetch(action['payload'],action['type'])
            event={'nonce':action['nonce'],'result':result}
        except TimeoutError:event={'nonce':action['nonce'],'error':'fake uncertain transport'}
        action=session.event(event)
    raise AssertionError('Bounded session did not finish')


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.work=Path(self.temp.name)
        self.captures={code:complete(load('pp'+code+'.json')) for code in r.PAGES}
        self.proof=copy.deepcopy(load('excel-proof.json'))
        book=self.work/'workbook.fixture';book.write_bytes(b'offline fake workbook, never live')
        evidence=self.work/'evidence.json';evidence.write_text('{}',encoding='utf-8')
        self.proof.update(workbook=str(book),workbook_sha256=a.hashlib.sha256(book.read_bytes()).hexdigest(),evidence_sha256=a.hashlib.sha256(evidence.read_bytes()).hexdigest())
        self.schema_response=load('schema.json');schema=b.schema_state(self.schema_response);template=b.page_state(self.captures['428'])
        pages=[]
        for code in r.PAGES:
            page=b.prepare_page(self.captures[code],EMPTY,self.proof,template,schema);page['property_operations']=[]
            for i,p in enumerate(page['property_proposals'],1):
                if p['resolved']:page['property_operations'].append({'id':code+'-property-'+str(i),'kind':'properties','eligible':True,'payload':{'command':'update_properties','page_id':page['page_id'],'properties':{p['property']:p['after']}}})
            pages.append(page)
        self.bundle={'synthetic':True,'excel':self.proof,'evidence_path':str(evidence),'pages':pages,
                     'schema_state_sha256':r.digest(schema),'collection':b.COLLECTION,'implementation_sha256':b.implementation_sha()}
    def approval(self,codes=('633',),properties=False):
        ops=[o['id'] for p in self.bundle['pages'] if p['code'] in codes for o in p['operations']+(p['property_operations'] if properties else [])]
        return {'plan_sha256':r.digest(self.bundle),'implementation_sha256':self.bundle['implementation_sha256'],
                'authorisation':'OFFLINE_FAKE_CONNECTOR_TEST','review_reference':'OFFLINE_FAKE_REVIEW',
                'approved_codes':list(codes),'approved_operation_ids':ops}
    def session(self,codes=('633',),properties=False):return a.FileSession(self.work/'runs'/'one',self.bundle,self.approval(codes,properties),fake=True)
    def connector(self):return FakeConnector(self.captures,self.schema_response)
    def test_excel_pp633_three_plus_two_and_all_shared_box_hat_groups(self):
        proof=load('excel-proof.json')
        for code,counts in [('633',[3,2]),('430',[6,2]),('661',[7,2]),('662',[6,2,8]),('786',[2]),('467',[4,2,3]),('840',[4,2,3])]:
            self.assertEqual([len(g['options']) for g in proof['records'][code]['groups']],counts)
        self.assertEqual(len(proof['records']['786']['groups'][0]['locations']),3)
        self.assertFalse(proof['blank_cells']['P55'].strip())
        page=next(p for p in self.bundle['pages'] if p['code']=='633')
        self.assertTrue(page['checks']['old_repaired'])
        _,sides=r.body_sections(r.parse(page['desired_body']))
        rows=r.mappings(sides)['Old'][0][1:]
        self.assertEqual([len(b.lines(row[1])) for row in rows],[3,2])
    def test_all_corrected_pages_idempotent_and_own_new_review_media_preserved(self):
        for page in self.bundle['pages']:
            body=page['source_body'];meta=page['source_metadata']
            for op in page['operations']:body,meta=a.apply_model(body,meta,op['payload'])
            self.assertEqual(body,page['desired_body']);self.assertEqual(meta,page['source_metadata'])
            if page['code']=='661':self.assertNotIn('<image ',body)
        page=next(p for p in self.bundle['pages'] if p['code']=='633')
        tech=next(n for n in r.parse(page['desired_body']) if n.kind=='toggle' and n.title==r.TECH)
        notes=[(n.title,r.join(n.items[1:])) for n in tech.items[1:] if n.kind=='toggle']
        self.assertEqual(len(notes),len(set(notes)))
        self.assertEqual([title for title,_ in notes],['New: Peito','New: Bolso'])
        self.assertIn('validar Non-Woven',notes[0][1]);self.assertIn('validar bolso',notes[1][1])
        self.assertIn('Original preservado',page['desired_body'])
    def test_operational_fake_connector_body_and_separately_approved_properties(self):
        connector=self.connector();session=self.session(properties=True)
        result=drive(session,connector,session.start());self.assertEqual(result['status'],'COMPLETE')
        self.assertTrue(any(x['command']=='update_properties' for x in connector.writes))
        journal=json.loads(session.path.read_text(encoding='utf-8'))
        self.assertTrue(all(x['status']=='SUCCEEDED' for x in journal['receipts']))
        self.assertTrue(any(e.get('warnings') for e in journal['events']))
        self.assertFalse(session.fence.exists())
        for payload in connector.writes:
            self.assertNotIn('allow_deleting_content',payload)
            if 'content_updates' in payload:self.assertIs(payload['content_updates'][0]['replace_all_matches'],False)
    def test_real_metadata_absence_and_unavailable_comments_cannot_be_overridden(self):
        source=load('pp633.json');template=b.page_state(load('pp428.json'));schema=b.schema_state(self.schema_response)
        page=b.prepare_page(source,load('comments633.json'),self.proof,template,schema)
        self.assertEqual(page['status'],'BLOCKED');self.assertTrue(all(not o['eligible'] for o in page['operations']))
        connector=self.connector();connector.comments=load('comments633.json');session=self.session()
        self.assertEqual(drive(session,connector,session.start())['status'],'BLOCKED');self.assertEqual(connector.writes,[])
    def test_noop_pp428_preserves_its_no_reason_and_never_updates(self):
        connector=self.connector();session=self.session(('428',));result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETE');self.assertEqual(connector.writes,[])
        self.assertIn('Falta transfer 1 C 126cm',b.page_state(a.capture_response(connector.pages[r.PAGES['428']],r.PAGES['428']))['body'])
    def test_stale_review_or_property_edit_aborts_immediate_prewrite(self):
        for mode in ['review','property']:
            with self.subTest(mode=mode):
                connector=self.connector();session=a.FileSession(self.work/'runs'/mode,self.bundle,self.approval(),fake=True)
                def edit(response):
                    value=response['structuredContent']
                    if mode=='review':value['text']=value['text'].replace('Regista o motivo','Human changed the reason')
                    else:value['text']=value['text'].replace('"Notas":""','"Notas":"Human changed property"')
                    sync(response)
                connector.prewrite_edit=edit
                self.assertEqual(drive(session,connector,session.start())['status'],'STALE');self.assertEqual(connector.writes,[])
    def test_uncertain_applied_write_restart_reconciles_without_retry(self):
        connector=self.connector();connector.lost_at=1;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'UNCERTAIN');self.assertEqual(len(connector.writes),1)
        with self.assertRaises(ValueError):session.start()
        restarted=a.FileSession(session.root,self.bundle,self.approval(),fake=True,reconcile_only=True)
        result=drive(restarted,connector,restarted.event(reconcile=True))
        self.assertEqual(result['status'],'RECONCILED_STOPPED');self.assertEqual(len(connector.writes),1)
    def test_partial_failure_and_not_applied_reconciliation_report_honestly(self):
        connector=self.connector();connector.fail_at=2;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'UNCERTAIN')
        journal=json.loads(session.path.read_text(encoding='utf-8'));self.assertEqual(len(journal['receipts']),1)
        restarted=a.FileSession(session.root,self.bundle,self.approval(),fake=True,reconcile_only=True)
        self.assertEqual(drive(restarted,connector,restarted.event(reconcile=True))['status'],'NOT_APPLIED_CONFIRMED')
        self.assertEqual(len(connector.writes),2)
    def test_recovery_conflict_never_restores_over_intervening_human_changes(self):
        connector=self.connector();connector.lost_at=1;session=self.session();drive(session,connector,session.start())
        page=connector.pages[r.PAGES['633']];page['structuredContent']['text']=page['structuredContent']['text'].replace('Regista o motivo','Human intervened');sync(page)
        restarted=a.FileSession(session.root,self.bundle,self.approval(),fake=True,reconcile_only=True)
        self.assertEqual(drive(restarted,connector,restarted.event(reconcile=True))['status'],'RECONCILIATION_CONFLICT')
        self.assertEqual(len(connector.writes),1);self.assertTrue(restarted.fence.exists())
    def test_allowlist_approval_workbook_and_schema_option_guards(self):
        approval=self.approval();approval['plan_sha256']='0'*64
        with self.assertRaises(ValueError):a.Session(self.bundle,approval,fake=True)
        with self.assertRaises(ValueError):a.Session(self.bundle,self.approval(),fake=False)
        Path(self.proof['workbook']).write_bytes(b'changed')
        with self.assertRaises(ValueError):a.Session(self.bundle,self.approval(),fake=True)
        with self.assertRaises(ValueError):a.validate_properties({'properties':{'Faces':['Invented']}},b.schema_state(self.schema_response))
        with self.assertRaises(ValueError):a.validated_payload({'payload':{'command':'replace_content','page_id':r.PAGES['633'],'content':'bad'}},r.PAGES['633'])
    def test_unique_anchor_and_unsafe_boundaries_are_refused(self):
        op={'payload':{'command':'update_content','page_id':r.PAGES['633'],'content_updates':[{'old_str':'<toggle>unclosed','new_str':'','replace_all_matches':False}]}}
        with self.assertRaises(r.Refused):a.validated_payload(op,r.PAGES['633'])
        with self.assertRaises(ValueError):a.apply_model('same same',{}, {'command':'update_content','content_updates':[{'old_str':'same','new_str':'one'}]})
    def test_cli_dry_run_has_no_connector_or_run_mutation(self):
        import subprocess
        plan=self.work/'plan.json';a.atomic(plan,self.bundle)
        before=set(self.work.iterdir())
        result=subprocess.run([sys.executable,'-B',str(ROOT/'batch_cli.py'),'inspect','--plan',str(plan)],capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr);self.assertTrue(json.loads(result.stdout)['dry_run'])
        self.assertEqual(before,set(self.work.iterdir()))

    def test_saved_export_losing_coverage_stops_before_dependent_write(self):
        connector=self.connector();session=self.session();action=session.start()
        while action['type']!='VERIFY_PAGE':
            if action['type']=='WRITE_PENDING':result=connector.update(action['payload'])
            elif action['type']=='FETCH_COMMENTS':result=EMPTY
            else:result=connector.fetch(action['payload'],action['type'])
            action=session.event({'nonce':action['nonce'],'result':result})
        response=connector.fetch(action['payload'],action['type'])
        del response['structuredContent']['truncated'];sync(response)
        result=session.event({'nonce':action['nonce'],'result':response})
        self.assertEqual(result['status'],'UNCERTAIN');self.assertEqual(len(connector.writes),1)

    def test_durable_intent_fence_and_nonce_prevent_duplicate_dispatch(self):
        session=self.session();action=session.start()
        other=a.FileSession(self.work/'runs'/'two',self.bundle,self.approval(),fake=True)
        with self.assertRaises(FileExistsError):other.start()
        with self.assertRaises(ValueError):session.event({'nonce':'wrong','result':{}})
        self.assertEqual(json.loads(session.path.read_text(encoding='utf8'))['nonce'],action['nonce'])
        approval=self.approval();approval['review_reference']='changed'
        changed=a.FileSession(session.root,self.bundle,approval,fake=True)
        with self.assertRaises(ValueError):changed.event({'nonce':action['nonce'],'result':{}})

    def test_cli_apply_entry_with_file_events_and_fake_connector(self):
        import contextlib,io
        from unittest.mock import patch
        plan=self.work/'plan.json';approval=self.work/'approval.json'
        a.atomic(plan,self.bundle);a.atomic(approval,self.approval());constructor=a.FileSession
        def fake_session(*args,**kwargs):return constructor(*args,**kwargs,fake=True)
        def invoke(command,event=None):
            args=['batch_cli.py',command,'--plan',str(plan),'--approval',str(approval),'--approved-plan-sha',r.digest(self.bundle),'--apply']
            if event is not None:
                spool=self.work/('plan.json.event-'+event['nonce']+'.json');a.atomic(spool,event)
                args+=['--event-file',str(spool)]
            output=io.StringIO()
            with patch.object(sys,'argv',args),patch.object(a,'FileSession',fake_session),contextlib.redirect_stdout(output):batch_cli.main()
            return json.loads(output.getvalue())
        connector=self.connector();action=invoke('session-start')
        for _ in range(100):
            if action['type']=='FINISH':break
            if action['type']=='WRITE_PENDING':result=connector.update(action['payload'])
            elif action['type']=='FETCH_COMMENTS':result=EMPTY
            else:
                result=connector.fetch(action['payload'],action['type']);result['padding']='a'*60000
            action=invoke('session-step',{'nonce':action['nonce'],'result':result})
        self.assertEqual(action['status'],'COMPLETE');self.assertEqual(len(connector.writes),5)

    def test_incomplete_or_unknown_comment_envelopes_never_establish_empty(self):
        for xml in ['<other shown-count="0" total-count="0" />','<discussions shown-count="0" total-count="1" />','<discussions shown-count="0" total-count="0" omitted-truncated="true" />']:
            response={'structuredContent':{'suggested_edits_status':'available','text':xml}}
            self.assertFalse(b.comments_proof(response)['empty'])

    def test_conflicting_comment_views_block_the_executor_without_writing(self):
        for reverse in (False,True):
            connector=self.connector()
            structured=EMPTY['structuredContent'];unavailable={'suggested_edits_status':'upgrade_required'}
            first,second=(unavailable,structured) if reverse else (structured,unavailable)
            connector.comments={'structuredContent':first,'content':[{'type':'text','text':json.dumps(second)}]}
            session=a.FileSession(self.work/'runs'/str(reverse),self.bundle,self.approval(),fake=True)
            self.assertEqual(drive(session,connector,session.start())['status'],'BLOCKED')
            self.assertEqual(connector.writes,[])


if __name__=='__main__':unittest.main()
