"""Per-PP failure isolation and verified review/error status, using the existing executor."""
import copy
import json
import re
import uuid

import batch_apply as a
import batch_plan as b
import rendered_layout as r

POLICY={'version':1,'success_estado':'Para revisão','failure_estado':'Erro','continue_independent_pages':True}
PENDING={'WRITE_PENDING','VERIFY_PAGE','SUCCESS_WRITE_PENDING','VERIFY_SUCCESS_STATUS','ERROR_WRITE_PENDING','VERIFY_ERROR_STATUS'}


def identity(response,page):
    value=response.get('structuredContent');content=response.get('content',[])
    if response.get('isError') or not isinstance(value,dict) or len(content)!=1 or content[0].get('type')!='text' or json.loads(content[0]['text'])!=value:
        raise ValueError('Status read failed or has conflicting representations')
    text=value.get('text','');parts=re.findall(r'<properties>\s*([\s\S]*?)\s*</properties>',text)
    if len(parts)!=1:raise ValueError('Missing exact status identity properties')
    props=json.loads(parts[0]);tags=re.findall(r'<page\s+url="([^"]+)"',text)
    parents=re.findall(r'<parent-data-source\s+url="([^"]+)"',text)
    if (uuid.UUID(value.get('id','')).hex!=page['page_id'] or props.get('Código PP')!=page['code'] or parents!=[b.COLLECTION]
        or len(tags)!=1 or r.notion_url_id(tags[0])!=page['page_id'] or r.notion_url_id(props.get('url',''))!=page['page_id']
        or r.notion_url_id(value.get('url',''))!=page['page_id'] or not value.get('page_last_edited_at')):
        raise ValueError('Status target is not the exact allowed active Working Copy page')
    return {'page_id':page['page_id'],'properties':props,'text':text,'edited_at':value['page_last_edited_at']}


class PageBatchSession(a.Session):
    def __init__(self,bundle,approval,fake=False,reconcile_only=False):
        if bundle.get('page_failure_isolation')!=POLICY:raise ValueError('Unknown reviewed per-page batch policy')
        import pocket_plan
        if any(code not in pocket_plan.IDS or value.get('page_id')!=pocket_plan.IDS[code] for code,value in bundle['target_manifest']['targets'].items()):
            raise ValueError('Batch target differs from the exact authorised pocket identities')
        super().__init__(bundle,approval,fake,reconcile_only)
        self.initial.update(page_reports={},quarantines={})

    def next_page(self,state):
        for name in ('expected_body','expected_metadata','last_before_body','before_hash','last_state_hash','status_before','status_expected','current_schema','active_error'):
            state.pop(name,None)
        action=super().next_page(state)
        if action['type']=='FINISH':
            status='COMPLETED_WITH_ERRORS' if any(x['outcome']!='SUCCESS' for x in state['page_reports'].values()) else 'COMPLETE'
            state['status']=status;action.update(status=status,pages=state['page_reports'])
        return action

    def fetch(self,state,kind='FETCH_PAGE'):
        page=state['queue'][state['page_index']]['page']
        prior=state.get('preexisting_quarantines',{}).get(page['code'])
        if kind=='FETCH_PAGE' and not state['op_index'] and prior and (prior.get('uncertain') or prior.get('review_reference')==state['review_reference']):
            state['page_reports'][page['code']]={'code':page['code'],'page_id':page['page_id'],'outcome':'UNCERTAIN' if prior.get('uncertain') else 'ERROR','reason':'Prior quarantined work cannot be replayed; reconcile and review a remainder','operation_id':None,'pending_receipts':[prior],'marker':{'outcome':'NOT_RETRIED'}}
            return self.next_page(state)
        return super().fetch(state,kind)

    def stop(self,state,status,reason):
        if state.get('cancel_requested') or state.get('readonly_reconciliation'):return super().stop(state,status,reason)
        if state['phase'] in ('FETCH_RULES','FETCH_SCHEMA') and status=='STALE':raise a.SourceGuardError(reason)
        if status in ('FAILED','BLOCKED','STALE','UNCERTAIN'):return self.fail_page(state,status,reason)
        return super().stop(state,status,reason)

    def fail_page(self,state,status,reason):
        item=state['queue'][state['page_index']];page=item['page'];index=state['op_index']
        op=item['ops'][index] if index<len(item['ops']) else None
        confirmed=[copy.deepcopy(x) for x in state['receipts'] if x['code']==page['code']]
        uncertain=status=='UNCERTAIN' or state['phase'] in PENDING
        outcome='UNCERTAIN' if uncertain else 'PARTIAL' if confirmed else 'ERROR'
        snapshot={name:copy.deepcopy(state.get(name)) for name in ('phase','page_index','op_index','expected_body','expected_metadata','last_before_body','before_hash','last_state_hash')}
        snapshot.update(operation=copy.deepcopy(op),uncertain=uncertain)
        state['quarantines'][page['code']]=snapshot
        state['page_reports'][page['code']]={'code':page['code'],'page_id':page['page_id'],'outcome':outcome,'reason':reason,
            'operation_id':op['id'] if op else None,'original_phase':state['phase'],'confirmed_receipts':confirmed,
            'pending_receipts':[op['id']] if uncertain and op else [],'marker':{'outcome':'NOT_ATTEMPTED'}}
        state['events'].append({'kind':'PAGE_QUARANTINED','code':page['code'],'reason':reason,'outcome':outcome})
        state['active_error']=page['code']
        return self.fetch(state,'FETCH_ERROR_PAGE')

    def finish_error(self,state,outcome,reason=None):
        code=state['active_error'];report=state['page_reports'][code]
        report['marker'].update(outcome=outcome,reason=reason)
        if outcome=='UNCERTAIN':
            state['quarantines'][code]['uncertain']=True
            marker=report['marker'].get('operation_id')
            if marker and marker not in report['pending_receipts']:report['pending_receipts'].append(marker)
            state['quarantines'][code]['marker_pending']={'before':copy.deepcopy(state.get('status_before')),'expected':copy.deepcopy(state.get('status_expected')),'operation_id':marker}
        return self.next_page(state)

    def status_write(self,state,page,op,before,error=False):
        payload=a.validated_payload(op,page['page_id'],True,True)
        state['status_before']=copy.deepcopy(before)
        state['status_expected']=copy.deepcopy(before['properties']);state['status_expected'].update(payload['properties'])
        if error:state['page_reports'][page['code']]['marker'].update(operation_id=op['id'],outcome='PENDING',before_estado=before['properties'].get('Estado'))
        state['events'].append({'kind':'STATUS_INTENT','code':page['code'],'operation':op['id'],'estado':payload['properties']['Estado']})
        action=self.issue(state,'ERROR_WRITE_PENDING' if error else 'SUCCESS_WRITE_PENDING',payload)
        action['type']='WRITE_PENDING'
        return action

    def step(self,state,event):
        if event.get('nonce')!=state.get('nonce') or state['phase']=='STOPPED':raise ValueError('Stale or invalid session event')
        phase=state['phase']
        if phase=='RECONCILE_QUARANTINE':return self.reconcile_read(state,event)
        a.verify_sources(self.bundle,self.fake)
        item=state['queue'][state['page_index']];page=item['page'];op=item['ops'][state['op_index']]
        error_phase=phase in ('FETCH_ERROR_PAGE','FETCH_ERROR_SCHEMA','FETCH_ERROR_PREWRITE','ERROR_WRITE_PENDING','VERIFY_ERROR_STATUS')
        success_phase=phase in ('FETCH_SUCCESS_SCHEMA','FETCH_SUCCESS_PAGE','SUCCESS_WRITE_PENDING','VERIFY_SUCCESS_STATUS') or (phase=='FETCH_PAGE' and op['kind']=='success_status')
        if error_phase:
            try:return self.error_step(state,event,page)
            except (ValueError,KeyError,TypeError,AttributeError,IndexError) as error:return self.finish_error(state,'UNCERTAIN' if phase in ('ERROR_WRITE_PENDING','VERIFY_ERROR_STATUS') else 'LOCAL_ONLY',str(error))
        if success_phase:
            try:return self.success_step(state,event,page,op)
            except (ValueError,KeyError,TypeError,AttributeError,IndexError) as error:return self.fail_page(state,'UNCERTAIN' if phase in ('SUCCESS_WRITE_PENDING','VERIFY_SUCCESS_STATUS') else 'FAILED',str(error))
        try:return super().step(state,event)
        except a.SourceGuardError:raise
        except (ValueError,KeyError,TypeError,AttributeError,IndexError) as error:return self.fail_page(state,'UNCERTAIN' if phase in PENDING else 'FAILED',str(error))

    def success_step(self,state,event,page,op):
        phase=state['phase']
        if event.get('error'):return self.fail_page(state,'UNCERTAIN' if phase in PENDING else 'FAILED','Success status transport/read failed')
        result=event.get('result',{})
        if phase=='FETCH_PAGE':
            current=b.page_state(a.capture_response(result,page['page_id']))
            expected=state.get('last_state_hash',page['source_state_sha256'])
            if current['source_state_sha256']!=expected:return self.fail_page(state,'STALE','Page changed before final review status')
            required={x['id'] for x in state['queue'][state['page_index']]['ops'] if x['kind']!='success_status'}
            confirmed={x.get('operation') for x in state['receipts'] if x['code']==page['code'] and x['status']=='SUCCEEDED'}
            if not required<=confirmed:raise ValueError('Success queue requires every prior saved-state receipt')
            state['last_state_hash']=current['source_state_sha256']
            return self.issue(state,'FETCH_SUCCESS_SCHEMA',{'id':b.COLLECTION,'include_file_urls':False})
        if phase=='FETCH_SUCCESS_SCHEMA':
            schema=b.schema_state(result);a.validate_properties(op['payload'],schema)
            return self.fetch(state,'FETCH_SUCCESS_PAGE')
        if phase=='FETCH_SUCCESS_PAGE':
            current=b.page_state(a.capture_response(result,page['page_id']))
            if current['source_state_sha256']!=state['last_state_hash']:return self.fail_page(state,'STALE','Page changed immediately before success status')
            state['last_before_body']=current['body'];state['expected_metadata']=b.stable_metadata(current);state['expected_metadata']['properties']['Estado']='Para revisão'
            return self.status_write(state,page,op,identity(result,page))
        if phase=='SUCCESS_WRITE_PENDING':
            if result.get('isError'):return self.fail_page(state,'UNCERTAIN','Success status write outcome unconfirmed')
            return self.fetch(state,'VERIFY_SUCCESS_STATUS')
        current=b.page_state(a.capture_response(result,page['page_id']))
        if current['body']!=state['last_before_body'] or b.stable_metadata(current)!=state['expected_metadata']:
            return self.fail_page(state,'UNCERTAIN','Final review status or saved page differs')
        receipt={'code':page['code'],'operation':op['id'],'status':'SUCCEEDED','saved_state_sha256':current['source_state_sha256'],'saved_estado':'Para revisão'}
        state['receipts'].append(receipt)
        state['page_reports'][page['code']]={'code':page['code'],'page_id':page['page_id'],'outcome':'SUCCESS','saved_estado':'Para revisão','saved_state_sha256':current['source_state_sha256'],
            'confirmed_receipts':[copy.deepcopy(x) for x in state['receipts'] if x['code']==page['code']],'pending_receipts':[],
            'readback':{'estado':current['properties']['Estado'],'observed_body_sha256':r.digest(current['body']),'properties_sha256':r.digest(current['properties']),'edited_at':current['page_last_edited_at']}}
        return self.next_page(state)

    def error_step(self,state,event,page):
        phase=state['phase'];report=state['page_reports'][page['code']]
        if event.get('error'):return self.finish_error(state,'UNCERTAIN' if phase in ('ERROR_WRITE_PENDING','VERIFY_ERROR_STATUS') else 'LOCAL_ONLY','Error status transport/read unavailable')
        result=event.get('result',{})
        if phase=='FETCH_ERROR_PAGE':
            state['status_before']=identity(result,page)
            actual=state['status_before']['properties'].get('Estado');original=page['source_metadata']['properties'].get('Estado')
            failed_op=state['quarantines'][page['code']].get('operation') or {}
            allowed={original,'Erro'}|({'Para revisão'} if failed_op.get('kind')=='success_status' else set())
            if actual not in allowed:return self.finish_error(state,'LOCAL_ONLY','Human changed Estado; error marker will not overwrite it')
            return self.issue(state,'FETCH_ERROR_SCHEMA',{'id':b.COLLECTION,'include_file_urls':False})
        if phase=='FETCH_ERROR_SCHEMA':
            schema=b.schema_state(result);a.validate_properties(page['failure_status_operation']['payload'],schema)
            return self.fetch(state,'FETCH_ERROR_PREWRITE')
        if phase=='FETCH_ERROR_PREWRITE':
            current=identity(result,page)
            if current!=state['status_before']:return self.finish_error(state,'LOCAL_ONLY','Page changed before error status; no overwrite')
            if current['properties'].get('Estado')=='Erro':
                report['marker']['saved_identity_sha256']=r.digest(current)
                report['saved_estado']='Erro';return self.finish_error(state,'VERIFIED_NO_OP')
            return self.status_write(state,page,page['failure_status_operation'],current,True)
        if phase=='ERROR_WRITE_PENDING':
            if result.get('isError'):return self.finish_error(state,'UNCERTAIN','Error status write outcome unconfirmed')
            return self.fetch(state,'VERIFY_ERROR_STATUS')
        current=identity(result,page)
        if current['properties']!=state['status_expected']:
            return self.finish_error(state,'UNCERTAIN','Error status saved properties differ')
        # Status-only APIs cannot alter the body; verify every observed body byte separately.
        before_body=re.findall(r'<content>([\s\S]*?)</content>',state['status_before']['text'])
        after_body=re.findall(r'<content>([\s\S]*?)</content>',current['text'])
        if before_body!=after_body:return self.finish_error(state,'UNCERTAIN','Visible body changed during error status')
        report['saved_estado']='Erro';report['marker']['saved_identity_sha256']=r.digest(current)
        report['marker']['readback']={'estado':'Erro','properties_sha256':r.digest(current['properties']),'observed_body_sha256':r.digest(after_body),'edited_at':current['edited_at']}
        return self.finish_error(state,'VERIFIED')

    def continue_batch(self,state):
        if state.get('cancel_requested') or state['phase']=='STOPPED':raise ValueError('Cancelled/completed batch cannot silently resume')
        if state['phase'] in ('ERROR_WRITE_PENDING','VERIFY_ERROR_STATUS') or state.get('active_error'):
            return self.finish_error(state,'UNCERTAIN','Interrupted error marking is not retried')
        return self.fail_page(state,'UNCERTAIN','Interrupted page quarantined; remaining work on this PP is not retried')

    def cancel(self,state):
        if state['phase']=='STOPPED':return {'type':'FINISH','status':state['status'],'pages':state['page_reports']}
        state['cancel_requested']=True
        if state['phase'] in PENDING:
            item=state['queue'][state['page_index']];page=item['page']
            op=page['failure_status_operation'] if state['phase'] in ('ERROR_WRITE_PENDING','VERIFY_ERROR_STATUS') else item['ops'][state['op_index']]
            q=state['quarantines'].setdefault(page['code'],{'phase':state['phase'],'operation':copy.deepcopy(op)})
            q['uncertain']=True;q['cancelled_pending_operation']=copy.deepcopy(op)
            report=state['page_reports'].setdefault(page['code'],{'code':page['code'],'page_id':page['page_id'],'reason':'User cancellation with pending write','pending_receipts':[]})
            report.update(outcome='UNCERTAIN',cancelled=True)
            if op['id'] not in report['pending_receipts']:report['pending_receipts'].append(op['id'])
            self.cancelled_remainder(state)
            return super().stop(state,'UNCERTAIN','Cancelled; pending page remains quarantined')
        if state['page_index']<len(state['queue']):
            page=state['queue'][state['page_index']]['page'];receipts=[x for x in state['receipts'] if x['code']==page['code']]
            state['page_reports'].setdefault(page['code'],{'code':page['code'],'page_id':page['page_id'],'outcome':'PARTIAL' if receipts else 'CANCELLED','reason':'User cancelled before next mutation','confirmed_receipts':receipts,'pending_receipts':[]})
        self.cancelled_remainder(state)
        return super().stop(state,'CANCELLED','User cancelled; no further pages or status writes')

    def cancelled_remainder(self,state):
        for item in state['queue']:
            page=item['page']
            state['page_reports'].setdefault(page['code'],{'code':page['code'],'page_id':page['page_id'],'outcome':'NOT_ATTEMPTED','reason':'User cancelled batch','pending_receipts':[]})

    def reconcile(self,state,code=None):
        if not code:raise ValueError('Choose the quarantined PP explicitly; reconciliation never resumes work')
        if code not in state.get('quarantines',{}):raise ValueError('PP has no quarantined outcome in this run')
        page=next(x['page'] for x in state['queue'] if x['page']['code']==code)
        state['reconcile_code']=code;state['readonly_reconciliation']=True
        return self.issue(state,'RECONCILE_QUARANTINE',{'id':page['page_id'],'include_file_urls':False,'include_discussions':False})

    def reconcile_read(self,state,event):
        code=state['reconcile_code'];q=state['quarantines'][code];page=next(x['page'] for x in state['queue'] if x['page']['code']==code)
        status='UNCERTAIN'
        if not event.get('error'):
            try:
                current=b.page_state(a.capture_response(event.get('result',{}),page['page_id']))
                body=current['body'];expected=q.get('expected_body');before=q.get('last_before_body');op=q.get('operation')
                observed=b.stable_metadata(current);wanted=copy.deepcopy(q.get('expected_metadata'))
                if wanted:
                    observed['properties'].pop('Estado',None);wanted['properties'].pop('Estado',None)
                if op and op['kind']=='body':
                    import native_rows
                    status='RECONCILED_STOPPED' if before is not None and native_rows.saved(before,body,op['payload']) and observed==wanted else 'NOT_APPLIED_CONFIRMED' if body==before and observed==wanted else 'RECONCILIATION_CONFLICT'
                elif body==before and current['properties'].get('Estado')=='Erro' and observed==wanted:status='RECONCILED_STOPPED'
            except (ValueError,KeyError,TypeError,AttributeError,IndexError):pass
        if status in ('RECONCILED_STOPPED','NOT_APPLIED_CONFIRMED'):
            pending=q.get('marker_pending')
            marker_resolved=not pending or current['properties']==pending.get('expected') or current['properties']==(pending.get('before') or {}).get('properties')
            if marker_resolved:q['uncertain']=False;q['resolution_state_sha256']=current['source_state_sha256']
            else:status='UNCERTAIN'
        q['resolution']=status
        # The barrier is retained; confirmed reads still require a new review before another run.
        q['reconciled_read_only']=True
        state['phase']='STOPPED';state['readonly_reconciliation']=False
        return {'type':'FINISH','status':status,'pages':state['page_reports']}
