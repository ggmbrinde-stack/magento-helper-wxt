"""Exact-section checks. Public edit scope does not attest hidden container children."""
import hashlib
import json
from pathlib import Path
import re

import rendered_layout as r

NAME='TARGETED_SECTION'
PRESENTATION_HEADINGS={'Imagens','Descrição e notas do perfil','Notas'}


def policy():
    root=Path(__file__).resolve().parent
    contract=json.loads((root/'targeted-contract.json').read_text(encoding='utf-8'))
    for name,expected in contract['evidence'].items():
        if hashlib.sha256((root/'captures/contract'/name).read_bytes()).hexdigest()!=expected:
            raise ValueError('Targeted connector evidence changed')
    return {'name':NAME,'version':1,'contract_sha256':r.digest(contract),
            'native_comments':contract['native_comments'],'body_comments_required':True,
            'fresh_read_before_each_operation':True,'global_export_claimed':False}


def protected_snapshot(body):
    result=[]
    def walk(nodes,path=()):
        for index,node in enumerate(nodes):
            scope=path
            if node.kind in ('toggle','callout'):scope=path+(node.kind+':'+node.title,)
            elif node.kind=='columns':scope=path+('columns',)
            elif node.kind=='column':scope=path+('column:'+str(index),)
            protect=(node.kind in ('paragraph','callout','todo','image')
                     or node.kind=='toggle' and node.title==r.SOURCE
                     or node.kind=='heading' and node.title not in PRESENTATION_HEADINGS)
            if protect:result.append({'scope':list(scope),'kind':node.kind,'sha256':r.digest(node.raw)})
            if node.kind=='table':
                if node.rows[0][:2] not in (['Face / local','Opções propostas'],['Face / local','Opções completas e especificações']):
                    result.append({'scope':list(scope),'kind':'body-comment-table','sha256':r.digest(node.raw)})
                for row in node.rows[1:]:
                    for col,value in enumerate(row[2:],2):
                        if value.strip():result.append({'scope':list(scope)+['table-note:'+row[0]+':'+str(col)],'kind':'annotation','sha256':r.digest(value)})
            if node.kind in r.CONTAINERS:walk(node.items,scope)
    walk(r.parse(body));return result


def retained(before,after):
    remaining=iter(after)
    return all(any(candidate==item for candidate in remaining) for item in before)


def inspect_operation(state,payload):
    if payload.get('command')!='update_content' or set(payload)!={'command','page_id','content_updates'}:
        raise ValueError('Targeted policy permits only update_content')
    edits=payload['content_updates']
    if len(edits)!=1 or set(edits[0])!={'old_str','new_str','replace_all_matches'} or edits[0]['replace_all_matches'] is not False:
        raise ValueError('Targeted policy requires one exact non-replace-all operation')
    old,new=edits[0]['old_str'],edits[0]['new_str'];body=state['body']
    if not isinstance(old,str) or not isinstance(new,str) or not old or body.count(old)!=1:
        raise ValueError('Target text is missing or ambiguous')
    start=body.index(old);end=start+len(old)
    nodes=r.parse(body);targets=r.parse(old);r.parse(new)
    matches=[n for n in nodes if n.start==start and n.raw==old.rstrip('\r\n') and end<=len(body) and not body[n.end:end].strip()]
    if len(targets)!=1 or len(matches)!=1 or old.strip()==body.strip():
        raise ValueError('Target must be one complete top-level section, never a nested fragment or whole page')
    node=targets[0]
    leaf=(node.kind=='heading' and node.title in PRESENTATION_HEADINGS and re.fullmatch(r'#{1,4} [^\n\r<>]+',node.raw) is not None)
    complete=leaf or state['coverage']['state']=='EXPLICIT_COMPLETE_EXPORT'
    after=body[:start]+new+body[end:]
    before_protected=protected_snapshot(old);after_protected=protected_snapshot(new)
    body_preserved=retained(before_protected,after_protected)
    reasons=[]
    if not complete:reasons.append('Affected container completeness is unproved; current connector contract does not attest omitted descendants')
    if not body_preserved:reasons.append('Body comments/review/prose/annotations or their associations would change inside the affected section')
    return {'eligible':not reasons,'reasons':reasons,'contract_sha256':policy()['contract_sha256'],
            'old_section_sha256':r.digest(old),'new_section_sha256':r.digest(new),
            'boundary':'one complete top-level supported section','completeness_basis':'documented childless presentation heading' if leaf else 'explicit complete export' if complete else 'UNPROVED',
            'visible_prefix_sha256':r.digest(body[:start]),'visible_suffix_sha256':r.digest(body[end:]),
            'body_protected_before':before_protected,'body_protected_after':after_protected,
            'body_comments_preserved_with_associations':body_preserved,'global_export_claimed':False,
            'native_comment_anchors_claimed':False}


def saved_result(before,after,payload):
    edit=payload['content_updates'][0];old,new=edit['old_str'],edit['new_str']
    if before.count(old)!=1:return False
    start=before.index(old);prefix=before[:start];suffix=before[start+len(old):]
    # These are observed text checks. Omitted content is outside the narrow command contract.
    return (after[:start]==prefix and after[start:start+len(new)]==new
            and after[start+len(new):]==suffix
            and retained(protected_snapshot(before),protected_snapshot(after)))


def update_only(ops,body):
    """Convert a reviewed trailing history insertion into an exact last-section update."""
    result=[]
    for operation in ops:
        op=dict(operation);payload=dict(op['payload'])
        if payload['command']=='insert_content':
            nodes=r.parse(body)
            if not nodes or nodes[-1].end!=len(body):raise ValueError('Append has no exact complete final-section anchor')
            old=nodes[-1].raw;new=old+payload['content']
            payload={'command':'update_content','page_id':payload['page_id'],'content_updates':[{'old_str':old,'new_str':new,'replace_all_matches':False}]}
            op.update(kind='body',before_region=old,after_region=new)
        op['payload']=payload
        edit=payload['content_updates'][0]
        if body.count(edit['old_str'])!=1:raise ValueError('Sequential target is not unique')
        body=body.replace(edit['old_str'],edit['new_str'],1);result.append(op)
    return result
