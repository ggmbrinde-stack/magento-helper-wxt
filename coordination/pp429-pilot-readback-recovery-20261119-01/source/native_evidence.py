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
REVIEWED_PRODUCER = '18e250a02fd40c0b9945893055678c9d662790ae9c3488850b6048141020ba9f'
REVIEWED_MANIFEST = '50702d15400a406e0048b2602799b2eb5f1c88bd0663b3c63fd6e50cdf5d7254'
RECOVERY_PRODUCER = '62cd6a3262e89f25c38d339c2798827445e790a5fae2d717aa0cc5bf4b85a444'
RECOVERY_MANIFEST = 'b701ef8f9afb34d944939bf6ab4736801cd9df4ab8dc616a2409d15a5a733083'
EMPTY_TAIL = 'PP429_BODY1_FIRST_NEW_COLUMN_EMPTY_TAIL_V1'
API_VERSION = '2025-09-03'
PERSISTENCE = 'NATIVE_HOSTED_FILE_LOCATORS_SHA256_V1'
FILE_LOCATOR = 'notion-native-file-locator-sha256:'
FILE_HOSTS = {'prod-files-secure.s3.us-west-2.amazonaws.com', 'secure.notion-static.com'}
AUTH_QUERY = {'x-amz-algorithm', 'x-amz-credential', 'x-amz-date', 'x-amz-expires',
              'x-amz-security-token', 'x-amz-signature', 'x-amz-signedheaders', 'x-amz-content-sha256'}
COMMON = {'object', 'id', 'parent', 'created_time', 'last_edited_time', 'created_by',
          'last_edited_by', 'has_children', 'archived', 'in_trash', 'type'}
FIELDS = {
    'paragraph': {'rich_text', 'color', 'icon'}, 'bulleted_list_item': {'rich_text', 'color'},
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


def canonical_file(value, persisted=False):
    """Fingerprint a recognised object locator, not file bytes or a stable API file ID."""
    value = copy.deepcopy(value)
    if not isinstance(value, dict) or value.get('type') != 'file':
        return value
    file = value.get('file')
    exact_keys(file, {'url', 'expiry_time'})
    url = file.get('url')
    if persisted:
        if (not isinstance(url, str) or not re.fullmatch(re.escape(FILE_LOCATOR) + '[a-f0-9]{64}', url)
                or 'expiry_time' in file):
            raise ValueError('Invalid canonical hosted-file locator')
        return value
    if not isinstance(url, str):
        raise ValueError('Missing hosted-file locator')
    parts = urllib.parse.urlsplit(url)
    if (parts.scheme != 'https' or parts.hostname not in FILE_HOSTS or parts.username
            or parts.password or parts.port is not None or parts.fragment):
        raise ValueError('Hosted-file identity unavailable: unrecognised locator; region remains blocked')
    path = parts.path.split('/')[1:]
    count = 2 if parts.hostname.startswith('prod-files-secure.') else 1
    if len(path) != count + 1 or not path[-1]:
        raise ValueError('Hosted-file identity unavailable: unrecognised object path')
    for segment in path[:count]:
        identity(segment)
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True, strict_parsing=True)
    if len({key.lower() for key, _ in query}) != len(query):
        raise ValueError('Ambiguous hosted-file query')
    if any(key.lower() not in AUTH_QUERY | {'versionid', 'x-id', 'x-amz-checksum-mode'} for key, _ in query):
        raise ValueError('Hosted-file identity unavailable: unsupported query fields')
    query = [(key, item) for key, item in query if key.lower() not in AUTH_QUERY]
    locator = urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path,
                                     urllib.parse.urlencode(query), ''))
    expiry = file.get('expiry_time')
    if expiry is not None and (not isinstance(expiry, str)
            or datetime.fromisoformat(expiry.replace('Z', '+00:00')).tzinfo is None):
        raise ValueError('Invalid hosted-file expiry metadata')
    value['file'] = {'url': FILE_LOCATOR + hashlib.sha256(locator.encode('utf-8')).hexdigest()}
    return value


def canonical_page(page, persisted=False):
    page = copy.deepcopy(page)
    page.pop('request_id', None)
    for name in ('cover', 'icon'):
        if name in page: page[name] = canonical_file(page[name], persisted)
    for prop in page.get('properties', {}).values():
        if prop.get('type') == 'files':
            prop['files'] = [canonical_file(file, persisted) for file in prop['files']]
    return page


def canonical_block(block, persisted=False):
    block = copy.deepcopy(block)
    if block.get('type') == 'image':
        block['image'] = canonical_file(block['image'], persisted)
    elif block.get('type') == 'callout' and 'icon' in block['callout']:
        block['callout']['icon'] = canonical_file(block['callout']['icon'], persisted)
    return block


def for_storage(snapshot):
    """Explicit canonical evidence; no signed URL or raw-response hash is persisted."""
    snapshot = copy.deepcopy(snapshot)
    snapshot['persistence_policy'] = PERSISTENCE
    for name in ('before', 'after'): snapshot[name] = canonical_page(snapshot[name])
    for name in ('reads', 'confirmation_reads'):
        for read in snapshot[name]:
            read['response']['results'] = [canonical_block(block) for block in read['response']['results']]
    if re.search(r'X-Amz-|[?&](?:token|signature)=', json.dumps(snapshot), re.I):
        raise ValueError('Temporary URL outside recognised hosted-file fields cannot be persisted')
    return snapshot


def read_manifest(path, implementation):
    path = Path(path).resolve()
    manifest = json.loads(path.read_text(encoding='utf-8'))
    exact_keys(manifest, {'source', 'implementation_sha256', 'pages', 'synthetic'})
    import batch_plan
    inherited = ((manifest.get('implementation_sha256'), file_hash(path)) in (
                    (REVIEWED_PRODUCER, REVIEWED_MANIFEST), (RECOVERY_PRODUCER, RECOVERY_MANIFEST))
                 and manifest.get('synthetic') is False
                 and implementation == batch_plan.implementation_sha())
    if manifest.get('source') != SOURCE or (manifest.get('implementation_sha256') != implementation and not inherited):
        raise ValueError('Native manifest provenance/implementation mismatch')
    pages = {}
    for code, entry in manifest['pages'].items():
        exact_keys(entry, {'path', 'sha256'})
        target = (path.parent / entry['path']).resolve()
        if not target.is_relative_to(path.parent) or file_hash(target) != entry['sha256']:
            raise ValueError('Native response file escaped manifest or changed')
        snapshot = json.loads(target.read_text(encoding='utf-8'))
        if re.search(r'X-Amz-|[?&](?:token|signature)=', json.dumps(snapshot), re.I):
            raise ValueError('Native manifest contains unsafe temporary URLs')
        validate(snapshot, expected_code=code if not manifest.get('synthetic', False) else None)
        if snapshot.get('synthetic', False) != manifest.get('synthetic', False):
            raise ValueError('Native fixture provenance differs')
        pages[code] = snapshot
    return manifest, pages


def validate_page(value, page, expected_code=None):
    if (value.get('object') != 'page' or identity(value['id']) != page
            or value.get('archived') or value.get('in_trash')
            or not value.get('last_edited_time')):
        raise ValueError('Invalid native page')
    parent = value.get('parent', {})
    if (parent.get('type') != 'data_source_id'
            or identity(parent.get('data_source_id', '')) != '431b6705ae1f83dbb71c0739778f9e1a'):
        raise ValueError('Native page is outside exact Working Copy')
    if expected_code is not None:
        prop = value.get('properties', {}).get('Código PP', {})
        if prop.get('type') != 'rich_text' or ''.join(part[0] for part in plain_rich(prop['rich_text'])) != expected_code:
            raise ValueError('Native business code differs from selected inventory code')


def validate(snapshot, page_id=None, nonce=None, expected_code=None):
    exact_keys(snapshot, {'source', 'api_version', 'page_id', 'nonce', 'before', 'after',
                          'reads', 'confirmation_reads', 'synthetic', 'started_at', 'finished_at', 'persistence_policy'})
    policy = snapshot.get('persistence_policy')
    if policy not in (None, PERSISTENCE):
        raise ValueError('Unknown native persistence policy')
    if snapshot.get('source') != SOURCE or snapshot.get('api_version') != API_VERSION:
        raise ValueError('Unknown native source/version')
    page = identity(snapshot['page_id'])
    if page_id is not None and page != identity(page_id):
        raise ValueError('Native page identity mismatch')
    if nonce is not None and snapshot.get('nonce') != nonce:
        raise ValueError('Native read does not belong to this operation')
    for value in (snapshot['before'], snapshot['after']):
        validate_page(value, page, expected_code)
    if canonical_page(snapshot['before'], bool(policy)) != canonical_page(snapshot['after'], bool(policy)):
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
            if kind == 'paragraph' and block[kind].get('icon') is not None:
                raise ValueError('Unsupported native paragraph icon')
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
            result.append({'block': canonical_block(block, bool(policy)),
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
    text = re.sub(r'\\([\\_|])', r'\1', text)
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
        if kind == 'paragraph':
            exact_keys(data, FIELDS[kind])
            if data.get('icon') is not None:
                raise ValueError('Unsupported native paragraph icon')
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


def mcp_children(nodes):
    result = []
    for node in nodes:
        if node.kind == 'paragraph' and '\n' in node.raw and node.raw.startswith('- '):
            lines = node.raw.splitlines()
            if node.attrs or any(not line.startswith('- ') or not line[2:] for line in lines):
                raise ValueError('Ambiguous grouped MCP bullets')
            result.extend(['bulleted_list_item', plain_mcp(line[2:])] for line in lines)
        else:
            result.append(semantic_mcp(node))
    return result


def mcp_nodes(body):
    """Expand explicit top-level bullets without losing their source boundaries."""
    result = []
    for node in r.parse(body, allow_styled_notes=True):
        if node.kind == 'paragraph' and '\n' in node.raw and node.raw.startswith('- '):
            mcp_children([node])  # The same conservative grammar used inside containers.
            start = node.start
            for line in node.raw.splitlines(keepends=True):
                raw = line.rstrip('\r\n')
                result.append(r.Node('paragraph', raw, start, start + len(raw)))
                start += len(line)
        else:
            result.append(node)
    return result


def semantic_mcp(node):
    kind = node.kind
    if kind in ('columns', 'column'):
        allowed = {'ratio'} if kind == 'column' else set()
        if set(node.attrs) - allowed or node.attrs.get('ratio', '50') != '50':
            raise ValueError('Unsupported MCP columns')
        return [kind, mcp_children(node.items)]
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
                mcp_children(node.items[1:])]
    if kind == 'callout' and set(node.attrs) <= {'icon'} and node.items:
        return ['callout', node.attrs.get('icon'), plain_mcp(node.items[0].raw),
                mcp_children(node.items[1:])]
    raise ValueError('MCP replacement contains unsupported structure')


def mcp_file_locator(url, page_id):
    parts = urllib.parse.urlsplit(url)
    if parts.fragment:
        path = parts.path.split('/')[1:]
        if (parts.hostname != 'prod-files-secure.s3.us-west-2.amazonaws.com' or len(path) != 3
                or parts.fragment != 'notion_record=block.' + str(uuid.UUID(page_id)) + '.' + path[0]
                or path[0] != str(uuid.UUID(path[0]))):
            raise ValueError('Unknown MCP hosted-file record fragment')
        # This exact observed tag binds the page and workspace; it is not an object locator.
        parts = parts._replace(fragment='')
    canonical = canonical_file({'type':'file','file':{'url':urllib.parse.urlunsplit(parts)}})
    return canonical['file']['url'], parts


def metadata_matches(state, page):
    def text(values):
        parts = plain_rich(values)
        if any(flags for _, flags in parts):
            raise ValueError('Styled native property cannot be bound to MCP')
        return ''.join(value for value, _ in parts)
    wanted = {}
    for name, prop in page['properties'].items():
        kind = prop['type']; value = prop[kind]
        if kind in ('title', 'rich_text'): value = text(value)
        elif kind == 'multi_select': value = [item['name'] for item in value]
        elif kind == 'select': value = value['name'] if value else None
        elif kind == 'files': value = [item[item['type']]['url'] for item in value]
        elif kind != 'number': raise ValueError('Unsupported native property binding')
        wanted[name] = value
    actual = copy.deepcopy(state['properties'])
    file_links = []
    if r.notion_url_id(actual.pop('url', '')) != state['page_id']:
        raise ValueError('MCP property URL differs')
    for name, value in actual.items():
        if name not in wanted: raise ValueError('Unknown MCP property binding')
        kind = page['properties'][name]['type']
        if kind in ('title', 'rich_text'): actual[name] = re.sub(r'\\([\\_|])', r'\1', value)
        elif kind == 'files':
            links = [mcp_file_locator(url, state['page_id']) for url in value]
            file_links.extend(links)
            actual[name] = [locator for locator, _ in links]
    for name, value in wanted.items():
        observed = actual.get(name)
        if name not in actual and value in (None, '', []): continue
        if page['properties'][name]['type'] == 'multi_select' and isinstance(observed, list):
            if sorted(value) == sorted(observed): continue
        if value != observed: raise ValueError('Native/MCP property differs: '+name)
    for name in ('cover', 'icon'):
        value = copy.deepcopy(state.get(name))
        if value and value.get('type') == 'file':
            link = mcp_file_locator(value['file']['url'], state['page_id'])
            file_links.append(link)
            value['file'] = {'url':link[0]}
        if name not in state or value != page.get(name):
            raise ValueError('Native/MCP '+name+' differs')
    return file_links


def protected_image(node, item, file_links):
    block = item['block']
    if (block['type'] != 'image' or item['children'] or node.attrs.keys() != {'source'}
            or not re.fullmatch(r'<image\s+source="[^"]+"\s*/>', node.raw)
            or block['image'].get('type') != 'file' or block['image'].get('caption') != []):
        raise ValueError('Unsupported protected image representation or caption')
    source = urllib.parse.urlsplit(node.attrs['source'])
    query = urllib.parse.parse_qsl(source.query, strict_parsing=True)
    if (source.scheme != 'notion-file-block' or source.fragment or len(query) != 2
            or len(dict(query)) != 2 or set(dict(query)) != {'space_id','name'}
            or source.netloc != str(uuid.UUID(block['id']))):
        raise ValueError('Protected image block reference differs')
    fields = dict(query)
    for locator, parts in file_links:
        path = parts.path.split('/')[1:]
        if (locator == block['image']['file']['url'] and len(path) == 3
                and parts.hostname == 'prod-files-secure.s3.us-west-2.amazonaws.com'
                and source.path == '/' + path[1] and fields['space_id'] == path[0]
                and fields['name'] == urllib.parse.unquote(path[2])):
            return {'block_id':block['id'],'source':node.attrs['source'],
                    'name':fields['name'],'caption':[], 'locator':locator,
                    'native_block_sha256':r.digest(item),'replacement_supported':False}
    raise ValueError('Protected image asset/name/workspace/locator differs')


def paired_state_matches(state, paired):
    for name in ('page_id','code','body','page_last_edited_at'):
        if state[name] != paired[name]: raise ValueError('Paired MCP '+name+' differs')
    if state['capture']['received_at_utc'] != paired['capture']['received_at_utc']:
        raise ValueError('Paired MCP receipt differs')
    def legacy(value):
        if isinstance(value, dict): return {key:legacy(item) for key,item in value.items()}
        if isinstance(value, list): return [legacy(item) for item in value]
        if isinstance(value, str) and value.startswith('https://'):
            parts = urllib.parse.urlsplit(value)
            if parts.hostname in FILE_HOSTS:
                mcp_file_locator(value, state['page_id'])
                return urllib.parse.urlunsplit(parts._replace(query='',fragment=''))
        return value
    for name in ('properties','cover','icon'):
        if state[name] != legacy(paired[name]):
            raise ValueError('Paired MCP legacy capture relation differs: '+name)


def proof(state, snapshot, paired_state=None):
    tree = validate(snapshot, state['page_id'], expected_code=state.get('code') if not snapshot.get('synthetic') else None)
    nodes = mcp_nodes(state['body'])
    if len(tree) != len(nodes):
        raise ValueError('Native/MCP top-level coverage differs')
    binding = 'EXACT_EDIT_TIMESTAMP'
    images = []
    if snapshot['after']['last_edited_time'] != state['page_last_edited_at']:
        native_time = datetime.fromisoformat(snapshot['after']['last_edited_time'].replace('Z', '+00:00'))
        mcp_time = datetime.fromisoformat(state['page_last_edited_at'].replace('Z', '+00:00'))
        if (native_time.tzinfo is None or mcp_time.tzinfo is None or native_time.second or native_time.microsecond
                or not 0 <= (mcp_time-native_time).total_seconds() < 60):
            raise ValueError('Native/MCP edit state differs')
        if paired_state is not None: paired_state_matches(state, paired_state)
        links = metadata_matches(paired_state or state, canonical_page(snapshot['after'], bool(snapshot.get('persistence_policy'))))
        for node, item in zip(nodes, tree):
            if node.kind == 'image':
                images.append(protected_image(node, item, links))
            elif semantic_mcp(node) != semantic_native(item):
                raise ValueError('Native/MCP full content differs within observed edit minute')
        binding = 'OBSERVED_MINUTE_PLUS_EXACT_CONTENT_AND_SUPPORTED_METADATA'
    return {'source': SOURCE, 'snapshot': snapshot, 'snapshot_sha256': r.digest(snapshot),
            'page_id': state['page_id'], 'source_state_sha256': state['source_state_sha256'],
            'edit_binding': binding, 'mcp_edited_at': state['page_last_edited_at'],
            'protected_images':images}


def operation(before, payload, evidence):
    snapshot = evidence['snapshot']
    if r.digest(snapshot) != evidence['snapshot_sha256']:
        raise ValueError('Native snapshot digest mismatch')
    tree = validate(snapshot, payload['page_id'])
    expected_before = evidence.get('expected_before', [{'preserved': n} for n in tree])
    nodes = mcp_nodes(before)
    if len(nodes) != len(expected_before):
        raise ValueError('Native top-level binding differs')
    if payload['command'] == 'insert_content':
        expected = expected_before + [{'semantic': value} for value in mcp_children(mcp_nodes(payload['content']))]
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
    replacement = mcp_children(mcp_nodes(edit['new_str']))
    expected = (expected_before[:indices[0]]
                + [{'semantic': n} for n in replacement]
                + expected_before[indices[-1] + 1:])
    return {'eligible': True, 'basis': 'EXACT_REVIEWED_NATIVE_API_REGION',
            'native_before_sha256': r.digest(tree), 'expected_native': expected,
            'snapshot_sha256': r.digest(snapshot), 'page_id': payload['page_id'],
            'source_page_state_sha256': evidence['source_state_sha256'],
            'old_sha256': r.digest(edit['old_str']), 'new_sha256': r.digest(edit['new_str']),
            'global_export_claimed': False}


def empty_tail_semantics(actual, wanted):
    """Comparison only: retain the real node and its metadata in every snapshot."""
    try:
        if (wanted[0] != 'columns' or len(wanted[1]) != 2 or actual[0] != 'columns'
                or len(actual[1]) != 2 or wanted[1][0][0] != 'column' or actual[1][0][0] != 'column'
                or len(wanted[1][0][1]) != 2 or len(actual[1][0][1]) != 3
                or wanted[1][0][1][0] != ['heading', 2, [['New (proposta)', []]]]
                or wanted[1][0][1][1][0] != 'table' or actual[1][0][1][-1] != ['paragraph', []]):
            return False
        compared = copy.deepcopy(actual)
        compared[1][0][1].pop()
        return compared == wanted
    except (IndexError, KeyError, TypeError):
        return False


def verify_after(snapshot, expected, page_id, nonce, normalization=None):
    if normalization not in (None, EMPTY_TAIL): raise ValueError('Unknown readback normalization')
    tree = validate(snapshot, page_id, nonce)
    if len(tree) != len(expected):
        raise ValueError('Native postwrite block count differs')
    for index, (actual, wanted) in enumerate(zip(tree, expected)):
        if 'preserved' in wanted:
            if actual != wanted['preserved']:
                raise ValueError('Native protected block changed')
        elif semantic_native(actual) != wanted['semantic']:
            allowed = False
            if normalization == EMPTY_TAIL and index == 7 and actual['block']['type'] == 'column_list':
                column = actual['children'][0]
                if len(column['children']) == 3:
                    tail = column['children'][-1]
                    block = tail['block']; data = block.get('paragraph', {})
                    allowed = (block['type'] == 'paragraph' and not block['has_children'] and not tail['children']
                        and data.get('rich_text') == [] and data.get('color', 'default') == 'default'
                        and data.get('icon') is None and empty_tail_semantics(semantic_native(actual), wanted['semantic']))
            if not allowed: raise ValueError('Native saved structure differs')
    return tree


def collect(page_id, nonce, get=None, *, expected_code=None):
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
    validate_page(before, page_id, expected_code)
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
    snapshot = for_storage(snapshot)
    validate(snapshot, page_id, nonce, expected_code)
    return snapshot
