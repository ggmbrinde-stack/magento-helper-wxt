"""The explicitly authorised four-profile Transfer126 pocket correction only."""
import copy
import difflib
import json
from pathlib import Path

import batch_plan as b
import method_plan as m
import method_targets
import native_rows
import rendered_layout as r
from catalog_names import option_name

IDS={'430':'3cab6705ae1f820dab27015d0d5e85ea','558':'1dcb6705ae1f83c6bfb181c13c9a7d19','661':'4e5b6705ae1f835ea3fc81290bfd0d16','662':'ddbb6705ae1f820cb837013a1864964a'}
ONE='Transfer - Até 126 cm2 - 1 Cor (aprox. 11,2x11,2cm - MOCHILA)'
TWO=ONE.replace('1 Cor (','2 Cores (')
HEADING='## User-confirmed extension: apron pocket Transfer'


def source_section(response):
    value=response.get('structuredContent')
    if response.get('isError') or not isinstance(value,dict):raise ValueError('Successful actual rule source fetch required')
    content=response.get('content')
    if not isinstance(content,list) or len(content)!=1 or content[0].get('type')!='text' or json.loads(content[0].get('text',''))!=value:
        raise ValueError('Conflicting rule-source representations')
    b.verify_home(response);text=value['text']
    if text.count(HEADING)!=1:raise ValueError('Confirmed four-profile pocket source section missing/ambiguous')
    start=text.index(HEADING);end=text.find('\n## ',start+len(HEADING));section=text[start:end if end>=0 else len(text)].strip()
    if any(page not in section for page in IDS.values()) or ONE not in section or 'does not invent a new allocation' not in section:
        raise ValueError('Exact confirmed pocket scope/evidence is incomplete')
    return section


def verify_source(response,expected):
    if r.digest(source_section(response))!=expected['section_sha256']:raise ValueError('Confirmed pocket source changed since review')


def pocket_locations(excel,code):
    expected=ONE if code=='661' else TWO;locations=[]
    for group in excel['groups']:
        if any(item['text']==expected for item in group['options']):
            local=[x['text'] for x in group['locations']]
            if any('bolso' not in x.casefold() for x in local):continue
            locations.extend(local)
    if not locations:raise ValueError('Verified original pocket Transfer binding not found')
    return locations


def property_values(state,locations,schema):
    _,sides=r.body_sections(r.parse(state['body']));new=r.mappings(sides)['New']
    outside=[option for table in new for row in table[1:] if not set(b.lines(row[0]))<=set(locations) for option in b.lines(row[1])]
    result={};props=state['properties'];old_name=option_name(TWO);new_name=option_name(ONE)
    current=props.get('Opções de personalização')
    if not isinstance(current,list):raise ValueError('Existing global option property must be a known list')
    wanted=list(current)
    if TWO not in outside:wanted=[new_name if x==old_name else x for x in wanted]
    if new_name not in wanted:wanted.append(new_name)
    wanted=list(dict.fromkeys(wanted))
    if wanted!=current:result['Opções de personalização']=wanted
    techniques=props.get('Técnicas')
    if not isinstance(techniques,list):raise ValueError('Existing techniques must be a known list')
    if 'Transfer' not in techniques:result['Técnicas']=[*techniques,'Transfer']
    for name,values in result.items():
        definition=schema['schema'].get(name,{})
        if definition.get('type')!='multi_select' or definition.get('readOnly') or set(values)-{x['name'] for x in definition.get('options',[])}:
            raise ValueError('Narrow property correction would invent an option or unsupported type')
    return result


def validate_properties(state,payload,schema,locations):
    _,sides=r.body_sections(r.parse(state['body']));rows=[row for table in r.mappings(sides)['New'] for row in table[1:]]
    for location in locations:
        matches=[row for row in rows if location in b.lines(row[0])]
        if len(matches)!=1 or ONE not in b.lines(matches[0][1]):raise ValueError('Confirmed Transfer is not saved on its exact source pocket scope')
    wanted=property_values(state,locations,schema)
    if any(name not in wanted or wanted[name]!=value for name,value in payload['properties'].items()):raise ValueError('Property payload exceeds the confirmed pocket-only delta')


def prepare(captures,output,codes=None):
    import batch_apply as a
    from batch_cli import load
    root=Path(__file__).resolve().parent;captures=Path(captures);output=Path(output);codes=list(IDS) if codes is None else list(codes)
    if not codes or len(codes)!=len(set(codes)) or set(codes)-set(IDS):raise ValueError('Only the four explicitly authorised pocket profiles may be selected')
    source=load(captures/'home.json');section=source_section(source)
    schema=b.schema_state(load(root/'captures/final-current/schema.json'))
    proof=load(root/'captures/current/excel-proof.json');evidence=root/'captures/current/excel-evidence.json'
    manifest={'group_id':'confirmed-transfer126-pockets','review_scope':'Human approved exact pocket correction; independent review required before coordinator applies','collection':b.COLLECTION,
              'targets':{code:{'page_id':IDS[code],'mode':'POCKET_TRANSFER_ONLY'} for code in codes}}
    method_targets.configure(manifest);pages=[];scopes={};synthetic=False
    for code in codes:
        cap=load(captures/('pp'+code+'.json'));state=b.page_state(cap)
        synthetic=synthetic or bool(cap.get('capture',{}).get('synthetic'))
        if state['code']!=code or state['page_id']!=IDS[code]:raise ValueError('Actual active page identity differs from approved pocket target')
        locations=pocket_locations(proof['records'][code],code);scopes[code]=locations
        _,sides=r.body_sections(r.parse(state['body']));table=next(n for n in sides['New'].items if n.kind=='table')
        wanted=[];covered=[]
        for row in table.rows[1:]:
            local=b.lines(row[0]);options=b.lines(row[1]);changed=list(options)
            if set(local)&set(locations):
                if not set(local)<=set(locations):raise ValueError('Row mixes pocket target with an unaffected location')
                covered.extend(local)
                changed=[]
                for option in options:
                    if option==TWO or option.startswith('Por confirmar — sem opção aprovada em IMP'):option=ONE
                    if option not in changed:changed.append(option)
                if ONE not in changed:changed.append(ONE)
            wanted.append([row[0],'<br />'.join(b.inline(x) for x in changed)])
        if sorted(covered)!=sorted(locations):raise ValueError('Actual New rows do not uniquely cover the verified original pocket locations')
        current=copy.deepcopy(state);ops=[]
        for payload in native_rows.replace_table_rows(current['body'],table,wanted,state['page_id']):
            evidence_region=native_rows.inspect(current,payload)
            ops.append({'id':code+'-pocket-row-'+str(len(ops)+1),'kind':'body','eligible':True,'payload':payload,'region_evidence':evidence_region})
            edit=payload['content_updates'][0];current['body']=current['body'].replace(edit['old_str'],edit['new_str'],1)
        props=[]
        for name,value in property_values(current,locations,schema).items():
            props.append({'id':code+'-pocket-property-'+str(len(props)+1),'kind':'properties','eligible':True,
                          'payload':{'command':'update_properties','page_id':state['page_id'],'properties':{name:value}},'before_value':state['properties'][name],'after_value':value})
        pages.append({'code':code,'page_id':state['page_id'],'status':'NO_OP' if not ops and not props else 'READY_FOR_REVIEW',
                      'method_complete':True,'scope_complete':True,'whole_profile_method_complete':False,'reasons':[],'technical_unresolved':[],
                      'unaffected_open_choices':'661 chest, 662 box, cores mapping, DTF sizes/allocation and other full-method decisions are preserved and excluded',
                      'source_state_sha256':state['source_state_sha256'],'source_body':state['body'],'desired_body':current['body'],'source_metadata':b.stable_metadata(state),
                      'operations':ops,'property_operations':props,'validation_policy':m.policy(),'pocket_locations':locations,
                      'diff':''.join(difflib.unified_diff(state['body'].splitlines(True),current['body'].splitlines(True),fromfile=code+'-before',tofile=code+'-after'))})
    bundle={'version':'PP_METHOD_FINAL_1','validation_policy':m.policy(),'target_manifest':manifest,'target_manifest_sha256':r.digest(manifest),
            'pocket_scope':{'source':{'page_id':b.HOME,'source_edited_at':source['structuredContent']['page_last_edited_at'],'section_sha256':r.digest(section)},'locations':scopes,'human_authorisation':'Explicit four-profile correction and code-only application, recorded in current Working Copy rules; coordinator applies after independent review'},
            'working_copy':b.HOME,'collection':b.COLLECTION,'excel':proof,'evidence_path':str(evidence.resolve()),'schema_state_sha256':r.digest(schema),
            'implementation_sha256':b.implementation_sha(),'synthetic':synthetic,'apply_allowed_now':False,'pages':pages}
    if output.resolve().parent==captures.resolve() or output.resolve() in {Path(proof['workbook']).resolve(),evidence.resolve(),(root/'captures/final-current/schema.json').resolve()}:
        raise ValueError('Plan output cannot overwrite input evidence')
    a.verify_sources(bundle);a.atomic(output,bundle);reports=output.parent/(output.stem+'-reports');reports.mkdir(exist_ok=True)
    for page in pages:
        (reports/('PP'+page['code']+'.diff')).write_text(page['diff'],encoding='utf-8');a.atomic(reports/('PP'+page['code']+'.json'),page)
    return {'canonical_plan_sha256':r.digest(bundle),'implementation_sha256':bundle['implementation_sha256'],'source':bundle['pocket_scope']['source'],
            'pages':[{'code':p['code'],'status':p['status'],'locations':p['pocket_locations'],'body_operations':len(p['operations']),'property_operations':len(p['property_operations'])} for p in pages]}
