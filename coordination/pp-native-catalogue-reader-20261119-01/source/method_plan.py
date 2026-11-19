"""Source-backed PP method for one explicitly reviewed Working Copy group."""
import copy
import difflib
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import batch_plan as b
import native_rows
import method_targets
import rendered_layout as r
import targeted_section
from catalog_names import option_tech

NAME='PP_METHOD_ROWS'


def policy():
    contract=json.loads(Path(__file__).with_name('method-contract.json').read_text(encoding='utf-8'))
    root=Path(__file__).resolve().parent
    for name,expected in contract['evidence'].items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:raise ValueError('PP method source/contract evidence changed')
    return {'name':NAME,'version':1,'contract_sha256':r.digest(contract),'native_comments':'EXCLUDED_BY_EXPLICIT_HUMAN_POLICY',
            'body_notes_required':True,'global_export_claimed':False,'fresh_read_before_each_operation':True}


def key(value):
    return unicodedata.normalize('NFD',value.casefold()).encode('ascii','ignore').decode()


def reference(category,location,context):
    loc=key(location)
    if category in ('APRON','APRON_SET'):
        if 'bolso' in loc:return 'A6'
        if loc in ('peito','face 1'):return 'A4'
        if category=='APRON_SET' and 'chapeu' in loc:return 'A7'
    if category=='TEXTILE':
        if loc in ('frente','costas'):return 'A4'
        if 'peito' in loc or 'manga' in loc:return 'A7'
    sizes={'CAP':'A7','TOWEL_SMALL':'A6','TOWEL_LARGE':'A4','BLANKET':'A4','BAG_SMALL':'A6','BAG_LARGE':'A4','UMBRELLA':'A4','PARASOL':'A3'}
    if category in sizes:return sizes[category]
    if category in ('NOTEBOOK','SUBLIMATION') and context.get('article_size') in ('A1','A2','A3','A4','A5','A6','A7','A8'):
        return context['article_size']
    return None


def imp_options(root):
    source=(root/'source-evidence/IMP-tab.md').read_text(encoding='utf-8')
    matches=re.findall(r'<column[^>]*>\s*New\s+([\s\S]*?)</column>',source)
    if len(matches)!=1:raise ValueError('Exact current IMP New column required')
    options=[]
    for raw in re.findall(r'^- (.+)$',matches[0],re.M):
        value=b.lines(raw)
        if len(value)==1 and option_tech(value[0]) and 'transfer digital textil' not in key(value[0]):options.append(value[0])
    return list(dict.fromkeys(options))


def transform_options(existing,size,catalog,category):
    result=[];questions=[]
    for option in existing:
        normalized=key(option);technique=option_tech(option)
        if 'transfer digital' in normalized and 'textil' in normalized:continue
        if 'por confirmar' in normalized:result.append(option);questions.append(option);continue
        if category=='SUBLIMATION' and technique!='Sublimação':continue
        if technique in ('DTF','Flex','Sublimação','Bordado','Estamparia') and size:
            matches=[x for x in catalog if option_tech(x)==technique and re.search(r'\b'+size+r'\b',x)]
            if len(matches)==1:option=matches[0]
            else:questions.append('No unique existing '+technique+' option for '+size)
        elif option not in catalog:questions.append('Existing New option absent from current IMP New; profile-specific source/human confirmation required: '+option)
        result.append(option)
    return list(dict.fromkeys(result)),questions


def make_page(capture,proof,schema,record,catalog):
    state=b.page_state(capture);code=state['code'];body=state['body']
    if code=='601' or record.get('mode')=='NO_CHANGE':
        return {'code':code,'page_id':state['page_id'],'status':'NO_OP','method_complete':True,'reasons':['Explicit do-not-change exception'],
                'source_state_sha256':state['source_state_sha256'],'source_body':body,'desired_body':body,'source_metadata':b.stable_metadata(state),
                'operations':[],'property_operations':[],'property_proposals':[],'validation_policy':policy(),'technical_unresolved':[],'diff':''}
    category=record['category'];context=record.get('context',{})
    if category in ('APRON','APRON_SET') and 'avental' not in key(state['properties'].get('PP','')):
        raise ValueError('Apron category does not match actual active profile identity')
    _,sides=r.body_sections(r.parse(body))
    old_tables=[n for n in sides['Old'].items if n.kind=='table'];new_tables=[n for n in sides['New'].items if n.kind=='table']
    if len(old_tables)!=1 or len(new_tables)!=1:raise ValueError('One supported New and Old table required')
    old=old_tables[0];new=new_tables[0];excel=proof['records'][code];b.check_old_source(old,excel)
    new_rows=[];questions=[];changes=[]
    for row in new.rows[1:]:
        locations=b.lines(row[0]);sizes={reference(category,loc,context) for loc in locations}
        if len(sizes)!=1 or None in sizes:questions.append('Exact category/location reference required: '+row[0]);size=None
        else:size=next(iter(sizes))
        existing=b.lines(row[1]);options,open_choices=transform_options(existing,size,catalog,category)
        decisions=record.get('confirmed_options',{})
        if row[0] in decisions:
            decision=decisions[row[0]]
            if not decision.get('evidence_reference') or not decision.get('human_confirmed'):raise ValueError('New choices need explicit human/source evidence')
            options=decision['options'];open_choices=[]
            for value in options:
                if value not in catalog and value not in record.get('confirmed_catalog_exceptions',[]):raise ValueError('Unreviewed option outside IMP New')
        if code=='428' and locations==['Bolso']:
            # The source contains a specific human correction for 428, not a batch-wide Transfer rule.
            options=existing;open_choices=[]
        if not any(option_tech(x) in ('Estamparia','Transfer','Serigrafia Circular','Tampografia') for x in options):
            old_groups=[g for g in excel['groups'] if set(locations)&{x['text'] for x in g['locations']}]
            if any(any(option_tech(x['text'])=='Transfer' for x in g['options']) for g in old_groups):
                open_choices.append('Select exact one-colour Transfer/process and New allocation from the original source; no generic 428 exception assumed')
        if category in ('APRON','APRON_SET') and any('caixa' in key(x) for x in locations):
            if row[0] not in decisions:open_choices.append('Box material and exact process/area remain unconfirmed; existing UV100 is provisional')
        questions.extend(row[0]+': '+x for x in open_choices)
        changed=[row[0],'<br />'.join(b.inline(x) for x in options)]
        if b.lines(row[1])!=options:changes.append({'locations':locations,'reference':size,'before':existing,'after':options})
        new_rows.append(changed)
    operations=[];current=copy.deepcopy(state)
    for side,table,wanted in [('Old',old,b.old_rows(excel)),('New',new,new_rows)]:
        # Spans are rebound after each table edit; the enclosing native containers are untouched.
        _,current_sides=r.body_sections(r.parse(current['body']));table=next(n for n in current_sides[side].items if n.kind=='table')
        for payload in native_rows.replace_table_rows(current['body'],table,wanted,state['page_id']):
            evidence=native_rows.inspect(current,payload)
            op={'id':code+'-row-'+str(len(operations)+1),'kind':'body','eligible':True,'payload':payload,'region_evidence':evidence,'side':side}
            operations.append(op);edit=payload['content_updates'][0];current['body']=current['body'].replace(edit['old_str'],edit['new_str'],1)
    _,final_sides=r.body_sections(r.parse(current['body']));final_old=next(n for n in final_sides['Old'].items if n.kind=='table')
    if [[b.lines(x) for x in row[:2]] for row in final_old.rows[1:]]!=[[b.lines(x) for x in row] for row in b.old_rows(excel)]:raise ValueError('Excel Old grouping was not faithfully repaired')
    proposed_state=copy.deepcopy(state);proposed_state['body']=current['body'];proposals,unknown=b.property_proposals(proposed_state,schema)
    questions=list(dict.fromkeys(questions+unknown));properties=[]
    if not questions and all(p['resolved'] for p in proposals):
        for proposal in proposals:
            properties.append({'id':code+'-property-'+str(len(properties)+1),'kind':'properties','eligible':True,
                               'payload':{'command':'update_properties','page_id':state['page_id'],'properties':{proposal['property']:proposal['after']}},
                               'before_value':proposal['before'],'after_value':proposal['after']})
    return {'code':code,'page_id':state['page_id'],'status':'NO_OP' if not operations and not properties else 'READY_FOR_REVIEW',
            'method_complete':not questions,'reasons':[],'technical_unresolved':questions,'approved_state':'A rever; own Yes/No and why unchanged',
            'source_state_sha256':state['source_state_sha256'],'source_body':body,'desired_body':current['body'],'source_metadata':b.stable_metadata(state),
            'operations':operations,'property_operations':properties,'property_proposals':proposals,'validation_policy':policy(),
            'rule_changes':changes,'category':category,'body_protected_snapshot':targeted_section.protected_snapshot(body),
            'layout':'Existing New/Old columns and row notes retained; no whole-container rewrite or cosmetic note relocation',
            'diff':''.join(difflib.unified_diff(body.splitlines(True),current['body'].splitlines(True),fromfile=code+'-before',tofile=code+'-after'))}


def validate_properties(state,payload,schema):
    proposals,unknown=b.property_proposals(state,schema)
    if unknown:raise ValueError('Unresolved New cannot silently synchronise partial properties')
    reviewed={p['property']:p['after'] for p in proposals if p['resolved']}
    if any(name not in reviewed or reviewed[name]!=value for name,value in payload['properties'].items()):
        raise ValueError('Property operation does not match exact currently saved New')


def prepare(captures,workbook,evidence,manifest_path,output):
    import batch_apply as a
    import excel_proof
    from batch_cli import load
    root=Path(__file__).resolve().parent;captures=Path(captures);output=Path(output)
    manifest=load(manifest_path);targets=method_targets.configure(manifest)
    proof=excel_proof.verify(workbook,evidence,manifest.get('excel_groups'))
    required={code for code,record in manifest['targets'].items() if code!='601' and record.get('mode')!='NO_CHANGE'}
    if set(proof['records'])!=required:raise ValueError('Excel evidence must cover exactly selected mutable records')
    schema=b.schema_state(load(captures/'schema.json'));b.verify_home(load(captures/'home.json'))
    catalog=imp_options(root);pages=[];synthetic=False
    for code,page_id in targets.items():
        capture=load(captures/('pp'+code+'.json'));state=b.page_state(capture)
        if state['code']!=code or state['page_id']!=page_id:raise ValueError('Actual active identity differs from reviewed manifest')
        page=make_page(capture,proof,schema,manifest['targets'][code],catalog)
        current=copy.deepcopy(state);body=current['body'];meta=b.stable_metadata(current)
        for op in page['operations']+page['property_operations']:body,meta=a.apply_model(body,meta,op['payload'])
        if body!=page['desired_body']:raise ValueError('Executable row operations do not reproduce reviewed result')
        pages.append(page);synthetic=synthetic or bool(capture.get('capture',{}).get('synthetic'))
    bundle={'version':'PP_METHOD_FINAL_1','validation_policy':policy(),'target_manifest':manifest,'target_manifest_sha256':r.digest(manifest),
            'working_copy':b.HOME,'collection':b.COLLECTION,'excel':proof,'evidence_path':str(Path(evidence).resolve()),
            'source_evidence':'source-evidence/manifest.json','input_freshness':'Current received reads; timestamps in individual captures; not complete-container attestation',
            'schema_state':schema,'schema_state_sha256':r.digest(schema),'implementation_sha256':b.implementation_sha(),
            'synthetic':synthetic,'apply_allowed_now':False,'global_deferred':['Human deferred customer cores to DTF mapping; no final technical approval inferred'],
            'pages':pages}
    if output.resolve() in {Path(manifest_path).resolve(),Path(evidence).resolve(),Path(workbook).resolve()} or output.resolve().parent==captures.resolve():
        raise ValueError('Plan output cannot overwrite source evidence')
    a.atomic(output,bundle);reports=output.parent/'reports';reports.mkdir(exist_ok=True)
    for page in pages:
        a.atomic(reports/('PP'+page['code']+'.json'),page);(reports/('PP'+page['code']+'.diff')).write_text(page['diff'],encoding='utf-8')
    summary={'canonical_plan_sha256':r.digest(bundle),'implementation_sha256':bundle['implementation_sha256'],'validation_policy':policy(),
             'pages':[{'code':p['code'],'status':p['status'],'method_complete':p['method_complete'],'body_operations':len(p['operations']),
                       'property_operations':len(p['property_operations']),'technical_unresolved':p['technical_unresolved']} for p in pages]}
    a.atomic(reports/'summary.json',summary);return summary
