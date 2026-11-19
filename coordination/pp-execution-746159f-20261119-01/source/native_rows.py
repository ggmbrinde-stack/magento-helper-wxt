"""Narrow row edits: cells are inline-only in the captured Notion Markdown contract."""
import copy
import collections
import re

import rendered_layout as r
import targeted_section as scoped


def spans(body):
    result=[]
    for table in r.descend(r.parse(body)):
        if table.kind!='table':continue
        if table.raw.startswith('|'):
            offset=table.start
            for index,line in enumerate(table.raw.splitlines(keepends=True)):
                raw=line.rstrip('\r\n')
                if index>1:result.append((offset,raw,r.pipe_cells(raw),len(table.rows[0])))
                offset+=len(line)
        else:
            lex=r.Lexer(table.raw)
            rows=[t for t in lex.tags.values() if t.name=='tr' and t.parent and t.parent.name=='table']
            for row,cells in zip(rows[1:],table.rows[1:]):result.append((table.start+row.start,table.raw[row.start:row.end],cells,len(table.rows[0])))
    return result


def cells(raw):
    if raw.startswith('|'):
        values=[r.pipe_cells(line) for line in raw.splitlines()]
    else:
        table=r.parse('<table>\n'+raw+'\n</table>')[0];values=table.rows
    for row in values:
        for value in row:
            lex=r.Lexer(value)
            if any(t.name not in r.INLINE for t in lex.tags.values()):raise ValueError('Table row contains non-inline or unknown content')
    return values


def note_label(location,note):
    return 'Nota original conjunta ('+location+'): '+note


def notes_preserved(old,new):
    for row in old:
        for index,note in enumerate(row[2:],2):
            if not note.strip():continue
            exact=[x for x in new if len(x)>index and x[0]==row[0] and x[index]==note]
            shared=[x for x in new if len(x)>index and x[index]==note_label(row[0],note)]
            if len(exact)!=1 and len(shared)!=1:return False
    return True


def inspect(state,payload):
    if set(payload)!={'command','page_id','content_updates'} or payload['command']!='update_content' or len(payload['content_updates'])!=1:
        raise ValueError('Row contract permits one update_content operation')
    edit=payload['content_updates'][0]
    if set(edit)!={'old_str','new_str','replace_all_matches'} or edit['replace_all_matches'] is not False:raise ValueError('Unsafe row replacement')
    old,new=edit['old_str'],edit['new_str'];body=state['body']
    if not isinstance(old,str) or not isinstance(new,str) or not old or not new or body.count(old)!=1:raise ValueError('Row target missing or ambiguous')
    start=body.index(old);matched=[row for row in spans(body) if row[0]==start and row[1]==old]
    if len(matched)!=1:raise ValueError('Target is not an exact complete data row in its current table')
    before=cells(old);after=cells(new);width=matched[0][3]
    if len(before)!=1 or any(len(row)!=width for row in before+after):raise ValueError('Row change alters table width or crosses row boundaries')
    locations=lambda rows:collections.Counter(r.plain(value).strip() for row in rows for value in re.split(r'<br\s*/?>',row[0]))
    if locations(before)!=locations(after):raise ValueError('Row edit would add, remove or reassign actual locations')
    if not notes_preserved(before,after):raise ValueError('Body row notes or their explicit location association would be lost')
    result=body[:start]+new+body[start+len(old):];r.parse(result)
    return {'eligible':True,'basis':'documented inline-only cells; complete exact data row; public targeted replacement contract',
            'old_section_sha256':r.digest(old),'new_section_sha256':r.digest(new),
            'visible_prefix_sha256':r.digest(body[:start]),'visible_suffix_sha256':r.digest(body[start+len(old):]),
            'body_notes_preserved':True,'old_note_scopes':[row[0] for row in before if any(x.strip() for x in row[2:])],
            'global_export_claimed':False,'native_comment_anchors_claimed':False}


def render_like(raw,rows):
    if raw.startswith('|'):return '\n'.join('| '+' | '.join(row)+' |' for row in rows)
    original=r.parse('<table>\n'+raw+'\n</table>')[0]
    attrs=lambda value:''.join(' '+k+'="'+r.html.escape(v,quote=True)+'"' for k,v in value.items())
    return '\n'.join('<tr'+attrs(original.row_attrs[0])+'>'+''.join('<td'+attrs(original.cell_attrs[0][i])+'>'+value+'</td>' for i,value in enumerate(row))+'</tr>' for row in rows)


def replace_table_rows(body,table,new_rows,page_id):
    old_spans=[x for x in spans(body) if table.start<=x[0]<table.start+len(table.raw)]
    if len(old_spans)!=len(table.rows)-1:raise ValueError('Affected table row spans are not fully supported')
    if len(old_spans)!=len(new_rows) and len(old_spans)!=1:raise ValueError('Multiple-row regrouping requires a reviewed explicit row correspondence')
    result=[]
    for index,(_,raw,old,width) in enumerate(old_spans):
        wanted=new_rows if len(old_spans)==1 else [new_rows[index]]
        wanted=copy.deepcopy(wanted)
        for i,row in enumerate(wanted):
            row.extend(['']*(width-len(row)))
            if len(row)!=width:raise ValueError('New row exceeds existing table width')
        for col,note in enumerate(old[2:],2):
            if not note.strip():continue
            if len(wanted)==1 and wanted[0][0]==old[0]:wanted[0][col]=note
            else:wanted[0][col]=note_label(old[0],note)
        new=render_like(raw,wanted)
        if cells(raw)==cells(new):continue
        payload={'command':'update_content','page_id':page_id,'content_updates':[{'old_str':raw,'new_str':new,'replace_all_matches':False}]}
        result.append(payload)
    return result


def saved(before,after,payload):
    edit=payload['content_updates'][0];old,new=edit['old_str'],edit['new_str']
    if before.count(old)!=1:return False
    start=before.index(old)
    if after[:start]!=before[:start] or after[start:start+len(new)]!=new or after[start+len(new):]!=before[start+len(old):]:return False
    return notes_preserved(cells(old),cells(new))
