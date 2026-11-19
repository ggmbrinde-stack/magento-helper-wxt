"""Deterministic Excel-backed body plans and separately reviewed property proposals."""
import collections
import copy
import difflib
import hashlib
import html
import json
from pathlib import Path
import re
import unicodedata

import rendered_layout as r
import targeted_section as scoped
from catalog_names import option_name, option_tech

COLLECTION = 'collection://431b6705-ae1f-83db-b71c-0739778f9e1a'
HOME = '417b6705ae1f81aabd8bf1130a9b991c'
PROPERTIES = ('Faces','Número de locais possíveis','Técnicas','Opções de personalização')


def clean(value):
    return ' '.join(unicodedata.normalize('NFC',value).split())


def inline(value):
    return html.escape(value,quote=False).replace('|','\\|').replace('\n','<br />')


def lines(value):
    return [clean(r.plain(x).replace('\\|','|')) for x in re.split(r'<br\s*/?>|\n',value) if clean(r.plain(x))]


def page_state(capture):
    state = r.decode_capture(capture)
    text = capture['response']['structuredContent']['text']
    parents = re.findall(r'<parent-data-source\s+url="([^"]+)"',text)
    if parents != [COLLECTION]: raise ValueError('Page is not in the exact working-copy data source')
    if 'discussion://' in state['body'] or 'discussion-urls=' in state['body']:
        state['discussion_markers'] = True
    else: state['discussion_markers'] = False
    return state


def stable_metadata(state):
    def stable(value):
        if isinstance(value,dict): return {k:stable(v) for k,v in value.items() if k!='expiry_time'}
        if isinstance(value,list): return [stable(v) for v in value]
        return value
    return stable({k:state[k] for k in ('properties','cover','icon')})


def observed_hash(state):
    return r.digest({'page_id':state['page_id'],'body':state['body'],'metadata':stable_metadata(state)})


def schema_state(response):
    value = response.get('structuredContent',{})
    if response.get('isError') or value.get('metadata',{}).get('type')!='data_source':
        raise ValueError('Not a successful data-source fetch')
    match = re.findall(r'<data-source-state>\s*([\s\S]*?)\s*</data-source-state>',value.get('text',''))
    if len(match)!=1: raise ValueError('Missing exact source schema')
    state = json.loads(match[0])
    if state.get('url')!=COLLECTION or not isinstance(state.get('schema'),dict):
        raise ValueError('Wrong data-source identity')
    return state


def verify_home(response):
    value=response.get('structuredContent',{})
    identity=value.get('id','')
    identity=r.notion_url_id(identity) if identity.startswith('https://') else identity.replace('-','')
    if response.get('isError') or identity!=HOME or value.get('title')!='PP - Catalog v2 (Working Copy)' or COLLECTION not in value.get('text',''):
        raise ValueError('Working-copy home identity mismatch')


def comments_proof(response):
    if response is None: return {'empty':False,'reason':'Comment discovery unavailable after initial capability failure'}
    refused={'empty':False,'reason':'Conflicting, failed, unsupported or incomplete discussion response'}
    if not isinstance(response,dict) or set(response)-{'content','structuredContent','isError'} or response.get('isError',False) is not False:
        return refused
    value=response.get('structuredContent');raw=response.get('content',[])
    if not isinstance(raw,list): return refused
    if raw:
        if len(raw)!=1 or not isinstance(raw[0],dict) or set(raw[0])!={'type','text'} or raw[0]['type']!='text' or not isinstance(raw[0]['text'],str):
            return refused
        text=raw[0]['text']
        try: displayed=json.loads(text)
        except ValueError: displayed={'text':text}
        if value is not None and value!=displayed: return refused
        value=displayed
    if not isinstance(value,dict) or set(value)-{'text','suggested_edits_status','isError'} or value.get('isError',False) is not False:
        return refused
    if value.get('suggested_edits_status')=='upgrade_required':
        return {'empty':False,'reason':'Connector comment/suggested-edit discovery returns upgrade_required'}
    xml=value.get('text')
    if not isinstance(xml,str) or '<!' in xml or '<?' in xml: return refused
    try:
        import xml.etree.ElementTree as ET
        root=ET.fromstring(xml)
        statuses=[s for s in (value.get('suggested_edits_status'),root.get('suggested_edits_status')) if s is not None]
        attributes={'shown-count','total-count','suggested_edits_status','omitted-truncated','reactions-truncated'}
        empty=(root.tag=='discussions' and root.get('shown-count')=='0' and root.get('total-count')=='0'
               and bool(statuses) and all(s=='available' for s in statuses)
               and not set(root.attrib)-attributes
               and all(root.get(k,'false')=='false' for k in ('omitted-truncated','reactions-truncated'))
               and not list(root) and not (root.text or '').strip())
        return {'empty':empty,'reason':None if empty else 'Complete empty comments/suggestions were not established'}
    except (ValueError,TypeError,ET.ParseError):
        return refused


def old_rows(record):
    return [[ '<br />'.join(inline(x['text']) for x in group['locations']),
              '<br />'.join(inline(x['text']) for x in group['options'])] for group in record['groups']]


def check_old_source(table,record):
    observed=collections.Counter(x for row in table.rows[1:] for x in lines(row[1]))
    expected=collections.Counter(clean(x['text']) for g in record['groups'] for x in g['options'])
    locations={x for row in table.rows[1:] for x in lines(row[0])}
    expected_locations={clean(x['text']) for g in record['groups'] for x in g['locations']}
    if observed!=expected or locations!=expected_locations:
        raise ValueError('Observed Old options/locations do not exactly match the verified Excel source')


def concise_notes(tech):
    notes=[];opaque=[];seen=set()
    def add(scope,location,text):
        key=(scope,tuple(lines(location)),clean(r.plain(text)))
        if key not in seen:
            seen.add(key);notes.append((scope,location,text))
    def collect(node,scope='General'):
        if node.kind=='toggle' and node.title in ('New','Old'):
            for child in node.items[1:]: collect(child,node.title)
        elif node.kind=='toggle' and node.title.startswith(('New: ','Old: ')):
            first=node.items[0].raw
            if not first.startswith(('New: ','Old: ')):
                opaque.append(node.raw);return
            side,loc=first.split(': ',1)
            if len(node.items)==2 and node.items[1].kind=='paragraph': add(side,loc,node.items[1].raw)
            else: opaque.append(node.raw)
        elif node.kind=='toggle' and node.title=='Pendências técnicas':
            for child in node.items[1:]: collect(child,scope)
        elif node.kind=='paragraph' and all(re.match(r'^- [^:]+: .+',line) for line in node.raw.splitlines()):
            for line in node.raw.splitlines():
                loc,text=line[2:].split(': ',1);add(scope,loc,text)
        elif node.kind=='paragraph' and node.raw in ('Nota','Notas'):
            pass
        else: opaque.append(node.raw)
    for child in tech.items[1:]: collect(child)
    content=[r.toggle(side+': '+loc,[text]) for side,loc,text in notes]+list(dict.fromkeys(opaque))
    return r.toggle(r.TECH,content,True,tech.attrs), [{'side':s,'location':l,'text':t} for s,l,t in notes]


def desired_body(state,record,template):
    source=state['body'];nodes=r.parse(source);_,sides=r.body_sections(nodes)
    tables=[n for n in sides['Old'].items if n.kind=='table']
    if len(tables)!=1: raise ValueError('Expected one fully parsed Old source table')
    table=tables[0];check_old_source(table,record)
    expected=[table.rows[0][:2]]+old_rows(record)
    old_correct=[[lines(c) for c in row[:2]] for row in table.rows]==[[lines(c) for c in row] for row in expected]
    repaired=source
    if not old_correct:
        replacement=r.xml_table(r.Node('table','',rows=expected))
        if source.count(table.raw)!=1: raise ValueError('Old table anchor is not unique')
        repaired=source.replace(table.raw,replacement,1)
    formatted,_=r.format_markdown(repaired,state['code'],template['body'])
    after_nodes=r.parse(formatted)
    techs=[n for n in after_nodes if n.kind=='toggle' and n.title==r.TECH]
    if len(techs)!=1: raise ValueError('Technical note region ambiguous')
    tech=techs[0];notes_body,notes=concise_notes(tech)
    # An already approved canonical PP428 is a semantic no-op, including its own prose.
    if state['code']=='428' and old_correct and formatted==source:
        return source, {'old_repaired':False,'old_rows':old_rows(record),'technical_notes':[], 'new_mapping_unchanged':True}
    if notes_body!=tech.raw:
        formatted=formatted.replace(tech.raw,notes_body,1)
    if formatted!=source:
        original_columns=r.body_sections(nodes)[0]
        archived=[original_columns.raw]
        archived.extend(n.raw for n in nodes if n.kind=='toggle' and n.title==r.TECH)
        archive=r.toggle('Original preservado antes da revisão de layout e associações Excel',
                         ['Proveniência: '+record['range']+'; grupos e células verificados no plano.',*archived])
        after_nodes=r.parse(formatted)
        histories=[n for n in after_nodes if n.kind=='toggle' and n.title==r.HISTORY]
        if len(histories)>1: raise ValueError('Conflicting presentation histories')
        if histories:
            old=histories[0];new=r.toggle(r.HISTORY,[*old.items[1:],archive],attrs=old.attrs)
            formatted=formatted.replace(old.raw,new,1)
        else: formatted=r.join([formatted,r.toggle(r.HISTORY,[archive])])
    result_nodes=r.parse(formatted);_,after_sides=r.body_sections(result_nodes)
    before_new=r.mappings(sides)['New'];after_new=r.mappings(after_sides)['New']
    if before_new!=after_new: raise ValueError('New choices changed without profile-specific evidence')
    resulting=[n for n in after_sides['Old'].items if n.kind=='table']
    if len(resulting)!=1 or [[lines(c) for c in row] for row in resulting[0].rows[1:]] != [[lines(c) for c in row] for row in old_rows(record)]:
        raise ValueError('Old repair did not preserve exact verified Excel grouping')
    before_review=[n.raw for n in nodes if r.review_state(n,state['code']) is not None]
    after_review=[n.raw for n in result_nodes if r.review_state(n,state['code']) is not None]
    before_source=[n.raw for n in nodes if n.kind=='toggle' and n.title==r.SOURCE]
    after_source=[n.raw for n in result_nodes if n.kind=='toggle' and n.title==r.SOURCE]
    images=lambda ns:[n.raw for n in r.descend(ns) if n.kind=='image']
    if before_review!=after_review or before_source!=after_source or images(nodes)!=images(result_nodes):
        raise ValueError('Review/source/media preservation failed')
    if r.ledger(nodes)-r.ledger(result_nodes): raise ValueError('Visible original content lost')
    return formatted, {'old_repaired':not old_correct,'old_rows':old_rows(record),'technical_notes':notes,'new_mapping_unchanged':True}


def operations(before,after,page_id):
    old_nodes,new_nodes=r.parse(before),r.parse(after)
    matcher=difflib.SequenceMatcher(a=[n.raw for n in old_nodes],b=[n.raw for n in new_nodes],autojunk=False)
    result=[]
    for tag,i,j,a,b in matcher.get_opcodes():
        if tag=='equal': continue
        new=r.join(new_nodes[a:b])
        if i==j:
            if i!=len(old_nodes): raise ValueError('Middle insertion has no complete, unique replacement region')
            payload={'command':'insert_content','page_id':page_id,'position':{'type':'end'},'content':'\n\n'+new}
            result.append({'kind':'append','payload':payload,'before_region':None,'after_region':new})
        else:
            end=old_nodes[j].start if j<len(old_nodes) else len(before)
            old=before[old_nodes[i].start:end]
            if new and j<len(old_nodes):new+='\n\n'
            if not old or before.count(old)!=1: raise ValueError('Targeted old text is ambiguous')
            r.parse(old)
            payload={'command':'update_content','page_id':page_id,'content_updates':[{'old_str':old,'new_str':new,'replace_all_matches':False}]}
            result.append({'kind':'body','payload':payload,'before_region':old,'after_region':new})
    return result


def property_proposals(state,schema):
    _,sides=r.body_sections(r.parse(state['body']));mapping=r.mappings(sides)['New']
    faces=list(dict.fromkeys(x for table in mapping for row in table[1:] for x in lines(row[0])))
    options=[x for table in mapping for row in table[1:] for x in lines(row[1])]
    unresolved=[];names=[];techniques=[]
    for original in options:
        if 'transfer digital textil' in unicodedata.normalize('NFD',original.casefold()).encode('ascii','ignore').decode():
            unresolved.append('Dropped Transfer Digital Textil remains in New; exact profile correction needs review');continue
        if 'por confirmar' in original.casefold(): unresolved.append(original);continue
        technique=option_tech(original)
        if not technique: unresolved.append('Unrecognised technique: '+original);continue
        try: name=option_name(original)
        except ValueError: unresolved.append(original);continue
        names.append(name);techniques.append(technique)
    wanted={'Faces':faces,'Número de locais possíveis':len(faces),'Técnicas':list(dict.fromkeys(techniques)),
            'Opções de personalização':list(dict.fromkeys(names))}
    proposals=[]
    for key,value in wanted.items():
        existing=state['properties'].get(key)
        if existing==value or (isinstance(existing,list) and isinstance(value,list) and set(existing)==set(value)): continue
        definition=schema['schema'].get(key,{})
        reasons=[]
        if key in ('Técnicas','Opções de personalização') and unresolved: reasons.append('New contains unresolved choices; no partial property synchronisation')
        if definition.get('readOnly'): reasons.append('Schema property is read-only')
        if isinstance(value,list):
            if definition.get('type')!='multi_select': reasons.append('Existing property is not multi_select')
            available={o['name'] for o in definition.get('options',[])}
            missing=set(value)-available
            if missing: reasons.append('Names absent from existing schema: '+', '.join(sorted(missing)))
        elif definition.get('type')!='number': reasons.append('Existing property is not number')
        proposal={'property':key,'before':existing,'resolved':not reasons,'reasons':reasons}
        proposal['candidate_known_subset' if reasons else 'after']=value
        proposals.append(proposal)
    return proposals,unresolved


def prepare_page(capture,comments,proof,template,schema,validation_policy=None):
    state=page_state(capture);code=state['code'];record=proof['records'][code]
    desired,checks=desired_body(state,record,template)
    # The corrected result must not archive a second copy on rerun.
    second=copy.deepcopy(state);second['body']=desired
    if desired_body(second,record,template)[0]!=desired: raise ValueError('Corrected layout is not idempotent')
    ops=operations(state['body'],desired,state['page_id'])
    if validation_policy is not None:
        if validation_policy!=scoped.policy():raise ValueError('Unknown targeted validation policy')
        ops=scoped.update_only(ops,state['body'])
    proposals,unresolved=property_proposals(state,schema)
    comment_state=comments_proof(comments)
    reasons=[]
    if validation_policy is None and ops and state['coverage']['state']!='EXPLICIT_COMPLETE_EXPORT':
        reasons.append('Global coverage UNKNOWN; no independently attested complete target-region export. Unique/balanced text and Excel agreement do not prove absence of omitted content.')
    if validation_policy is None and ops and (not comment_state['empty'] or state['discussion_markers']): reasons.append(comment_state['reason'] or 'Discussion anchors must not be moved or duplicated')
    sequential=copy.deepcopy(state)
    for index,op in enumerate(ops):
        op['id']=code+'-body-'+str(index+1)
        op['region_evidence']={'unique_match':op['kind']=='append' or state['body'].count(op['before_region'])==1,
                               'fully_parsed_supported_export':True,'excel_original_groups_verified':True,
                               'server_region_completeness_attested':state['coverage']['state']=='EXPLICIT_COMPLETE_EXPORT'}
        op['eligible']=not reasons
        if validation_policy is not None:
            try:evidence=scoped.inspect_operation(sequential,op['payload'])
            except ValueError as error:evidence={'eligible':False,'reasons':[str(error)]}
            op['region_evidence']=evidence;op['eligible']=evidence['eligible']
            reasons.extend(op['id']+': '+reason for reason in evidence['reasons'])
            edit=op['payload']['content_updates'][0]
            sequential['body']=sequential['body'].replace(edit['old_str'],edit['new_str'],1)
    return {'code':code,'page_id':state['page_id'],'status':'NO_OP' if not ops else 'BLOCKED' if reasons else 'READY',
            'reasons':reasons,'source_capture_sha256':r.digest(capture),'source_state_sha256':state['source_state_sha256'],
            'source_observed_hash':observed_hash(state),'source_body':state['body'],'desired_body':desired,
            'source_metadata':stable_metadata(state),'review_callout_sha256':[r.digest(n.raw) for n in r.parse(state['body']) if r.review_state(n,code) is not None],
            'operations':ops,'property_proposals':proposals,'technical_unresolved':unresolved,
            'comments':comment_state if validation_policy is None else {'policy':'EXCLUDED_BY_EXPLICIT_HUMAN_POLICY','empty_attested':False,'native_anchors_preserved_claimed':False},
            'validation_policy':validation_policy,'body_preservation_snapshot':scoped.protected_snapshot(state['body']),
            'excel':record,'checks':checks,'diff':''.join(difflib.unified_diff(state['body'].splitlines(True),desired.splitlines(True),fromfile=code+'-before',tofile=code+'-after'))}


def implementation_sha():
    root=Path(__file__).resolve().parent
    names=['batch_plan.py','excel_proof.py','catalog_names.py','batch_apply.py','batch_cli.py','session_bridge.js','rendered_layout.py','format_layout.py','targeted_section.py','targeted-contract.json','native_rows.py','method_plan.py','method_targets.py','method-contract.json','pocket_plan.py','page_batch.py','batch_prepare.py','full_excel.py','full_regions.py','full_conversion.py','importar_pp.py','format_coverage.py','prepare_bridge.js']
    names += ['native_evidence.py', 'native_session.py']
    return r.digest({n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in names})
