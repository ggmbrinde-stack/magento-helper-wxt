"""Read-only native snapshots and conservative lossless region checks."""
import copy
import hashlib
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

import rendered_layout as r

SOURCE = 'NOTION_NATIVE_API_V1'
API_VERSION = '2025-09-03'
COMMON = {'object', 'id', 'parent', 'created_time', 'last_edited_time', 'created_by',
          'last_edited_by', 'has_children', 'archived', 'in_trash', 'type'}
FIELDS = {
    'paragraph': {'rich_text', 'color'}, 'bulleted_list_item': {'rich_text', 'color'},
    'numbered_list_item': {'rich_text', 'color'}, 'to_do': {'rich_text', 'color', 'checked'},
    'heading_1': {'rich_text', 'color', 'is_toggleable'},
    'heading_2': {'rich_text', 'color', 'is_toggleable'},
    'heading_3': {'rich_text', 'color', 'is_toggleable'},
    'toggle': {'rich_text', 'color'}, 'callout': {'rich_text', 'color', 'icon'},
    'column_list': set(), 'column': {'width_ratio'},
    'table': {'table_width', 'has_column_header', 'has_row_header'},
    'table_row': {'cells'}, 'image': {'type', 'file', 'external', 'caption'},
}


def identity(value):
    return uuid.UUID(value).hex


def exact_keys(value, allowed):
    if not isinstance(value, dict) or set(value) - allowed:
        raise ValueError('Unknown native attributes')


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_manifest(path, implementation):
    path = Path(path).resolve()
    manifest = json.loads(path.read_text(encoding='utf-8'))
    exact_keys(manifest, {'source', 'implementation_sha256', 'pages', 'synthetic'})
    if manifest.get('source') != SOURCE or manifest.get('implementation_sha256') != implementation:
        raise ValueError('Native manifest provenance/implementation mismatch')
    pages = {}
    for code, entry in manifest['pages'].items():
        exact_keys(entry, {'path', 'sha256'})
        target = (path.parent / entry['path']).resolve()
        if not target.is_relative_to(path.parent) or file_hash(target) != entry['sha256']:
            raise ValueError('Native response file escaped manifest or changed')
        snapshot = json.loads(target.read_text(encoding='utf-8'))
        validate(snapshot)
        if snapshot.get('synthetic', False) != manifest.get('synthetic', False):
            raise ValueError('Native fixture provenance differs')
        pages[code] = snapshot
    return manifest, pages


def validate(snapshot, page_id=None, nonce=None):
    exact_keys(snapshot, {'source', 'api_version', 'page_id', 'nonce', 'before', 'after',
                          'reads', 'confirmation_reads', 'synthetic', 'started_at', 'finished_at'})
    if snapshot.get('source') != SOURCE or snapshot.get('api_version') != API_VERSION:
        raise ValueError('Unknown native source/version')
    page = identity(snapshot['page_id'])
    if page_id is not None and page != identity(page_id):
        raise ValueError('Native page identity mismatch')
    if nonce is not None and snapshot.get('nonce') != nonce:
        raise ValueError('Native read does not belong to this operation')
    for value in (snapshot['before'], snapshot['after']):
        if (value.get('object') != 'page' or identity(value['id']) != page
                or value.get('archived') or value.get('in_trash')
                or not value.get('last_edited_time')):
            raise ValueError('Invalid native page')
        parent = value.get('parent', {})
        if (parent.get('type') != 'data_source_id'
                or identity(parent.get('data_source_id', '')) != '431b6705ae1f83dbb71c0739778f9e1a'):
            raise ValueError('Native page is outside exact Working Copy')
    if snapshot['before'] != snapshot['after']:
        raise ValueError('Native page changed during traversal')
    pending = list(snapshot['reads'])
    seen = set()

    def children(parent, depth=0):
        if depth > 40:
            raise ValueError('Native nesting limit')
        blocks, cursor, cursors = [], None, set()
        while True:
            if not pending:
                raise ValueError('Missing native pagination/child read')
            read = pending.pop(0)
            exact_keys(read, {'parent_id', 'start_cursor', 'response'})
            if identity(read['parent_id']) != parent or read['start_cursor'] != cursor:
                raise ValueError('Native cursor chain/parent differs')
            response = read['response']
            exact_keys(response, {'object', 'results', 'has_more', 'next_cursor', 'type', 'block', 'request_id'})
            if response.get('object') != 'list' or type(response.get('has_more')) is not bool:
                raise ValueError('Failed native children response')
            blocks.extend(response['results'])
            if not response['has_more']:
                if response.get('next_cursor') is not None:
                    raise ValueError('Nonterminal native cursor')
                break
            cursor = response.get('next_cursor')
            if not isinstance(cursor, str) or not cursor or cursor in cursors:
                raise ValueError('Missing/repeated cursor')
            cursors.add(cursor)
        result = []
        for block in blocks:
            kind = block.get('type')
            if kind not in FIELDS:
                raise ValueError('Unsupported native block type')
            exact_keys(block, COMMON | {kind})
            exact_keys(block[kind], FIELDS[kind])
            block_id = identity(block['id'])
            parent_key = 'page_id' if parent == page else 'block_id'
            if (block_id in seen or block_id == page or block.get('object') != 'block'
                    or block.get('parent') != {'type': parent_key, parent_key: str(uuid.UUID(parent))}
                    or type(block.get('has_children')) is not bool
                    or not block.get('last_edited_time') or block.get('archived') or block.get('in_trash')):
                raise ValueError('Duplicate/wrong-parent/inactive native block')
            seen.add(block_id)
            if len(seen) > 10000:
                raise ValueError('Native block limit')
            result.append({'block': copy.deepcopy(block),
                           'children': children(block_id, depth + 1) if block['has_children'] else []})
        return result

    tree = children(page)
    if pending:
        raise ValueError('Unaccounted native response')
    pending = list(snapshot['confirmation_reads'])
    seen.clear()
    confirmed = children(page)
    if pending or tree != confirmed:
        raise ValueError('Native descendants changed during traversal')
    return tree


def plain_rich(values):
    text = []
    for value in values:
        exact_keys(value, {'type', 'text', 'annotations', 'plain_text', 'href'})
        if value.get('type') != 'text':
            raise ValueError('Native mention/equation cannot round-trip')
        exact_keys(value['text'], {'content', 'link'})
        annotations = value.get('annotations', {})
        exact_keys(annotations, {'bold', 'italic', 'strikethrough', 'underline', 'code', 'color'})
        if (value['text'].get('link') or value.get('href')
                or annotations.get('color', 'default') != 'default'):
            raise ValueError('Styled native text requires a reviewed round-trip mapping')
        content = value['text']['content']
        if value.get('plain_text', content) != content:
            raise ValueError('Conflicting native rich text')
        add_text(text, content, sorted(k for k in ('bold', 'italic', 'strikethrough', 'underline', 'code') if annotations.get(k)))
    return text


def add_text(result, text, flags):
    if not text:
        return
    if result and result[-1][1] == flags:
        result[-1][0] += text
    else:
        result.append([text, flags])


def plain_mcp(text):
    text = text.replace('\\|', '|')
    if re.search(r'\*\*|__|\[.*\]\(|\x60', text):
        raise ValueError('Styled MCP text requires a reviewed round-trip mapping')
    names = {'b': 'bold', 'i': 'italic', 'u': 'underline', 's': 'strikethrough', 'code': 'code'}
    class Inline(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.stack, self.result = [], []
        def handle_starttag(self, tag, attrs):
            if attrs or tag not in set(names) | {'br', 'p'}:
                raise ValueError('Unsupported inline attributes')
            if tag == 'br':
                self.handle_data('\n')
            elif tag != 'p':
                self.stack.append(tag)
        def handle_endtag(self, tag):
            if tag == 'p':
                return
            if not self.stack or self.stack.pop() != tag:
                raise ValueError('Unbalanced inline text')
        def handle_startendtag(self, tag, attrs):
            self.handle_starttag(tag, attrs)
            if tag not in ('br', 'p'):
                self.handle_endtag(tag)
        def handle_data(self, value):
            add_text(self.result, value, sorted({names[t] for t in self.stack}))
        def handle_comment(self, data):
            raise ValueError('Unsupported inline comment')
        def handle_decl(self, data):
            raise ValueError('Unsupported inline declaration')
    parser = Inline()
    parser.feed(text)
    parser.close()
    if parser.stack:
        raise ValueError('Unclosed inline text')
    return parser.result


def semantic_native(node):
    block, children = node['block'], node['children']
    kind, data = block['type'], block[block['type']]
    if data.get('color', 'default') != 'default':
        raise ValueError('Native block color cannot round-trip')
    if kind == 'column_list':
        if len(children) != 2 or any(c['block']['type'] != 'column' for c in children):
            raise ValueError('Expected two native columns')
        return ['columns', [semantic_native(c) for c in children]]
    if kind == 'column':
        if data.get('width_ratio') != .5:
            raise ValueError('Unsupported native column ratio')
        return ['column', [semantic_native(c) for c in children]]
    if kind == 'table':
        if not data['has_column_header'] or data['has_row_header'] or not children:
            raise ValueError('Unsupported native table headers')
        rows = []
        for row in children:
            if row['block']['type'] != 'table_row' or row['children']:
                raise ValueError('Unsupported native row')
            cells = row['block']['table_row']['cells']
            if len(cells) != data['table_width']:
                raise ValueError('Native table width mismatch')
            rows.append([plain_rich(cell) for cell in cells])
        return ['table', rows]
    if kind.startswith('heading_'):
        if data.get('is_toggleable'):
            return ['toggle', int(kind[-1]), plain_rich(data['rich_text']), [semantic_native(c) for c in children]]
        if children:
            raise ValueError('Toggleable heading is not supported')
        return ['heading', int(kind[-1]), plain_rich(data['rich_text'])]
    if kind in ('paragraph', 'bulleted_list_item'):
        if children:
            raise ValueError('Nested text is not supported')
        return [kind, plain_rich(data['rich_text'])]
    if kind == 'toggle':
        return ['toggle', None, plain_rich(data['rich_text']), [semantic_native(c) for c in children]]
    if kind == 'to_do' and not children and type(data.get('checked')) is bool:
        return ['todo', data['checked'], plain_rich(data['rich_text'])]
    if kind == 'callout':
        icon = data.get('icon')
        if icon is not None and (set(icon) != {'type', 'emoji'} or icon['type'] != 'emoji'):
            raise ValueError('Unsupported callout icon')
        return ['callout', icon['emoji'] if icon else None, plain_rich(data['rich_text']),
                [semantic_native(c) for c in children]]
    raise ValueError('Native replacement contains unsupported structure')


def semantic_mcp(node):
    kind = node.kind
    if kind in ('columns', 'column'):
        allowed = {'ratio'} if kind == 'column' else set()
        if set(node.attrs) - allowed or node.attrs.get('ratio', '50') != '50':
            raise ValueError('Unsupported MCP columns')
        return [kind, [semantic_mcp(c) for c in node.items]]
    if kind == 'table':
        if (set(node.attrs) - {'fit-page-width', 'header-row', 'header-column'}
                or node.attrs.get('header-row', 'true') != 'true'
                or node.attrs.get('header-column', 'false') != 'false'
                or any(node.row_attrs) or any(any(row) for row in node.cell_attrs)
                or any(set(c) - {'width'} for c in node.col_attrs)):
            raise ValueError('Unsupported MCP table attributes')
        return ['table', [[plain_mcp(c) for c in row] for row in node.rows]]
    if kind == 'heading':
        match = re.fullmatch(r'(#{1,3}) (.*)', node.raw)
        if not match or node.attrs:
            raise ValueError('Unsupported MCP heading')
        return ['heading', len(match[1]), plain_mcp(match[2])]
    if kind in ('paragraph', 'p'):
        if node.attrs:
            raise ValueError('Unsupported MCP paragraph')
        if node.raw.startswith('- '):
            if '\n' in node.raw:
                raise ValueError('Grouped bullets require explicit mapping')
            return ['bulleted_list_item', plain_mcp(node.raw[2:])]
        return ['paragraph', plain_mcp(node.raw)]
    if kind == 'todo':
        match = re.fullmatch(r'- \[([ xX])\] (.*)', node.raw)
        if not match:
            raise ValueError('Unsupported todo representation')
        return ['todo', match[1].lower() == 'x', plain_mcp(match[2])]
    if kind == 'toggle' and set(node.attrs) <= {'heading'} and node.items:
        heading = node.attrs.get('heading')
        if heading not in (None, 'h1', 'h2', 'h3'):
            raise ValueError('Unsupported toggle heading')
        return ['toggle', int(heading[-1]) if heading else None, plain_mcp(node.items[0].raw),
                [semantic_mcp(c) for c in node.items[1:]]]
    if kind == 'callout' and set(node.attrs) <= {'icon'} and node.items:
        return ['callout', node.attrs.get('icon'), plain_mcp(node.items[0].raw),
                [semantic_mcp(c) for c in node.items[1:]]]
    raise ValueError('MCP replacement contains unsupported structure')


def proof(state, snapshot):
    tree = validate(snapshot, state['page_id'])
    if snapshot['after']['last_edited_time'] != state['page_last_edited_at']:
        raise ValueError('Native/MCP edit state differs')
    if len(tree) != len(r.parse(state['body'], allow_styled_notes=True)):
        raise ValueError('Native/MCP top-level coverage differs')
    return {'source': SOURCE, 'snapshot': snapshot, 'snapshot_sha256': r.digest(snapshot),
            'page_id': state['page_id'], 'source_state_sha256': state['source_state_sha256']}


def operation(before, payload, evidence):
    snapshot = evidence['snapshot']
    if r.digest(snapshot) != evidence['snapshot_sha256']:
        raise ValueError('Native snapshot digest mismatch')
    tree = validate(snapshot, payload['page_id'])
    expected_before = evidence.get('expected_before', [{'preserved': n} for n in tree])
    nodes = r.parse(before, allow_styled_notes=True)
    if len(nodes) != len(expected_before):
        raise ValueError('Native top-level binding differs')
    if payload['command'] == 'insert_content':
        expected = expected_before + [
            {'semantic': semantic_mcp(n)} for n in r.parse(payload['content'], allow_styled_notes=True)]
        return {'eligible': True, 'basis': 'EXACT_REVIEWED_NATIVE_API_REGION',
                'native_before_sha256': r.digest(tree), 'expected_native': expected,
                'snapshot_sha256': r.digest(snapshot), 'page_id': payload['page_id'],
                'source_page_state_sha256': evidence['source_state_sha256'],
                'append_sha256': r.digest(payload['content']), 'global_export_claimed': False}
    if payload['command'] == 'update_properties':
        return {'expected_native': expected_before}
    edit = payload['content_updates'][0]
    if before.count(edit['old_str']) != 1:
        raise ValueError('Ambiguous native replacement')
    start = before.index(edit['old_str'])
    end = start + len(edit['old_str'])
    indices = [i for i, n in enumerate(nodes) if start <= n.start and n.end <= end]
    if not indices or indices != list(range(indices[0], indices[-1] + 1)):
        raise ValueError('Native replacement is not contiguous')
    selected = [nodes[i] for i in indices]
    if before[start:selected[0].start].strip() or before[selected[-1].end:end].strip():
        raise ValueError('Native replacement crosses block boundary')
    for i in indices:
        native_semantic = (semantic_native(expected_before[i]['preserved'])
                           if 'preserved' in expected_before[i] else expected_before[i]['semantic'])
        if native_semantic != semantic_mcp(nodes[i]):
            raise ValueError('Native/MCP region differs or is lossy')
    replacement = [semantic_mcp(n) for n in r.parse(edit['new_str'], allow_styled_notes=True)]
    expected = (expected_before[:indices[0]]
                + [{'semantic': n} for n in replacement]
                + expected_before[indices[-1] + 1:])
    return {'eligible': True, 'basis': 'EXACT_REVIEWED_NATIVE_API_REGION',
            'native_before_sha256': r.digest(tree), 'expected_native': expected,
            'snapshot_sha256': r.digest(snapshot), 'page_id': payload['page_id'],
            'source_page_state_sha256': evidence['source_state_sha256'],
            'old_sha256': r.digest(edit['old_str']), 'new_sha256': r.digest(edit['new_str']),
            'global_export_claimed': False}


def verify_after(snapshot, expected, page_id, nonce):
    tree = validate(snapshot, page_id, nonce)
    if len(tree) != len(expected):
        raise ValueError('Native postwrite block count differs')
    for actual, wanted in zip(tree, expected):
        if 'preserved' in wanted:
            if actual != wanted['preserved']:
                raise ValueError('Native protected block changed')
        elif semantic_native(actual) != wanted['semantic']:
            raise ValueError('Native saved structure differs')
    return tree


def collect(page_id, nonce, get=None):
    """GET-only traversal. No endpoint or credential comes from page content."""
    page_id = identity(page_id)
    if not re.fullmatch('[a-f0-9]{32}', nonce):
        raise ValueError('Missing native request nonce')
    if get is None:
        token = os.environ.get('NOTION_TOKEN')
        if not token:
            raise ValueError('Read-only native credential is unavailable')
        def get(path):
            request = urllib.request.Request('https://api.notion.com/v1/' + path,
                headers={'Authorization': 'Bearer ' + token, 'Notion-Version': API_VERSION}, method='GET')
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    raw = response.read(20_000_001)
                if len(raw) > 20_000_000:
                    raise ValueError('Native response too large')
                return json.loads(raw)
            except Exception:
                raise ValueError('Native GET failed; no write attempted') from None
    started_at = datetime.now(timezone.utc).isoformat()
    before = get('pages/' + page_id)
    reads, visited = [], set()
    def descend(parent, depth=0):
        if depth > 40 or parent in visited or len(visited) >= 10000:
            raise ValueError('Native traversal cycle/limit')
        visited.add(parent)
        cursor, cursors, blocks = None, set(), []
        while True:
            query = '?page_size=100' + ('&start_cursor=' + urllib.parse.quote(cursor, safe='') if cursor else '')
            response = get('blocks/' + parent + '/children' + query)
            reads.append({'parent_id': parent, 'start_cursor': cursor, 'response': response})
            blocks.extend(response['results'])
            if response.get('has_more') is False:
                break
            cursor = response.get('next_cursor')
            if not isinstance(cursor, str) or not cursor or cursor in cursors:
                raise ValueError('Native pagination incomplete')
            cursors.add(cursor)
        for block in blocks:
            if block.get('has_children'):
                descend(identity(block['id']), depth + 1)
    descend(page_id)
    first_reads = reads
    reads, visited = [], set()
    descend(page_id)
    snapshot = {'source': SOURCE, 'api_version': API_VERSION, 'page_id': page_id,
                'nonce': nonce, 'before': before, 'after': get('pages/' + page_id),
                'reads': first_reads, 'confirmation_reads': reads,
                'started_at': started_at, 'finished_at': datetime.now(timezone.utc).isoformat()}
    validate(snapshot, page_id, nonce)
    if re.search(r'X-Amz-|[?&](?:token|signature)=', json.dumps(snapshot), re.I):
        raise ValueError('Native signed media cannot be persisted in this candidate')
    return snapshot
