"""Serial durable session protocol. A session-side bridge supplies the real connector."""
import copy
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import time
import uuid

import batch_plan as b
import rendered_layout as r
import excel_proof
import targeted_section as scoped
import native_rows
import method_plan
import method_targets
import pocket_plan


class SourceGuardError(ValueError):
    pass


def capture_response(response,page_id):
    def scrub(value):
        if isinstance(value,str):
            return re.sub(r'''https?://[^\s"'<>\\]+''',lambda m:m[0].split('?')[0].split('#')[0] if re.search(r'X-Amz-|[?&](signature|token)=',m[0],re.I) else m[0],value)
        if isinstance(value,list):return [scrub(x) for x in value]
        if isinstance(value,dict):return {k:scrub(v) for k,v in value.items()}
        return value
    original_body=re.search(r'<content>([\s\S]*?)</content>',response.get('structuredContent',{}).get('text',''))
    if original_body and re.search(r'https?://[^\s<>]*[?&](?:X-Amz-|signature=|token=)',original_body[1],re.I):
        raise ValueError('Unstable signed body media cannot be changed or persisted')
    return {'capture':{'tool':'mcp__codex_apps__notion_fetch','requested_id':page_id,
                       'received_at_utc':datetime.now(timezone.utc).isoformat(),'redaction':'Signed HTTPS query credentials removed'},
            'response':scrub(response)}


def atomic(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    with temp.open('w',encoding='utf-8',newline='\n') as file:
        json.dump(data,file,ensure_ascii=False,sort_keys=True,indent=2);file.write('\n');file.flush();os.fsync(file.fileno())
    # Windows scanners can briefly hold the destination; retry only this local rename.
    for attempt in range(3):
        try:temp.replace(path);break
        except PermissionError:
            if attempt==2:raise
            time.sleep(0.05)


def verify_sources(bundle,fake=False):
    if bundle.get('native_manifest'):
        import native_evidence
        entry = bundle['native_manifest']
        if native_evidence.file_hash(entry['path']) != entry['sha256']:
            raise SourceGuardError('Native manifest changed')
        manifest, snapshots = native_evidence.read_manifest(entry['path'], bundle['implementation_sha256'])
        if manifest.get('synthetic') and not fake:
            raise SourceGuardError('Synthetic native evidence cannot be applied')
        for page in bundle['pages']:
            if page.get('native_evidence', {}).get('snapshot') != snapshots.get(page['code']):
                raise SourceGuardError('Plan/native manifest snapshot differs')
    proof=bundle['excel']
    if not fake and proof['workbook_sha256']!=excel_proof.SHA:raise SourceGuardError('Unapproved workbook identity')
    for path,expected in [(proof['workbook'],proof['workbook_sha256']),(bundle['evidence_path'],proof['evidence_sha256'])]:
        with Path(path).open('rb') as file:
            if hashlib.file_digest(file,'sha256').hexdigest()!=expected:raise SourceGuardError('Workbook/evidence changed')
    if bundle.get('full_scope'):
        import full_excel
        if full_excel.file_sha(bundle['inventory_path'])!=bundle['inventory_sha256']:
            raise SourceGuardError('Reviewed Working Copy inventory changed')


def validated_payload(op,page_id,method=False,status=False):
    payload=copy.deepcopy(op['payload'])
    if payload.get('page_id')!=page_id or page_id not in r.PAGES.values():raise ValueError('Operation target is outside approval')
    if page_id==r.PAGES.get('601'):raise ValueError('PP601 is protected against every mutation')
    command=payload.get('command')
    if command=='update_content':
        if set(payload)!={'command','page_id','content_updates'} or len(payload['content_updates'])!=1:raise ValueError('Only one exact targeted replacement is allowed')
        edit=payload['content_updates'][0]
        if set(edit)!={'old_str','new_str','replace_all_matches'} or not isinstance(edit['old_str'],str) or not isinstance(edit['new_str'],str) or not edit['old_str'] or edit['replace_all_matches'] is not False:raise ValueError('Unsafe replacement flags')
        if not method:
            r.parse(edit['old_str'])
            r.parse(edit['new_str'])
    elif command=='insert_content':
        if set(payload)!={'command','page_id','position','content'} or payload['position']!={'type':'end'} or not isinstance(payload['content'],str) or not payload['content']:raise ValueError('Only explicit reviewed append is allowed')
        if not method:r.parse(payload['content'])
    elif command=='update_properties':
        allowed=set(b.PROPERTIES)|({'Estado'} if status else set())
        if set(payload)!={'command','page_id','properties'} or not payload['properties'] or set(payload['properties'])-allowed:raise ValueError('Unapproved property operation')
        if status and (set(payload['properties'])!={'Estado'} or payload['properties']['Estado'] not in ('Para revisão','Erro')):raise ValueError('Only approved review/error status is allowed')
    else:raise ValueError('Unsupported/destructive connector command')
    return payload


def validate_properties(payload,schema):
    for name,value in payload['properties'].items():
        definition=schema['schema'].get(name,{})
        if definition.get('readOnly'):raise ValueError('Read-only property cannot be written')
        if name=='Estado':
            if definition.get('type')!='select' or value not in ('Para revisão','Erro') or value not in {x['name'] for x in definition.get('options',[])}:
                raise ValueError('Approved status option is absent or unsupported')
        elif isinstance(value,list):
            if definition.get('type')!='multi_select' or any(not isinstance(x,str) for x in value) or len(value)!=len(set(value)) or set(value)-{o['name'] for o in definition.get('options',[])}:
                raise ValueError('Property write would invent an option or change an unsupported type')
        elif type(value) not in (int,float) or not math.isfinite(value) or value<0 or definition.get('type')!='number':
            raise ValueError('Invalid numeric property proposal')


def apply_model(body,metadata,payload):
    metadata=copy.deepcopy(metadata)
    if payload['command']=='update_content':
        edit=payload['content_updates'][0]
        if body.count(edit['old_str'])!=1:raise ValueError('Exact targeted old text is missing or ambiguous')
        body=body.replace(edit['old_str'],edit['new_str'],1)
    elif payload['command']=='insert_content':body+=payload['content']
    else:metadata['properties'].update(payload['properties'])
    return body,metadata


class Session:
    def __init__(self,bundle,approval,fake=False,reconcile_only=False):
        self.bundle=bundle;self.fake=fake
        self.isolated=bool(bundle.get('page_failure_isolation'))
        validation=bundle.get('validation_policy')
        self.full=isinstance(validation,dict) and validation.get('name')=='PP_FULL_CONVERSION'
        self.method=self.full or isinstance(validation,dict) and validation.get('name')==method_plan.NAME
        if self.method:
            if r.digest(bundle['target_manifest'])!=bundle.get('target_manifest_sha256'):raise ValueError('Reviewed target manifest hash mismatch')
            method_targets.configure(bundle['target_manifest'])
        self.scoped=validation is not None
        if self.full:
            import full_regions
            expected_policy=full_regions.policy()
        else:expected_policy=method_plan.policy() if self.method else scoped.policy()
        if self.scoped and validation!=expected_policy:raise ValueError('Targeted policy/contract changed')
        if bundle.get('version')==5 and not self.scoped:raise ValueError('V5 requires the reviewed targeted policy')
        if approval.get('plan_sha256')!=r.digest(bundle) or approval.get('implementation_sha256')!=bundle['implementation_sha256'] or bundle['implementation_sha256']!=b.implementation_sha():
            raise ValueError('Plan/implementation approval hash mismatch')
        if approval.get('authorisation')!=('OFFLINE_FAKE_CONNECTOR_TEST' if fake else 'EXPLICIT_HUMAN_APPROVAL') or not approval.get('review_reference'):
            raise ValueError('Explicit reviewed-plan authorisation is required')
        if bundle.get('synthetic') and not fake:raise ValueError('Synthetic plans cannot use a live connector')
        codes=approval.get('approved_codes',[])
        if not codes or len(codes)!=len(set(codes)) or set(codes)-set(r.PAGES):raise ValueError('Invalid exact batch selection')
        pages={p['code']:p for p in bundle['pages']}
        if len(pages)!=len(bundle['pages']) or set(pages)!=set(r.PAGES) or any(p['page_id']!=r.PAGES[c] for c,p in pages.items()):
            raise ValueError('Plan does not contain the exact eleven code/page identities')
        allowed=set(approval.get('approved_operation_ids',[]));queue=[];expected=set()
        for code in codes:
            page=pages[code]
            if self.scoped and page.get('validation_policy')!=validation:raise ValueError('Page and plan validation policies differ')
            if page['status']=='BLOCKED':raise ValueError('Page remains blocked: '+code+'; '+'; '.join(page['reasons']))
            ops=copy.deepcopy(page['operations'])
            expected.update(o['id'] for o in ops)
            for op in page.get('property_operations',[]):
                if self.method and op['id'] not in allowed:raise ValueError('Reviewed New and its matching properties must be approved together')
                if op['id'] in allowed:ops.append(copy.deepcopy(op));expected.add(op['id'])
            if self.isolated:
                completion=copy.deepcopy(page['completion_status_operation']);ops.append(completion);expected.add(completion['id'])
                error=page['failure_status_operation'];expected.add(error['id'])
                validated_payload(error,page['page_id'],self.method,True)
            if any(not o.get('eligible') for o in ops):raise ValueError('Operation lacks required region/property evidence')
            for op in ops:
                payload=validated_payload(op,page['page_id'],self.method,self.isolated and op['kind']=='success_status')
                if self.scoped and payload['command'] not in (('update_content','update_properties','insert_content') if self.full else ('update_content','update_properties') if self.method else ('update_content',)):raise ValueError('Targeted contract forbids this command')
            queue.append({'page':copy.deepcopy(page),'ops':ops})
        if allowed!=expected:raise ValueError('Approval must include every selected body operation and only reviewed resolved property operations')
        if not reconcile_only:verify_sources(bundle,fake)
        self.initial={'plan_sha256':r.digest(bundle),'phase':'NEW','page_index':0,'op_index':0,'queue':queue,
                      'approval_sha256':r.digest(approval),'review_reference':approval['review_reference'],'events':[],'receipts':[],'fake':fake,'status':'RUNNING','nonce':None}

    def issue(self,state,kind,payload):
        token=uuid.uuid4().hex;state['nonce']=token;state['phase']=kind
        state['events'].append({'kind':kind,'nonce':token,'page_index':state['page_index'],'op_index':state['op_index']})
        return {'type':kind,'nonce':token,'payload':payload,'plan_sha256':state['plan_sha256']}

    def fetch(self,state,kind='FETCH_PAGE'):
        page=state['queue'][state['page_index']]['page']
        return self.issue(state,kind,{'id':page['page_id'],'include_discussions':True,'include_file_urls':False})

    def next_page(self,state):
        state['page_index']+=1;state['op_index']=0
        if state['page_index']==len(state['queue']):state.update(status='COMPLETE',phase='STOPPED');return {'type':'FINISH','status':'COMPLETE'}
        return self.fetch(state)

    def stop(self,state,status,reason):
        state.update(status=status,phase='STOPPED');state['events'].append({'kind':status,'reason':reason})
        return {'type':'FINISH','status':status,'reason':reason}

    def begin(self,state):return self.fetch(state)

    def step(self,state,event):
        if event.get('nonce')!=state.get('nonce') or state['phase']=='STOPPED':raise ValueError('Stale or invalid session event')
        if state['phase']!='RECONCILE_PAGE':verify_sources(self.bundle,self.fake)
        item=state['queue'][state['page_index']];page=item['page'];phase=state['phase']
        if event.get('error'):
            return self.stop(state,'UNCERTAIN' if phase in ('WRITE_PENDING','VERIFY_PAGE','RECONCILE_PAGE') else 'FAILED', 'Connector failure; no mutation is retried')
        result=event.get('result',{})
        if phase in ('FETCH_PAGE','FETCH_PREWRITE','VERIFY_PAGE','RECONCILE_PAGE'):
            try:current=b.page_state(capture_response(result,page['page_id']))
            except ValueError as error:
                status='UNCERTAIN' if phase in ('VERIFY_PAGE','RECONCILE_PAGE') else 'BLOCKED'
                return self.stop(state,status,str(error))
            if current['code']!=page['code']:return self.stop(state,'STALE','Fresh page identity changed')
            if phase=='FETCH_PAGE':
                expected=state.get('last_state_hash',page['source_state_sha256']) if state['op_index'] else page['source_state_sha256']
                if current['source_state_sha256']!=expected:return self.stop(state,'STALE','Page/review/properties changed since the reviewed state')
                state['expected_body']=current['body'];state['expected_metadata']=b.stable_metadata(current)
                state['before_hash']=b.observed_hash(current);state['last_state_hash']=current['source_state_sha256']
                if not item['ops']:
                    state['receipts'].append({'code':page['code'],'status':'NO_OP'});return self.next_page(state)
                if self.scoped:
                    if self.full or self.method and self.bundle.get('pocket_scope'):
                        return self.issue(state,'FETCH_RULES',{'id':b.HOME,'include_file_urls':False,'include_discussions':False})
                    if self.method and item['ops'][state['op_index']]['kind']=='properties':
                        return self.issue(state,'FETCH_SCHEMA',{'id':b.COLLECTION,'include_file_urls':False})
                    return self.fetch(state,'FETCH_PREWRITE')
                if current['coverage']['state']!='EXPLICIT_COMPLETE_EXPORT' or current['discussion_markers']:
                    return self.stop(state,'BLOCKED','No complete target-region/coverage proof; global absence is not false/zero')
                return self.issue(state,'FETCH_COMMENTS',{'page_id':page['page_id'],'include_resolved':True})
            if phase=='FETCH_PREWRITE':
                if current['source_state_sha256']!=state['last_state_hash'] or (not self.scoped and (current['coverage']['state']!='EXPLICIT_COMPLETE_EXPORT' or current['discussion_markers'])):
                    return self.stop(state,'STALE','Immediate pre-write page/review/property precondition changed')
                if self.scoped:
                    op=item['ops'][state['op_index']]
                    if self.method and op['kind']=='properties':
                        if self.full:
                            import full_conversion
                            full_conversion.validate_properties(current,op['payload'],state['current_schema'])
                        elif self.bundle.get('pocket_scope'):pocket_plan.validate_properties(current,op['payload'],state['current_schema'],self.bundle['pocket_scope']['locations'][page['code']])
                        else:method_plan.validate_properties(current,op['payload'],state['current_schema'])
                    else:
                        if self.full:
                            import full_regions
                            evidence=full_regions.inspect(current,op['payload'],op.get('native_planning_evidence',page.get('bounded_region_evidence')))
                        else:evidence=native_rows.inspect(current,op['payload']) if self.method else scoped.inspect_operation(current,op['payload'])
                        if not evidence['eligible'] or evidence!=op['region_evidence']:
                            return self.stop(state,'BLOCKED','Affected section or its reviewed evidence is not valid')
                    state['last_before_body']=current['body']
                state['expected_body']=current['body'];state['expected_metadata']=b.stable_metadata(current)
                state['before_hash']=b.observed_hash(current)
                return self.write(state,item['ops'][state['op_index']],page)
            if not self.scoped and (current['coverage']['state']!='EXPLICIT_COMPLETE_EXPORT' or current['discussion_markers']):
                return self.stop(state,'UNCERTAIN','Saved-state coverage or discussion preservation is unproved; reconcile before further work')
            after_hash=r.digest({'page_id':page['page_id'],'body':state['expected_body'],'metadata':state['expected_metadata']})
            actual=b.observed_hash(current)
            matched=actual==after_hash
            if self.scoped:
                op=item['ops'][state['op_index']]
                try:
                    if self.method:
                        if self.full:
                            import full_regions
                            matched=current['body']==state['last_before_body'] if op['kind']=='properties' else full_regions.saved(state['last_before_body'],current['body'],op['payload'])
                        else:matched=(current['body']==state['last_before_body'] if op['kind']=='properties' else native_rows.saved(state['last_before_body'],current['body'],op['payload']))
                    else:matched=scoped.saved_result(state['last_before_body'],current['body'],op['payload'])
                    matched=matched and b.stable_metadata(current)==state['expected_metadata']
                except ValueError:matched=False
            if phase=='RECONCILE_PAGE':
                if matched:
                    state['receipts'].append({'code':page['code'],'operation':item['ops'][state['op_index']]['id'],'status':'RECONCILED_SUCCEEDED'})
                    return self.stop(state,'RECONCILED_STOPPED','Write exists; no retry. Prepare/review remaining work separately.')
                if actual==state['before_hash']:return self.stop(state,'NOT_APPLIED_CONFIRMED','Old state confirmed; no automatic retry. Prepare a new reviewed remainder.')
                return self.stop(state,'RECONCILIATION_CONFLICT','Intervening/partial changes require manual review; no rollback')
            if not matched:return self.stop(state,'UNCERTAIN','Saved targeted result or visible outside/protected text/metadata differs; preserve intervening edits')
            state['receipts'].append({'code':page['code'],'operation':item['ops'][state['op_index']]['id'],'status':'SUCCEEDED','saved_state_sha256':current['source_state_sha256']})
            state['op_index']+=1;state['last_state_hash']=current['source_state_sha256']
            if state['op_index']==len(item['ops']):return self.next_page(state)
            return self.fetch(state)
        if phase=='FETCH_RULES':
            try:
                if self.full:
                    import full_conversion
                    full_conversion.verify_rules(result,self.bundle['full_scope']['rules_sha256'])
                else:pocket_plan.verify_source(result,self.bundle['pocket_scope']['source'])
            except ValueError as error:return self.stop(state,'STALE',str(error))
            if item['ops'][state['op_index']]['kind']=='properties':return self.issue(state,'FETCH_SCHEMA',{'id':b.COLLECTION,'include_file_urls':False})
            return self.fetch(state,'FETCH_PREWRITE')
        if phase=='FETCH_COMMENTS':
            proof=b.comments_proof(result)
            if not proof['empty']:return self.stop(state,'BLOCKED',proof['reason'])
            op=item['ops'][state['op_index']]
            if op['kind']=='properties':return self.issue(state,'FETCH_SCHEMA',{'id':b.COLLECTION,'include_file_urls':False})
            return self.fetch(state,'FETCH_PREWRITE')
        if phase=='FETCH_SCHEMA':
            schema=b.schema_state(result)
            if r.digest(schema)!=self.bundle['schema_state_sha256']:return self.stop(state,'STALE','Relevant reviewed data-source schema changed')
            validate_properties(item['ops'][state['op_index']]['payload'],schema)
            state['current_schema']=schema
            return self.fetch(state,'FETCH_PREWRITE')
        if phase=='WRITE_PENDING':
            state['events'].append({'kind':'WRITE_RESULT','isError':bool(result.get('isError')),'warnings':result.get('warnings',result.get('structuredContent',{}).get('warnings') if isinstance(result.get('structuredContent'),dict) else None)})
            if result.get('isError'):return self.stop(state,'UNCERTAIN','Connector reported error; write outcome is unconfirmed')
            return self.fetch(state,'VERIFY_PAGE')
        raise ValueError('Unsupported session phase')

    def write(self,state,op,page):
        payload=validated_payload(op,page['page_id'],self.method)
        state['expected_body'],state['expected_metadata']=apply_model(state['expected_body'],state['expected_metadata'],payload)
        state['events'].append({'kind':'ATTEMPTED','operation':op['id'],'before_hash':state['before_hash']})
        return self.issue(state,'WRITE_PENDING',payload)

    def reconcile(self,state):
        if state['status']!='UNCERTAIN' and state['phase'] not in ('WRITE_PENDING','VERIFY_PAGE'):
            raise ValueError('Only an unresolved write can enter read-only reconciliation')
        state['status']='RECONCILING'
        return self.fetch(state,'RECONCILE_PAGE')

    def cancel(self,state):
        if state['phase'] in ('WRITE_PENDING','VERIFY_PAGE','RECONCILE_PAGE') or state['status'] in ('UNCERTAIN','RECONCILING','RECONCILIATION_CONFLICT'):
            return self.stop(state,'UNCERTAIN','Cancellation cannot discard a pending write; read-only reconciliation required')
        return self.stop(state,'CANCELLED','Stopped before further writes; completed receipts remain recorded')


class FileSession:
    """Persist intent before returning an action; never re-emit a pending write."""
    def __init__(self,root,bundle,approval,fake=False,reconcile_only=False):
        self.root=Path(root);self.path=self.root/'journal.json'
        if bundle.get('page_failure_isolation'):
            from page_batch import PageBatchSession
            self.engine=PageBatchSession(bundle,approval,fake,reconcile_only)
        else:self.engine=Session(bundle,approval,fake,reconcile_only)
        if bundle.get('native_manifest'):
            from native_session import NativeSession
            if any(not p.get('native_evidence') for p in bundle['pages']):
                raise ValueError('Native session requires evidence for every selected page')
            self.engine = NativeSession(self.engine)
        self.fence=self.root.parent/'.batch-apply-active.json'
        self.quarantine_dir=self.root.parent/'page-quarantines'

    def start(self):
        self.root.mkdir(parents=True,exist_ok=True)
        if self.path.exists():raise ValueError('Session exists; inspect or reconcile, never restart a write')
        self.fence.parent.mkdir(parents=True,exist_ok=True)
        with self.fence.open('x',encoding='utf-8') as file:json.dump({'plan_sha256':self.engine.initial['plan_sha256']},file);file.flush();os.fsync(file.fileno())
        state=copy.deepcopy(self.engine.initial)
        if self.engine.isolated:
            state['preexisting_quarantines']={}
            for item in state['queue']:
                page=item['page'];path=self.quarantine_dir/(page['page_id']+'.json')
                if path.exists():state['preexisting_quarantines'][page['code']]=json.loads(path.read_text(encoding='utf-8'))
        action=self.engine.begin(state);atomic(self.path,state);self.persist_reports(state)
        if self.engine.isolated and action['type']=='FINISH':
            self.fence.unlink()
            action.update(pages=state.get('page_reports',{}),report_path=str(self.root/'batch-report.json'))
        return action

    def event(self,event=None,reconcile=False,cancel=False,continue_batch=False,reconcile_code=None):
        lock=self.root/'.step.lock'
        with lock.open('x',encoding='utf-8'):pass
        try:
            state=json.loads(self.path.read_text(encoding='utf-8'))
            if state['plan_sha256']!=self.engine.initial['plan_sha256']:raise ValueError('Journal/plan mismatch')
            if state['approval_sha256']!=self.engine.initial['approval_sha256']:raise ValueError('Approval changed during session')
            action=self.engine.cancel(state) if cancel else self.engine.continue_batch(state) if continue_batch else self.engine.reconcile(state,reconcile_code) if reconcile and self.engine.isolated else self.engine.reconcile(state) if reconcile else self.engine.step(state,event)
            atomic(self.path,state)
            self.persist_reports(state)
            if self.engine.isolated and action['type']=='FINISH':action.update(pages=state.get('page_reports',{}),report_path=str(self.root/'batch-report.json'))
            if action['type']=='FINISH' and (self.engine.isolated or action['status'] not in ('UNCERTAIN','RECONCILIATION_CONFLICT')):
                if self.fence.exists():
                    owner=json.loads(self.fence.read_text(encoding='utf-8'))
                    if owner.get('plan_sha256')!=state['plan_sha256']:raise ValueError('Application fence belongs to another plan')
                    self.fence.unlink()
            return action
        finally:lock.unlink()

    def persist_reports(self,state):
        if not self.engine.isolated:return
        for code,report in state.get('page_reports',{}).items():
            atomic(self.root/'pages'/('PP'+code+'.json'),report)
            quarantine=state.get('quarantines',{}).get(code)
            if quarantine:
                atomic(self.quarantine_dir/(report['page_id']+'.json'),{'code':code,'page_id':report['page_id'],'plan_sha256':state['plan_sha256'],
                       'approval_sha256':state['approval_sha256'],'review_reference':state['review_reference'],'journal':str(self.path),'reason':report['reason'],'resolution':quarantine.get('resolution'),'uncertain':bool(quarantine.get('uncertain'))})
        atomic(self.root/'batch-report.json',{'plan_sha256':state['plan_sha256'],'status':state['status'],'pages':state.get('page_reports',{}),'receipts':state['receipts']})
