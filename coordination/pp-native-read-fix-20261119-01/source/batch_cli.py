"""Offline preparation and a file-based session protocol. Never calls Notion itself."""
import argparse
import base64
import copy
import hashlib
import json
from pathlib import Path
import sys
import uuid

import batch_plan as b
import batch_apply as a
import excel_proof
import rendered_layout as r
import targeted_section as scoped
import method_plan
import pocket_plan
import batch_prepare
import full_conversion
import full_excel


def load(path):
    path=Path(path)
    if path.stat().st_size>20_000_000:raise ValueError('Input exceeds bounded size')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def prepare(captures,workbook,evidence,output):
    captures,output=Path(captures),Path(output)
    proof=excel_proof.verify(workbook,evidence)
    schema=b.schema_state(load(captures/'schema.json'));b.verify_home(load(captures/'home.json'))
    inputs={}
    for path in sorted(captures.glob('pp*.json')):
        capture=load(path);state=b.page_state(capture)
        if state['code'] in inputs:raise ValueError('Duplicate actual PP identity in captures')
        inputs[state['code']]=capture
    if set(inputs)!=set(r.PAGES):raise ValueError('Exact eleven-page batch requires one current capture per actual code')
    template=b.page_state(inputs['428']);r.validate_template(template['body'])
    pages=[]
    for code in r.PAGES:
        path=captures/('comments'+code+'.json')
        page=b.prepare_page(inputs[code],None,proof,template,schema,validation_policy=scoped.policy())
        page['property_operations']=[]
        for index,proposal in enumerate(page['property_proposals'],1):
            if proposal['resolved'] and page['validation_policy'] is None:
                page['property_operations'].append({'id':code+'-property-'+str(index),'kind':'properties',
                    'eligible':page['status']!='BLOCKED' and b.page_state(inputs[code])['coverage']['state']=='EXPLICIT_COMPLETE_EXPORT',
                    'payload':{'command':'update_properties','page_id':page['page_id'],'properties':{proposal['property']:proposal['after']}},
                    'before_value':proposal['before'],'after_value':proposal['after']})
        body,meta=page['source_body'],page['source_metadata']
        for op in page['operations']:body,meta=a.apply_model(body,meta,op['payload'])
        if body!=page['desired_body']:raise ValueError('Exact executable operations do not reproduce reviewed body')
        pages.append(page)
    bundle={'version':5,'validation_policy':scoped.policy(),'input_freshness':'FROZEN_CAPTURE_NOT_A_FRESH_READ','apply_allowed_now':False,'synthetic':any(c.get('capture',{}).get('synthetic') for c in inputs.values()),
            'working_copy':b.HOME,'collection':b.COLLECTION,'excel':proof,'evidence_path':str(Path(evidence).resolve()),
            'schema_state':schema,'schema_state_sha256':r.digest(schema),'implementation_sha256':b.implementation_sha(),
            'template_capture_sha256':r.digest(inputs['428']),'pages':pages}
    if output.resolve() in {Path(evidence).resolve(),Path(workbook).resolve(),*(p.resolve() for p in captures.glob('*.json'))}:raise ValueError('Output cannot overwrite inputs')
    a.atomic(output,bundle)
    reports=output.parent/'reports';reports.mkdir(exist_ok=True)
    for page in pages:
        a.atomic(reports/('PP'+page['code']+'.json'),page)
        (reports/('PP'+page['code']+'.diff')).write_text(page['diff'],encoding='utf-8')
    summary={'plan_sha256':r.digest(bundle),'implementation_sha256':bundle['implementation_sha256'],
             'pages':[{'code':p['code'],'status':p['status'],'operations':len(p['operations']),
                       'old_repaired':p['checks']['old_repaired'],'reasons':p['reasons'],
                       'technical_unresolved':p['technical_unresolved'],'property_proposals':p['property_proposals']} for p in pages]}
    a.atomic(reports/'summary.json',summary)
    return summary


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    prep=sub.add_parser('prepare')
    for name in ('captures','workbook','evidence','output'):prep.add_argument('--'+name,type=Path,required=True)
    inspect=sub.add_parser('inspect');inspect.add_argument('--plan',type=Path,required=True)
    bridge=sub.add_parser('bridge-source')
    prepbridge=sub.add_parser('prepare-bridge-source')
    method=sub.add_parser('prepare-method')
    for name in ('captures','workbook','evidence','manifest','output'):method.add_argument('--'+name,type=Path,required=True)
    pocket=sub.add_parser('prepare-pocket');pocket.add_argument('--captures',type=Path,required=True);pocket.add_argument('--output',type=Path,required=True)
    pocket.add_argument('--codes',nargs='+',choices=list(pocket_plan.IDS))
    batch=sub.add_parser('prepare-batch');batch.add_argument('--captures',type=Path,required=True);batch.add_argument('--output',type=Path,required=True);batch.add_argument('--codes',nargs='+',choices=list(pocket_plan.IDS))
    full=sub.add_parser('prepare-full')
    for name in ('captures','workbook','index','inventory','output'):full.add_argument('--'+name,type=Path,required=True)
    full.add_argument('--codes',nargs='+',required=True);full.add_argument('--contexts',type=Path)
    full.add_argument('--native-manifest', type=Path)
    native_read = sub.add_parser('native-read')
    native_read.add_argument('--plan', type=Path, required=True)
    native_read.add_argument('--page-id', required=True)
    native_read.add_argument('--nonce', required=True)
    native_read.add_argument('--output', type=Path, required=True)
    native_capture = sub.add_parser('capture-native')
    native_ids = {'428': '074b6705ae1f8257a53701d87a64eb32', **pocket_plan.IDS}
    native_capture.add_argument('--codes', nargs='+', choices=list(native_ids), required=True)
    native_capture.add_argument('--output', type=Path, required=True)
    index=sub.add_parser('index-workbook');index.add_argument('--workbook',type=Path,required=True);index.add_argument('--output',type=Path,required=True)
    coverage=sub.add_parser('inventory');coverage.add_argument('--index',type=Path,required=True);coverage.add_argument('--inventory',type=Path,required=True)
    selection=sub.add_parser('selection');selection.add_argument('--inventory',type=Path,required=True);selection.add_argument('--codes',nargs='+',required=True)
    for command in ('session-start','session-step','session-reconcile','session-cancel','session-continue'):
        action=sub.add_parser(command);action.add_argument('--plan',type=Path,required=True);action.add_argument('--approval',type=Path,required=True)
        action.add_argument('--approved-plan-sha',required=True);action.add_argument('--apply',action='store_true')
        if command=='session-reconcile':action.add_argument('--code')
        if command=='session-step':
            event=action.add_mutually_exclusive_group(required=True)
            event.add_argument('--event-base64');event.add_argument('--event-file',type=Path)
    args=parser.parse_args()
    if args.command=='prepare':result=prepare(args.captures,args.workbook,args.evidence,args.output)
    elif args.command=='prepare-method':result=method_plan.prepare(args.captures,args.workbook,args.evidence,args.manifest,args.output)
    elif args.command=='prepare-pocket':result=pocket_plan.prepare(args.captures,args.output,args.codes)
    elif args.command=='prepare-batch':result=batch_prepare.prepare(args.captures,args.output,args.codes)
    elif args.command=='prepare-full':result=full_conversion.prepare(args.captures,args.workbook,args.index,args.inventory,args.codes,args.output,args.contexts,args.native_manifest)
    elif args.command=='native-read':
        import native_evidence
        bundle = load(args.plan)
        if (bundle['implementation_sha256'] != b.implementation_sha()
                or args.page_id not in {p['page_id'] for p in bundle['pages'] if p['code'] != '601'}
                or not bundle.get('native_manifest') or bundle.get('synthetic')):
            raise ValueError('Native read must be bound to a real current candidate plan')
        a.verify_sources(bundle)
        snapshot = native_evidence.collect(args.page_id, args.nonce)
        if args.output.resolve().parent != args.plan.resolve().parent or not args.output.name.startswith(args.plan.name+'.event-'):
            raise ValueError('Native response must use the plan-local event spool')
        a.atomic(args.output, {'nonce': args.nonce, 'result': snapshot})
        result = {'path': str(args.output.resolve()), 'sha256': native_evidence.file_hash(args.output)}
    elif args.command=='capture-native':
        import native_evidence
        if len(args.codes) != len(set(args.codes)):
            raise ValueError('Duplicate native selection')
        args.output.mkdir(parents=True, exist_ok=False)
        manifest = {'source': native_evidence.SOURCE, 'implementation_sha256': b.implementation_sha(),
                    'pages': {}, 'synthetic': False}
        for code in args.codes:
            snapshot = native_evidence.collect(native_ids[code], uuid.uuid4().hex)
            path = args.output / ('pp'+code+'.json')
            a.atomic(path, snapshot)
            manifest['pages'][code] = {'path': path.name, 'sha256': native_evidence.file_hash(path)}
        a.atomic(args.output/'manifest.json', manifest)
        result = {'path': str((args.output/'manifest.json').resolve()), 'codes': args.codes,
                  'sha256': native_evidence.file_hash(args.output/'manifest.json')}
    elif args.command=='index-workbook':
        value=full_excel.index(args.workbook);a.atomic(args.output,value)
        result={'records':len(value['records']),'duplicates':value['duplicate_codes'],'source':value['source']}
    elif args.command=='inventory':result=full_excel.coverage(load(args.index),load(args.inventory))
    elif args.command=='selection':
        rows=full_excel.inventory(load(args.inventory))
        if len(args.codes)!=len(set(args.codes)) or set(args.codes)-set(rows):raise ValueError('Selection differs from reviewed inventory')
        result={'collection':b.COLLECTION,'working_copy':b.HOME,'pages':[{'code':c,'page_id':full_conversion.page_id(rows[c]['url'])} for c in args.codes if c!='601'],'excluded_protected_codes':[c for c in args.codes if c=='601']}
    elif args.command in ('bridge-source','prepare-bridge-source'):
        path=Path(__file__).with_name('prepare_bridge.js' if args.command=='prepare-bridge-source' else 'session_bridge.js');result={'source':path.read_text(encoding='utf-8'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    else:
        bundle=load(args.plan)
        if args.command=='inspect' or not args.apply:
            result={'dry_run':True,'plan_sha256':r.digest(bundle),'implementation_sha256':bundle['implementation_sha256'],
                    'validation_policy':bundle.get('validation_policy'),
                    'working_copy':bundle.get('working_copy',b.HOME),
                    'collection':bundle['collection'],'pages':[{'code':p['code'],'page_id':p['page_id'],'status':p['status'],'reasons':p['reasons'],
                        **({'method_complete':p['method_complete'],'technical_unresolved':p['technical_unresolved'],'preparation_error':p.get('full_prepare_error')} if bundle.get('full_scope') else {})} for p in bundle['pages']]}
        else:
            if args.approved_plan_sha!=r.digest(bundle):raise ValueError('Operator supplied a different approved plan hash')
            approval=load(args.approval)
            run_key=r.digest({'plan_sha256':r.digest(bundle),'approval_sha256':r.digest(approval)}) if bundle.get('page_failure_isolation') else r.digest(bundle)
            run=args.plan.resolve().parent/'runs'/run_key
            session=a.FileSession(run,bundle,approval,reconcile_only=args.command=='session-reconcile')
            if args.command=='session-start':result=session.start()
            elif args.command=='session-reconcile':result=session.event(reconcile=True,reconcile_code=args.code)
            elif args.command=='session-cancel':result=session.event(cancel=True)
            elif args.command=='session-continue':
                if not bundle.get('page_failure_isolation'):raise ValueError('Explicit batch continuation requires the reviewed per-page policy')
                result=session.event(continue_batch=True)
            else:
                if args.event_file:
                    expected_parent=args.plan.resolve().parent
                    if args.event_file.resolve().parent!=expected_parent or not args.event_file.name.startswith(args.plan.name+'.event-'):
                        raise ValueError('Event file must be a plan-local connector spool')
                    event=load(args.event_file)
                else:
                    raw=base64.b64decode(args.event_base64,validate=True)
                    if len(raw)>8_000_000:raise ValueError('Connector event exceeds bounded size')
                    event=json.loads(raw)
                result=session.event(event)
    print(json.dumps(result,ensure_ascii=True))


if __name__=='__main__':
    try:main()
    except (ValueError,KeyError,OSError,TypeError) as error:
        print(json.dumps({'error':str(error)},ensure_ascii=True));sys.exit(1)
