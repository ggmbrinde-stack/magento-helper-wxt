"""Add the explicitly authorised per-PP review/error workflow to the pocket plan."""
import json
from pathlib import Path

import batch_apply as a
import batch_plan as b
import page_batch
import pocket_plan
import rendered_layout as r


def prepare(captures,output,codes=None):
    captures=Path(captures);output=Path(output)
    schema=b.schema_state(json.loads((captures/'schema.json').read_text(encoding='utf-8')))
    definition=schema['schema'].get('Estado',{})
    names={x['name'] for x in definition.get('options',[])}
    if definition.get('type')!='select' or definition.get('readOnly') or 'Para revisão' not in names:
        raise ValueError('Existing writable Estado select with Para revisão is required; coder never changes schema')
    pocket_plan.prepare(captures,output,codes,schema_path=captures/'schema.json')
    bundle=json.loads(output.read_text(encoding='utf-8'))
    bundle.update(page_failure_isolation=page_batch.POLICY,schema_state_sha256=r.digest(schema),schema_state=schema,
                  metadata_dependencies={'Para revisão':'EXISTS','Erro':'EXISTS' if 'Erro' in names else 'MISSING: safe marker falls back to local error report until available'},
                  status_policy_provenance='Direct human instruction relayed by Engineering Lead: successful PP to Para revisão; errors to Erro with durable reason; skip failed PP and continue independent approved PP')
    for page in bundle['pages']:
        def operation(suffix,kind,status):
            return {'id':page['code']+'-'+suffix,'kind':kind,'eligible':True,'payload':{'command':'update_properties','page_id':page['page_id'],'properties':{'Estado':status}}}
        page['completion_status_operation']=operation('review-status','success_status','Para revisão')
        page['failure_status_operation']=operation('error-status','error_status','Erro')
        page['failure_status_operation'].update(conditional=True,requires_existing_option=True,observed_option_available='Erro' in names)
        page['status']='READY_FOR_REVIEW'
    bundle['implementation_sha256']=b.implementation_sha();a.atomic(output,bundle)
    reports=output.parent/(output.stem+'-reports');reports.mkdir(exist_ok=True)
    for page in bundle['pages']:a.atomic(reports/('PP'+page['code']+'.json'),page)
    result={'canonical_plan_sha256':r.digest(bundle),'implementation_sha256':bundle['implementation_sha256'],'metadata_dependencies':bundle['metadata_dependencies'],
            'pages':[{'code':p['code'],'body_operations':len(p['operations']),'business_properties':len(p['property_operations']),'final_status':'Para revisão','failure_status':'Erro, best effort; durable local reason always'} for p in bundle['pages']]}
    a.atomic(reports/'summary.json',result);return result
