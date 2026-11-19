"""Offline Notion PP body-layout proposals. No writer, API or token handling."""
import argparse
import collections
import copy
import hashlib
import json
from pathlib import Path
import re
import uuid

PAGES = dict(zip(
    ('428', '429', '430', '467', '558', '612', '633', '661', '662', '786', '840'),
    ('074b6705ae1f8257a53701d87a64eb32', '137b6705ae1f82048ef1810070095cf0',
     '3cab6705ae1f820dab27015d0d5e85ea', 'f06b6705ae1f82ad871e01420cf67ecb',
     '1dcb6705ae1f83c6bfb181c13c9a7d19', 'e48b6705ae1f83ddafb501a2ea781406',
     'f7bb6705ae1f826b848d819549bc3c03', '4e5b6705ae1f835ea3fc81290bfd0d16',
     'ddbb6705ae1f820cb837013a1864964a', 'd00b6705ae1f835cb7440191c545e56b',
     'bacb6705ae1f8296839b01585f6e5e8e')))
TYPES = {'paragraph', 'heading_1', 'heading_2', 'heading_3', 'image', 'callout',
         'to_do', 'toggle', 'column_list', 'column', 'table', 'table_row',
         'bulleted_list_item', 'numbered_list_item', 'quote', 'divider', 'code',
         'bookmark', 'file', 'video', 'audio', 'pdf', 'equation'}
MEDIA = {'image', 'file', 'video', 'audio', 'pdf'}
TECH = 'Pontos técnicos a confirmar'
HISTORY = 'Histórico de apresentação'
SOURCE = 'Fonte e original do Excel'


class Blocked(ValueError):
    pass


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def text(rich):
    if not isinstance(rich, list):
        raise Blocked('Unsupported rich-text representation')
    result = []
    for item in rich:
        if not isinstance(item, dict) or item.get('type', 'text') != 'text' or not isinstance(item.get('text', {}).get('content'), str):
            raise Blocked('Unsupported or incomplete rich-text item')
        result.append(item['text']['content'])
    return ''.join(result)


def label(block):
    return text(block[block['type']].get('rich_text', []))


def children(block):
    return block[block['type']].get('children', [])


def walk(blocks):
    for block in blocks:
        yield block
        yield from walk(children(block))


def identity(snapshot):
    if not isinstance(snapshot, dict):
        raise Blocked('Snapshot must be a page object')
    page = snapshot.get('page', snapshot)
    if not isinstance(page, dict) or not isinstance(page.get('properties'), dict):
        raise Blocked('Missing complete page properties')
    if page is not snapshot and any(k in snapshot and snapshot[k] != page.get(k) for k in ('id', 'url', 'properties', 'cover', 'icon')):
        raise Blocked('Conflicting page metadata representations')
    props = page.get('properties', {})
    value = props.get('Código PP')
    if isinstance(value, dict):
        value = text(value.get('rich_text', []))
    if value not in PAGES or snapshot.get('code', value) != value or page.get('code', value) != value:
        raise Blocked('Missing, conflicting or out-of-scope actual PP code')
    title = props.get('PP', page.get('title', snapshot.get('title')))
    if isinstance(title, dict):
        title = text(title.get('title', []))
    if title is not None:
        if not isinstance(title, str):
            raise Blocked('Unsupported page title representation')
        title_code = re.match(r'^(\d+)\b', title)
        if title_code and title_code[1] != value:
            raise Blocked('Page title conflicts with the actual PP code')
    raw_id = page.get('id')
    if raw_id is None:
        match = re.fullmatch(r'https://app\.notion\.com/(?:p/)?([a-fA-F0-9-]{32,36})', page.get('url', ''))
        raw_id = match[1] if match else ''
    try:
        page_id = uuid.UUID(raw_id).hex
    except (ValueError, TypeError, AttributeError):
        raise Blocked('Missing or unsupported page UUID') from None
    if page_id != PAGES[value]:
        raise Blocked('Page UUID does not match the authorised code/page pair')
    if 'url' in page and page.get('id'):
        match = re.fullmatch(r'https://app\.notion\.com/(?:p/)?([a-fA-F0-9-]{32,36})', page['url'])
        if not match or uuid.UUID(match[1]).hex != page_id:
            raise Blocked('Conflicting page UUID and URL')
    return value, page_id, page


def validate(snapshot):
    code, page_id, page = identity(snapshot)
    coverage = snapshot.get('coverage', {})
    if (not isinstance(coverage, dict) or coverage.get('complete') is not True or coverage.get('properties_complete') is not True
            or coverage.get('truncated') is not False or coverage.get('has_more') is not False
            or coverage.get('omitted_children') != [] or coverage.get('unsupported_blocks') != []):
        raise Blocked('Missing complete body/properties coverage evidence; rendered text alone is insufficient')
    if snapshot.get('fetchError') or page.get('archived') or page.get('in_trash') or 'cover' not in page or 'icon' not in page:
        raise Blocked('Incomplete page metadata or failed fetch')
    if snapshot.get('content'):
        raise Blocked('Mixed rendered/native body representations require an unambiguous complete export')
    blocks = snapshot.get('blocks')
    if not isinstance(blocks, list) or not blocks:
        raise Blocked('Complete expanded native blocks are required; no content-to-block guessing')
    ids = set()

    def check(nodes, depth=0):
        if depth > 32 or not isinstance(nodes, list):
            raise Blocked('Unsupported nesting or children list')
        for block in nodes:
            if not isinstance(block, dict) or block.get('type') not in TYPES:
                raise Blocked('Unsupported native block type')
            if block.get('archived') or block.get('in_trash'):
                raise Blocked('Archived block cannot be restored by a layout proposal')
            bid = block.get('id')
            try:
                bid = uuid.UUID(bid).hex
            except (ValueError, TypeError, AttributeError):
                raise Blocked('Missing native block identity') from None
            if bid in ids or len(ids) >= 5000:
                raise Blocked('Duplicate block identity or unsupported body size')
            ids.add(bid)
            kind = block['type']
            payload = block.get(kind)
            if not isinstance(payload, dict) or not isinstance(block.get('has_children'), bool):
                raise Blocked('Incomplete block payload or child-presence flag')
            if 'children' in block or block.get('has_more') or block.get('truncated'):
                raise Blocked('Unsupported or incomplete child representation')
            if block['has_children']:
                if block.get('children_complete') is not True or not payload.get('children'):
                    raise Blocked('Omitted or unproved child coverage')
            elif payload.get('children'):
                raise Blocked('Conflicting child-presence evidence')
            if 'rich_text' in payload:
                text(payload['rich_text'])
            if kind in MEDIA:
                media_type = payload.get('type')
                if media_type not in ('file', 'external', 'file_upload') or not isinstance(payload.get(media_type), dict):
                    raise Blocked('Incomplete native media representation')
                reference = payload[media_type].get('id' if media_type == 'file_upload' else 'url')
                if not isinstance(reference, str) or not reference:
                    raise Blocked('Missing stable media reference')
            if kind == 'table_row':
                if not isinstance(payload.get('cells'), list):
                    raise Blocked('Missing table-row cells')
                for cell in payload['cells']:
                    text(cell)
            check(children(block), depth + 1)
    check(blocks)
    return code, page_id, page, blocks


def node(code, name, kind, payload):
    result = {'object': 'block', 'id': str(uuid.uuid5(uuid.UUID(PAGES[code]), 'pp-layout-v1/' + name)),
              'type': kind, kind: payload, 'has_children': bool(payload.get('children'))}
    if result['has_children']:
        result['children_complete'] = True
    return result


def rich(value):
    return [{'type': 'text', 'text': {'content': value}}] if value else []


def review_info(block, code):
    if block['type'] != 'callout':
        return None
    todos = [b for b in children(block) if b['type'] == 'to_do']
    if not todos:
        return None
    if len(todos) != 2 or not re.match(r'^(Sim|Yes)\b', label(todos[0])) or not re.match(r'^(Não|No)\b', label(todos[1])):
        raise Blocked('Unsupported review choices')
    if any(not isinstance(b['to_do'].get('checked'), bool) for b in todos) or all(b['to_do']['checked'] for b in todos):
        raise Blocked('Conflicting or missing human review decision')
    if any(number != code for number in re.findall(r'\bPP\s*(\d+)\b', label(block))):
        raise Blocked('Review callout belongs to another PP')
    if not any('Se não, porquê?' in label(b) for b in children(block) if 'rich_text' in b[b['type']]):
        raise Blocked('Missing editable review-reason area')
    return {'yes': todos[0]['to_do']['checked'], 'no': todos[1]['to_do']['checked'],
            'callout_sha256': digest(block)}


def template_shape(snapshot):
    code, _, _, blocks = validate(snapshot)
    if code != '428':
        raise Blocked('The complete approved PP428 template is required')
    reviews = [b for b in blocks if review_info(b, code) is not None]
    columns = [b for b in blocks if b['type'] == 'column_list']
    if len(reviews) != 1 or len(columns) != 1 or len(children(columns[0])) != 2:
        raise Blocked('Template lacks a unique native review callout and two-column layout')
    cols = children(columns[0])
    for column, name in zip(cols, ('New (proposta)', 'Old (original)')):
        if column['type'] != 'column' or not children(column) or label(children(column)[0]) != name:
            raise Blocked('Template column identity is unsupported')
    ratios = [c['column'].get('width_ratio', 0.5) for c in cols]
    if ratios != [0.5, 0.5]:
        raise Blocked('Template columns are not equal 50/50')
    tech = [i for i, b in enumerate(blocks) if b['type'] == 'toggle' and label(b) == TECH]
    source = [i for i, b in enumerate(blocks) if b['type'] == 'toggle' and label(b) == SOURCE and children(b)]
    if len(tech) != 1 or len(source) != 1 or not blocks.index(reviews[0]) < blocks.index(columns[0]) < tech[0] < source[0]:
        raise Blocked('Template omits or misorders technical notes and full source/history')
    return reviews[0], cols


def atoms(blocks):
    result = collections.Counter()
    for block in walk(blocks):
        payload = block[block['type']]
        if payload.get('rich_text'):
            result[('rich', canonical(payload['rich_text']))] += 1
        for cell in payload.get('cells', []):
            if cell:
                result[('rich', canonical(cell))] += 1
        if block['type'] in MEDIA:
            result[('media', canonical(payload))] += 1
    return result


def format_body(blocks, code, template):
    template_review, template_columns = template
    sides = {'New': [], 'Old': []}
    headings, images, description, sources, historic, technical = {}, [], [], [], [], []
    review, old_history, old_tech = None, None, None
    associations = []
    mappings = []

    def consume(nodes, side=None):
        nonlocal review, old_history, old_tech
        for original in nodes:
            block = copy.deepcopy(original)
            kind, title = block['type'], label(block)
            if kind.startswith('heading_'):
                if title in ('New (proposta)', 'Old (original)'):
                    side = title.split()[0]
                    if side in headings:
                        raise Blocked('Conflicting repeated New/Old section')
                    headings[side] = block
                elif 'nova configuração (proposta)' in title or title.startswith('Antes '):
                    side = 'New' if 'nova configuração (proposta)' in title else 'Old'
                    historic.append(block)
                elif title == 'Imagens':
                    side = 'Images'
                    images.append(block)
                elif title in ('Descrição e notas do perfil', 'Notas'):
                    side = 'Description'
                    description.append(block)
                else:
                    historic.append(block)
                continue
            if kind == 'column_list':
                cols = children(block)
                if len(cols) != 2 or any(c['type'] != 'column' for c in cols):
                    raise Blocked('Unsupported existing columns')
                for col in cols:
                    consume(children(col))
                side = None
            elif review_info(block, code) is not None:
                if review is not None:
                    raise Blocked('Multiple review callouts require manual reconciliation')
                review = block
            elif kind == 'toggle' and title == SOURCE:
                sources.append(block)
                side = None
            elif kind == 'toggle' and title == HISTORY:
                if old_history is not None:
                    raise Blocked('Conflicting presentation histories')
                old_history = block
            elif kind == 'toggle' and title == TECH:
                if old_tech is not None:
                    raise Blocked('Conflicting technical sections')
                old_tech = block
            elif kind == 'table' and side in sides:
                width, rows = block['table'].get('table_width'), children(block)
                if width not in (2, 3) or not rows or any(r['type'] != 'table_row' or len(r['table_row']['cells']) != width for r in rows):
                    raise Blocked('Unsupported or incomplete New/Old table')
                header = rows[0]['table_row']['cells']
                if text(header[0]).casefold() != 'face / local' or not text(header[1]).casefold().startswith(('opções', 'options')):
                    raise Blocked('Unrecognised location/options table header')
                mappings.append({'side': side, 'table_id': block['id'], 'cells': [copy.deepcopy(r['table_row']['cells'][:2]) for r in rows]})
                if width == 3:
                    if text(rows[0]['table_row']['cells'][2]) not in ('Nota', 'Notas'):
                        raise Blocked('Third table column is not a known note column')
                    technical.append(node(code, block['id'] + '/note-heading', 'paragraph', {'rich_text': copy.deepcopy(rows[0]['table_row']['cells'][2])}))
                    for row in rows[1:]:
                        cells = row['table_row']['cells']
                        associations.append({'side': side, 'table_id': block['id'], 'row_id': row['id'], 'location': copy.deepcopy(cells[0]), 'note': copy.deepcopy(cells[2])})
                        if cells[2]:
                            technical.append(node(code, row['id'] + '/note', 'toggle', {'rich_text': rich(side + ': ') + copy.deepcopy(cells[0]), 'children': [node(code, row['id'] + '/note-text', 'paragraph', {'rich_text': copy.deepcopy(cells[2])})]}))
                    for row in rows:
                        row['table_row']['cells'] = row['table_row']['cells'][:2]
                    block['table']['table_width'] = 2
                sides[side].append(block)
            elif kind == 'image' and side in (None, 'Images'):
                images.append(block)
            elif kind in MEDIA and side in sides:
                raise Blocked('Scoped media needs an explicit supported location association')
            elif kind == 'to_do':
                raise Blocked('Review choice outside its callout requires manual reconciliation')
            elif side == 'Description':
                description.append(block)
            elif kind == 'toggle' and side in sides:
                technical.append(node(code, block['id'] + '/context', 'toggle', {'rich_text': rich(side), 'children': [block]}))
            else:
                historic.append(node(code, block['id'] + '/history-context', 'toggle', {'rich_text': rich(side), 'children': [block]}) if side in sides else block)
    consume(blocks)
    source_reviews = [b for b in walk(blocks) if review_info(b, code) is not None]
    if len(source_reviews) > 1 or (source_reviews and (review is None or source_reviews[0]['id'] != review['id'])):
        raise Blocked('Review decision is duplicated or nested in an unsupported context')
    had_review = review is not None
    if not sources or not all(sides.values()):
        raise Blocked('Missing complete New/Old tables or full Excel source/history')
    if review is None:
        payload = {'rich_text': rich('Revisão do PP ' + code), 'children': [
            node(code, 'review/yes', 'to_do', {'rich_text': rich('Sim, aprovo a configuração New do PP ' + code + '.'), 'checked': False}),
            node(code, 'review/no', 'to_do', {'rich_text': rich('Não, são necessárias correções.'), 'checked': False}),
            node(code, 'review/reason-label', 'paragraph', {'rich_text': rich('Se não, porquê?')}),
            node(code, 'review/reason', 'paragraph', {'rich_text': []})]}
        if template_review['callout'].get('icon', {}).get('type') == 'emoji':
            payload['icon'] = copy.deepcopy(template_review['callout']['icon'])
        review = node(code, 'review', 'callout', payload)
    cols = []
    for i, side in enumerate(sides):
        heading = headings.get(side) or node(code, side + '/heading', 'heading_2', {'rich_text': rich(side + (' (proposta)' if side == 'New' else ' (original)'))})
        payload = {'children': [heading, *sides[side]]}
        if 'width_ratio' in template_columns[i]['column']:
            payload['width_ratio'] = template_columns[i]['column']['width_ratio']
        cols.append(node(code, side + '/column', 'column', payload))
    after = [*images, *description, review, node(code, 'columns', 'column_list', {'children': cols})]
    tech = old_tech or node(code, 'technical', 'toggle', {'rich_text': rich(TECH), 'children': []})
    tech['toggle']['children'] = children(tech) + technical
    tech['has_children'] = bool(children(tech))
    if tech['has_children']:
        tech['children_complete'] = True
    after.append(tech)
    after.extend(sources)
    if old_history or historic:
        history = old_history or node(code, 'history', 'toggle', {'rich_text': rich(HISTORY), 'children': []})
        history['toggle']['children'] = children(history) + historic
        history.update(has_children=True, children_complete=True)
        after.append(history)
    if atoms(blocks) - atoms(after):
        raise Blocked('Preservation check failed: original rich text/media would be lost')
    decision = review_info(review, code)
    decision['origin'] = 'preserved-existing' if had_review else 'unchecked-no-prior-decision'
    return after, associations, decision, mappings


def plan(snapshot, template):
    report = {'status': 'BLOCKED', 'apply_allowed': False, 'source_snapshot_sha256': digest(snapshot), 'template_snapshot_sha256': digest(template) if template is not None else None,
              'synthetic_fixture': bool(snapshot.get('synthetic_fixture')) if isinstance(snapshot, dict) else False}
    try:
        code, page_id, _ = identity(snapshot)
        report.update(code=code, page_id=page_id)
        code, page_id, page, blocks = validate(snapshot)
        if template is None:
            raise Blocked('Complete approved PP428 template snapshot is missing')
        shape = template_shape(template)
        after, notes, decision, mappings = format_body(blocks, code, shape)
        before_mapping = {side: [{'table_id': item['table_id'], 'cells': item['cells']} for item in mappings if item['side'] == side] for side in ('New', 'Old')}
        columns = next(b for b in after if b['type'] == 'column_list')
        after_mapping = {side: [{'table_id': b['id'], 'cells': [r['table_row']['cells'] for r in children(b)]} for b in children(col) if b['type'] == 'table'] for side, col in zip(('New', 'Old'), children(columns))}
        if before_mapping != after_mapping:
            raise Blocked('Exact New/Old location/options preservation check failed')
        candidate = copy.deepcopy(snapshot)
        candidate['blocks'] = after
        validate(candidate)
        report.update(status='PROPOSED_LOCAL_ONLY', proposed_body=after, note_associations=notes,
                      review=decision, before_body_sha256=digest(blocks), after_body_sha256=digest(after),
                      original_new_old_mappings=mappings,
                      unchanged_page_metadata={k: copy.deepcopy(page[k]) for k in ('properties', 'cover', 'icon')},
                      preservation={'original_rich_text_and_media_retained': True,
                                    'page_metadata_unchanged': True, 'table_width_intent_only': [80, 350],
                                    'before_new_old_mapping_sha256': digest(before_mapping),
                                    'after_new_old_mapping_sha256': digest(after_mapping),
                                    'page_metadata_sha256': digest({k: page[k] for k in ('properties', 'cover', 'icon')})})
    except (Blocked, KeyError, TypeError, ValueError) as error:
        report['reason'] = str(error) if isinstance(error, Blocked) else 'Unsupported or conflicting snapshot structure'
    return report


def verify_precondition(proposal, snapshot):
    try:
        code, page_id, _ = identity(snapshot)
    except (Blocked, TypeError, ValueError):
        return False
    return (proposal.get('status') == 'PROPOSED_LOCAL_ONLY' and proposal.get('code') == code
            and proposal.get('page_id') == page_id and proposal.get('source_snapshot_sha256') == digest(snapshot))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, nargs='+')
    parser.add_argument('--template', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.resolve() in {p.resolve() for p in [*args.input, *([args.template] if args.template else [])]}:
        parser.error('Output must not overwrite any input or template snapshot')
    def load(path):
        if path.stat().st_size > 8_000_000:
            raise ValueError('Snapshot exceeds supported local size')
        return json.loads(path.read_text(encoding='utf-8-sig'))
    template = load(args.template) if args.template else None
    results = [{'input': str(path), **plan(load(path), template)} for path in args.input]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Local reports: ' + str(len(results)) + '; blocked: ' + str(sum(r['status'] == 'BLOCKED' for r in results)))


if __name__ == '__main__':
    main()
