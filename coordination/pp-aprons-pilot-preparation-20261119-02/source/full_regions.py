"""Bounded edits of supported leaf blocks; existing containers remain untouched."""
import re
import uuid

import rendered_layout as r

NAME = 'PP_FULL_CONVERSION'


def policy():
    return {'name': NAME, 'version': 1, 'existing_containers': 'PRESERVE_OR_EXACT_REVIEWED_UI_REGION',
            'leaf_contract': 'MCP_MARKDOWN_INLINE_TABLE_CELLS_AND_LEAF_BLOCKS',
            'native_comments': 'EXCLUDED_BY_EXPLICIT_HUMAN_POLICY',
            'body_notes_required': True, 'global_export_claimed': False,
            'fresh_read_before_each_operation': True}


def parse(body):
    return r.parse(body, allow_styled_notes=True)


def leaf(node):
    if node.kind == 'table':
        return all(not set(t.name for t in r.Lexer(cell).tags.values()) - r.INLINE
                   for row in node.rows for cell in row)
    if node.kind in ('image', 'heading'):
        return True
    if node.kind == 'paragraph':
        # Indented children/list hierarchies are not certified by a flat paragraph.
        return not re.search(r'(?m)^\s+(?:[-*+] |<|\d+\.)', node.raw)
    return False


def verified_container(node, state, bounded):
    if bounded and bounded.get('source') == 'NOTION_NATIVE_API_V1':
        import native_evidence as native
        if bounded['page_id'] != state['page_id']:
            return None
        tree = native.validate(bounded['snapshot'], state['page_id'])
        nodes = native.mcp_nodes(state['body'])
        indices = [i for i, candidate in enumerate(nodes) if candidate.raw == node.raw]
        if len(indices) != 1 or len(tree) != len(nodes):
            return None
        index = indices[0]
        if native.semantic_native(tree[index]) != native.semantic_mcp(node):
            return None
        return {'native_region_id': tree[index]['block']['id'],
                'source': native.SOURCE, 'snapshot_sha256': bounded['snapshot_sha256']}
    if not bounded or bounded.get('page_id') != state['page_id'] or bounded.get('global_export_claimed') is not False:
        return None
    matches = [x for x in bounded.get('regions', []) if x['kind'] == node.kind]
    def clean(text):
        return ' '.join(r.plain(text.replace('\\|', '|')).split())
    for observed in matches:
        if node.kind == 'callout':
            matched = len(node.items) == 1 and node.items[0].kind=='paragraph' and clean(node.items[0].raw) == clean(observed['text'])
        elif node.kind == 'toggle':
            values = [clean(line[2:]) for child in node.items[1:] for line in child.raw.splitlines() if line.startswith('- ')]
            matched = clean(node.title) == clean(observed['title']) and values == [clean(x) for x in observed['paragraphs']]
            matched = matched and len(values) == len(observed['children']) and observed['child_types'] == ['bulleted_list'] * len(values)
            matched = matched and all(child.kind=='paragraph' and all(not line.strip() or line.startswith('- ') for line in child.raw.splitlines()) for child in node.items[1:])
        elif node.kind == 'columns':
            from batch_plan import lines
            tables = [x for x in r.descend([node]) if x.kind == 'table']
            cells = [[[clean('\n'.join(lines(cell))) for cell in row] for row in t.rows] for t in tables]
            expected = [[[clean(cell) for cell in row] for row in t] for t in observed['tables']]
            matched = cells == expected and len(node.items) == len(observed['children']) == len(observed.get('column_children',[])) == 2 and all(n.kind=='column' for n in node.items)
            for column, children in zip(node.items, observed.get('column_children', [])):
                matched = matched and [n.kind for n in column.items] == [x['kind'] for x in children]
                matched = matched and all(clean(n.title) == clean(x['text']) for n, x in zip(column.items, children) if n.kind == 'heading')
        else:
            continue
        if matched:
            uuid.UUID(observed['id'])
            for identity in observed['children']: uuid.UUID(identity)
            return {'native_region_id': observed['id'], 'observation_sha256': r.digest(observed),
                    'source_region_sha256': r.digest(node.raw), 'source_page_state_sha256': bounded['source_state_sha256'],
                    'global_export_claimed': False}
    return None


def inspect(state, payload, bounded=None):
    if bounded and bounded.get('source') == 'NOTION_NATIVE_API_V1':
        import native_evidence
        return native_evidence.operation(state['body'], payload, bounded)
    body = state['body']
    if payload.get('command') == 'insert_content':
        if set(payload) != {'command', 'page_id', 'position', 'content'} or payload['position'] != {'type': 'end'}:
            raise ValueError('Só é permitido acrescentar o histórico revisto no fim')
        parse(payload['content'])
        return {'eligible': True, 'basis': 'APPEND_WITHOUT_CHANGING_EXISTING_BLOCKS',
                'body_sha256': r.digest(body), 'append_sha256': r.digest(payload['content']),
                'global_export_claimed': False}
    if set(payload) != {'command', 'page_id', 'content_updates'} or payload['command'] != 'update_content' or len(payload['content_updates']) != 1:
        raise ValueError('É necessária uma substituição exacta de um bloco suportado')
    edit = payload['content_updates'][0]
    if set(edit) != {'old_str', 'new_str', 'replace_all_matches'} or edit['replace_all_matches'] is not False:
        raise ValueError('Substituição sem âmbito exacto')
    old, new = edit['old_str'], edit['new_str']
    if not old or body.count(old) != 1:
        raise ValueError('Bloco original ausente ou repetido')
    start = body.index(old)
    left, right = start + len(old) - len(old.lstrip('\r\n')), start + len(old.rstrip('\r\n'))
    matches = [node for node in parse(body) if left <= node.start and node.end <= right]
    proofs = [verified_container(n, state, bounded) if not leaf(n) else None for n in matches]
    if (not matches or matches[0].start != left or matches[-1].end != right or
            any(not leaf(n) and not proof for n, proof in zip(matches, proofs))):
        raise ValueError('Contentor existente sem prova limitada de preservação; não será reescrito')
    parse(new)
    start = body.index(old)
    return {'eligible': True, 'basis': 'EXACT_REVIEWED_BROWSER_REGION' if any(proofs) else 'EXACT_TOP_LEVEL_SUPPORTED_LEAVES',
            'old_sha256': r.digest(old), 'new_sha256': r.digest(new),
            'prefix_sha256': r.digest(body[:start]), 'suffix_sha256': r.digest(body[start + len(old):]),
            'bounded_observations': [x for x in proofs if x], 'global_export_claimed': False}


def saved(before, after, payload):
    if payload['command'] == 'insert_content':
        expected = before + payload['content']
    else:
        edit = payload['content_updates'][0]
        if before.count(edit['old_str']) != 1:
            return False
        expected = before.replace(edit['old_str'], edit['new_str'], 1)
    # Notion may normalise whitespace between blocks. Every block and inline byte must agree.
    return [n.raw for n in parse(after)] == [n.raw for n in parse(expected)]
