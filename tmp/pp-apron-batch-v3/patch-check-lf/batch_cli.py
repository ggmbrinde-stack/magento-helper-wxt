"""Offline preparation and a file-based session protocol. Never calls Notion itself."""
import argparse
import base64
import copy
import hashlib
import json
from pathlib import Path
import sys

import batch_plan as b
import batch_apply as a
import excel_proof
import rendered_layout as r


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
        page=b.prepare_page(inputs[code],load(path) if path.exists() else None,proof,template,schema)
        page['property_operations']=[]
        for index,proposal in enumerate(page['property_proposals'],1):
            if proposal['resolved']:
                page['property_operations'].append({'id':code+'-property-'+str(index),'kind':'properties',
                    'eligible':page['status']!='BLOCKED' and b.page_state(inputs[code])['coverage']['state']=='EXPLICIT_COMPLETE_EXPORT',
                    'payload':{'command':'update_properties','page_id':page['page_id'],'properties':{proposal['property']:proposal['after']}},
                    'before_value':proposal['before'],'after_value':proposal['after']})
        body,meta=page['source_body'],page['source_metadata']
        for op in page['operations']:body,meta=a.apply_model(body,meta,op['payload'])
        if body!=page['desired_body']:raise ValueError('Exact executable operations do not reproduce reviewed body')
        pages.append(page)
    bundle={'version':3,'apply_allowed_now':False,'synthetic':any(c.get('capture',{}).get('synthetic') for c in inputs.values()),
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
    for command in ('session-start','session-step','session-reconcile'):
        action=sub.add_parser(command);action.add_argument('--plan',type=Path,required=True);action.add_argument('--approval',type=Path,required=True)
        action.add_argument('--approved-plan-sha',required=True);action.add_argument('--apply',action='store_true')
        if command=='session-step':
            event=action.add_mutually_exclusive_group(required=True)
            event.add_argument('--event-base64');event.add_argument('--event-file',type=Path)
    args=parser.parse_args()
    if args.command=='prepare':result=prepare(args.captures,args.workbook,args.evidence,args.output)
    elif args.command=='bridge-source':
        path=Path(__file__).with_name('session_bridge.js');result={'source':path.read_text(encoding='utf-8'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    else:
        bundle=load(args.plan)
        if args.command=='inspect' or not args.apply:
            result={'dry_run':True,'plan_sha256':r.digest(bundle),'implementation_sha256':bundle['implementation_sha256'],
                    'collection':bundle['collection'],'pages':[{'code':p['code'],'page_id':p['page_id'],'status':p['status'],'reasons':p['reasons']} for p in bundle['pages']]}
        else:
            if args.approved_plan_sha!=r.digest(bundle):raise ValueError('Operator supplied a different approved plan hash')
            approval=load(args.approval)
            run=args.plan.resolve().parent/'runs'/r.digest(bundle)
            session=a.FileSession(run,bundle,approval,reconcile_only=args.command=='session-reconcile')
            if args.command=='session-start':result=session.start()
            elif args.command=='session-reconcile':result=session.event(reconcile=True)
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
