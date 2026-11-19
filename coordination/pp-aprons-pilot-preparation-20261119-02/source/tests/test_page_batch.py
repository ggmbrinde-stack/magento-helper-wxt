import copy
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
import batch_apply as a
import batch_plan as b
import method_targets
import page_batch
import rendered_layout as r
from test_pocket import Connector,read
from test_batch import drive,sync

DEFAULT=dict(r.PAGES)


def schema_with_error(response):
    response=copy.deepcopy(response);schema=b.schema_state(response)
    if 'Erro' not in {x['name'] for x in schema['schema']['Estado']['options']}:schema['schema']['Estado']['options'].append({'name':'Erro','color':'red'})
    response['structuredContent']['text']=re.sub(r'<data-source-state>\s*[\s\S]*?\s*</data-source-state>',lambda _: '<data-source-state>'+json.dumps(schema,ensure_ascii=False)+'</data-source-state>',response['structuredContent']['text'])
    sync(response);return response


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.work=Path(self.temp.name)
        self.addCleanup(self.restore)
        self.bundle=read('batch-plans/full.json');self.bundle['synthetic']=True;self.bundle['implementation_sha256']=b.implementation_sha()
        book=self.work/'book';book.write_bytes(b'fake workbook');evidence=self.work/'evidence';evidence.write_bytes(b'fake evidence')
        self.bundle['excel'].update(workbook=str(book),workbook_sha256=hashlib.sha256(book.read_bytes()).hexdigest(),evidence_sha256=hashlib.sha256(evidence.read_bytes()).hexdigest());self.bundle['evidence_path']=str(evidence)
        self.schema=schema_with_error(read('captures/batch-current/schema.json'));self.bundle['schema_state_sha256']=r.digest(b.schema_state(self.schema))
        method_targets.configure(self.bundle['target_manifest']);self.captures={code:read('captures/batch-current/pp'+code+'.json') for code in r.PAGES}
    def restore(self):r.PAGES.clear();r.PAGES.update(DEFAULT)
    def approval(self,codes=('430','558')):
        return {'plan_sha256':r.digest(self.bundle),'implementation_sha256':self.bundle['implementation_sha256'],'authorisation':'OFFLINE_FAKE_CONNECTOR_TEST','review_reference':'OFFLINE_BATCH_REVIEW','approved_codes':list(codes),
                'approved_operation_ids':[op['id'] for p in self.bundle['pages'] if p['code'] in codes for op in p['operations']+p['property_operations']+[p['completion_status_operation'],p['failure_status_operation']]]}
    def session(self,codes=('430','558'),name='one'):return a.FileSession(self.work/'runs'/name,self.bundle,self.approval(codes),fake=True)
    def connector(self):
        connector=Connector(self.captures,self.schema);connector.home=read('captures/batch-current/home.json');return connector
    def test_success_status_only_after_verified_body_and_properties(self):
        connector=self.connector();session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETE')
        for code in ['430','558']:
            writes=[x for x in connector.writes if x['page_id']==r.PAGES[code]]
            self.assertEqual(writes[-1]['properties'],{'Estado':'Para revisão'})
            self.assertEqual(result['pages'][code]['outcome'],'SUCCESS');self.assertEqual(result['pages'][code]['saved_estado'],'Para revisão')
        journal=json.loads(session.path.read_text(encoding='utf8'));self.assertEqual(len(journal['receipts']),7)
    def test_first_pp_failure_marks_error_and_next_succeeds(self):
        connector=self.connector();connector.reject_at=1;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETED_WITH_ERRORS');self.assertEqual(result['pages']['430']['saved_estado'],'Erro')
        self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
        first=[x for x in connector.writes if x['page_id']==r.PAGES['430']]
        self.assertEqual(len(first),2);self.assertEqual(first[-1]['properties'],{'Estado':'Erro'})
        self.assertTrue(result['pages']['430']['pending_receipts']);self.assertTrue((session.root/'pages/PP430.json').exists())
    def test_lost_content_never_retried_quarantine_does_not_block_next(self):
        connector=self.connector();connector.lost_at=1;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETED_WITH_ERRORS');self.assertEqual(result['pages']['430']['outcome'],'UNCERTAIN');self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
        self.assertEqual(len([x for x in connector.writes if x['command']=='update_content' and x['page_id']==r.PAGES['430']]),1)
        self.assertFalse(session.fence.exists());self.assertTrue((session.quarantine_dir/(r.PAGES['430']+'.json')).exists())
    def test_error_status_failure_keeps_local_reason_then_next(self):
        connector=self.connector();connector.reject_at=1;update=connector.update
        def fail_error(payload):
            if payload.get('properties')=={'Estado':'Erro'}:connector.writes.append(payload);raise TimeoutError('fake lost error-status result')
            return update(payload)
        connector.update=fail_error;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETED_WITH_ERRORS');self.assertEqual(result['pages']['430']['marker']['outcome'],'UNCERTAIN');self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
        self.assertEqual(sum(x.get('properties')=={'Estado':'Erro'} for x in connector.writes),1)
        self.assertIn('430-error-status',result['pages']['430']['pending_receipts'])
    def test_absent_error_option_is_not_created_and_local_report_continues(self):
        self.schema=read('captures/batch-current/schema.json');schema=b.schema_state(self.schema);schema['schema']['Estado']['options']=[x for x in schema['schema']['Estado']['options'] if x['name']!='Erro']
        self.schema['structuredContent']['text']=re.sub(r'<data-source-state>\s*[\s\S]*?\s*</data-source-state>',lambda _: '<data-source-state>'+json.dumps(schema,ensure_ascii=False)+'</data-source-state>',self.schema['structuredContent']['text']);sync(self.schema);self.bundle['schema_state_sha256']=r.digest(schema)
        connector=self.connector();connector.reject_at=1;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['pages']['430']['marker']['outcome'],'LOCAL_ONLY');self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
        self.assertFalse(any(x.get('properties')=={'Estado':'Erro'} for x in connector.writes))
    def test_partial_failure_preserves_first_receipt_skips_remaining_current_pp(self):
        connector=self.connector();fetch=connector.fetch
        def edit_second(request,phase):
            if request['id']==r.PAGES['430'] and phase=='FETCH_PREWRITE' and len([x for x in connector.writes if x['page_id']==r.PAGES['430']])==1:
                value=connector.pages[r.PAGES['430']];value['structuredContent']['text']=value['structuredContent']['text'].replace('Regista o motivo','Human reason. Regista o motivo');sync(value)
            return fetch(request,phase)
        connector.fetch=edit_second;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['pages']['430']['outcome'],'PARTIAL');self.assertEqual(len(result['pages']['430']['confirmed_receipts']),1);self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
        self.assertEqual(len([x for x in connector.writes if x['command']=='update_content' and x['page_id']==r.PAGES['430']]),1)
    def test_wrong_error_identity_never_marks_protected_target_and_next_runs(self):
        connector=self.connector();page=connector.pages[r.PAGES['430']]
        page['structuredContent']['text']=page['structuredContent']['text'].replace(b.COLLECTION,'collection://434b6705-ae1f-8372-9d2e-070435a4f043');sync(page)
        session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['pages']['430']['marker']['outcome'],'LOCAL_ONLY');self.assertFalse(any(x['page_id']==r.PAGES['430'] for x in connector.writes));self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
    def test_restart_pending_page_is_not_replayed_and_continues_other_pp(self):
        connector=self.connector();session=self.session();action=session.start()
        while action['type']!='WRITE_PENDING':action=session.event({'nonce':action['nonce'],'result':connector.fetch(action['payload'],action['type'])})
        connector.update(action['payload'])
        with self.assertRaises(ValueError):session.start()
        resumed=a.FileSession(session.root,self.bundle,self.approval(),fake=True)
        result=drive(resumed,connector,resumed.event(continue_batch=True))
        self.assertEqual(result['status'],'COMPLETED_WITH_ERRORS');self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
        self.assertEqual(len([x for x in connector.writes if x['command']=='update_content' and x['page_id']==r.PAGES['430']]),1)
    def test_success_status_uncertainty_never_counts_success_and_next_runs(self):
        connector=self.connector();connector.lost_at=4;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['pages']['430']['outcome'],'UNCERTAIN');self.assertEqual(result['pages']['430']['saved_estado'],'Erro');self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
        self.assertEqual(sum(x.get('properties')=={'Estado':'Para revisão'} and x['page_id']==r.PAGES['430'] for x in connector.writes),1)
    def test_cancellation_never_starts_error_mark_or_next_pp(self):
        connector=self.connector();session=self.session();action=session.start()
        while action['type']!='WRITE_PENDING':action=session.event({'nonce':action['nonce'],'result':connector.fetch(action['payload'],action['type'])})
        result=session.event(cancel=True);self.assertEqual(result['status'],'UNCERTAIN');self.assertEqual(connector.writes,[]);self.assertFalse(session.fence.exists())
        with self.assertRaises(ValueError):session.event(continue_batch=True)
    def test_new_run_skips_quarantined_pp_but_allows_different_selected_pp(self):
        connector=self.connector();connector.lost_at=1;session=self.session();drive(session,connector,session.start());before=len(connector.writes)
        other=self.session(('661',),name='other');result=drive(other,connector,other.start())
        self.assertEqual(result['status'],'COMPLETE');self.assertEqual(result['pages']['661']['outcome'],'SUCCESS')
        self.assertFalse(any(x['page_id']==r.PAGES['430'] for x in connector.writes[before:]))
    def test_all_selected_pages_quarantined_finishes_without_holding_global_fence(self):
        connector=self.connector();connector.lost_at=1;session=self.session();drive(session,connector,session.start())
        skipped=self.session(('430',),name='quarantined-only');result=skipped.start()
        self.assertEqual(result['status'],'COMPLETED_WITH_ERRORS');self.assertFalse(skipped.fence.exists());self.assertTrue(Path(result['report_path']).exists())
        other=self.session(('661',),name='independent');self.assertEqual(drive(other,connector,other.start())['status'],'COMPLETE')
    def test_global_hash_scope_and_status_payload_guards_remain_refused(self):
        approval=self.approval();approval['plan_sha256']='0'*64
        with self.assertRaises(ValueError):a.FileSession(self.work/'bad',self.bundle,approval,fake=True)
        payload={'payload':{'command':'update_properties','page_id':r.PAGES['430'],'properties':{'Estado':'Validado'}}}
        with self.assertRaises(ValueError):a.validated_payload(payload,r.PAGES['430'],True,True)
        self.bundle['target_manifest']['collection']='collection://166b6705-ae1f-83da-be92-87f8d804a1a5';self.bundle['target_manifest_sha256']=r.digest(self.bundle['target_manifest'])
        with self.assertRaises(ValueError):a.FileSession(self.work/'protected',self.bundle,self.approval(),fake=True)
    def test_malformed_first_page_response_is_local_error_and_next_runs(self):
        connector=self.connector();fetch=connector.fetch
        def malformed(request,phase):
            if request['id']==r.PAGES['430'] and phase=='FETCH_PAGE':return {'isError':True,'structuredContent':None,'content':[]}
            return fetch(request,phase)
        connector.fetch=malformed;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETED_WITH_ERRORS');self.assertEqual(result['pages']['430']['outcome'],'ERROR');self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
    def test_explicit_negative_saved_read_stops_current_content_but_next_runs(self):
        connector=self.connector();fetch=connector.fetch
        def truncated(request,phase):
            result=fetch(request,phase)
            if request['id']==r.PAGES['430'] and phase=='VERIFY_PAGE':result['structuredContent']['truncated']=True;sync(result)
            return result
        connector.fetch=truncated;session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['pages']['430']['outcome'],'UNCERTAIN');self.assertEqual(result['pages']['558']['outcome'],'SUCCESS')
        self.assertEqual(len([x for x in connector.writes if x['page_id']==r.PAGES['430'] and x['command']=='update_content']),1)
        self.assertFalse(any(x.get('properties')=={'Estado':'Para revisão'} and x['page_id']==r.PAGES['430'] for x in connector.writes))
    def test_readonly_reconciliation_records_resolution_without_retry_and_keeps_barrier(self):
        connector=self.connector();connector.lost_at=1;session=self.session();drive(session,connector,session.start());before=len(connector.writes)
        resumed=a.FileSession(session.root,self.bundle,self.approval(),fake=True,reconcile_only=True)
        result=drive(resumed,connector,resumed.event(reconcile=True,reconcile_code='430'))
        self.assertEqual(result['status'],'RECONCILED_STOPPED');self.assertEqual(len(connector.writes),before)
        barrier=json.loads((session.quarantine_dir/(r.PAGES['430']+'.json')).read_text(encoding='utf8'))
        self.assertFalse(barrier['uncertain']);self.assertEqual(barrier['resolution'],'RECONCILED_STOPPED')
        other=self.session(name='same-review');result=drive(other,connector,other.start());self.assertNotEqual(result['pages']['430']['outcome'],'SUCCESS')
    def test_actual_cli_batch_entry_runs_success_and_error_status_with_fake_transport(self):
        import contextlib,io
        from unittest.mock import patch
        plan=self.work/'batch.json';approval=self.work/'approval.json';a.atomic(plan,self.bundle);a.atomic(approval,self.approval());constructor=a.FileSession
        def invoke(command,event=None):
            args=['batch_cli.py',command,'--plan',str(plan),'--approval',str(approval),'--approved-plan-sha',r.digest(self.bundle),'--apply']
            if event is not None:
                path=self.work/('batch.json.event-'+event['nonce']+'.json');a.atomic(path,event);args+=['--event-file',str(path)]
            output=io.StringIO()
            import batch_cli
            with patch.object(sys,'argv',args),patch.object(a,'FileSession',lambda *x,**kw:constructor(*x,**kw,fake=True)),contextlib.redirect_stdout(output):batch_cli.main()
            return json.loads(output.getvalue())
        connector=self.connector();connector.lost_at=1;action=invoke('session-start')
        for _ in range(150):
            if action['type']=='FINISH':break
            try:result=connector.update(action['payload']) if action['type']=='WRITE_PENDING' else connector.fetch(action['payload'],action['type']);event={'nonce':action['nonce'],'result':result}
            except TimeoutError:event={'nonce':action['nonce'],'error':'fake lost outcome'}
            action=invoke('session-step',event)
        self.assertEqual(action['status'],'COMPLETED_WITH_ERRORS');self.assertEqual(action['pages']['558']['saved_estado'],'Para revisão');self.assertTrue(Path(action['report_path']).exists())


if __name__=='__main__':unittest.main()
