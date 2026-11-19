"""Synthetic native fixtures only; no API requests or real page evidence."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import native_evidence as n
from native_session import NativeSession
import batch_apply as a
import rendered_layout as r

PAGE = '00000000000040008000000000000001'
TIME = '2026-11-19T12:00:00.000Z'


def rich(text):
    return [{'type': 'text', 'text': {'content': text, 'link': None},
             'plain_text': text, 'annotations': {'color': 'default'}}]


def fixture():
    counter = 1
    def block(kind, data, parent, children=None):
        nonlocal counter
        counter += 1
        block_id = uuid.UUID(int=counter, version=4).hex
        return {'block': {'object': 'block', 'id': str(uuid.UUID(block_id)),
            'parent': {'type': 'page_id' if parent == PAGE else 'block_id',
                       'page_id' if parent == PAGE else 'block_id': str(uuid.UUID(parent))},
            'type': kind, kind: data, 'has_children': bool(children),
            'last_edited_time': TIME, 'archived': False, 'in_trash': False}, 'children': children or []}
    review = block('callout', {'rich_text': rich('Review'), 'color': 'default', 'icon': None}, PAGE)
    review_id = n.identity(review['block']['id'])
    review['children'] = [block('paragraph', {'rich_text': rich(str(i)), 'color': 'default'}, review_id) for i in range(5)]
    review['block']['has_children'] = True
    content = block('paragraph', {'rich_text': rich('old'), 'color': 'default'}, PAGE)
    source = block('toggle', {'rich_text': rich('Source'), 'color': 'default'}, PAGE)
    return [review, content, source]


def snapshot(tree, nonce='a'*32, split=False):
    reads = []
    def add(parent, nodes):
        blocks = [copy.deepcopy(x['block']) for x in nodes]
        groups = [blocks[:1], blocks[1:]] if split and parent == PAGE else [blocks]
        for i, group in enumerate(groups):
            reads.append({'parent_id': parent, 'start_cursor': None if i == 0 else 'next',
                'response': {'object': 'list', 'results': group,
                    'has_more': i + 1 < len(groups), 'next_cursor': 'next' if i + 1 < len(groups) else None}})
        for node in nodes:
            if node['block']['has_children']:
                add(n.identity(node['block']['id']), node['children'])
    add(PAGE, tree)
    page = {'object': 'page', 'id': str(uuid.UUID(PAGE)), 'last_edited_time': TIME,
            'parent': {'type': 'data_source_id', 'data_source_id': '431b6705-ae1f-83db-b71c-0739778f9e1a'}}
    return {'source': n.SOURCE, 'api_version': n.API_VERSION, 'page_id': PAGE,
            'nonce': nonce, 'before': page, 'after': copy.deepcopy(page),
            'reads': reads, 'confirmation_reads': copy.deepcopy(reads), 'synthetic': True}


BODY = '<callout>\nReview\n\n0\n\n1\n\n2\n\n3\n\n4\n</callout>\n\nold\n\n<toggle>Source</toggle>'
PAYLOAD = {'command': 'update_content', 'page_id': PAGE,
           'content_updates': [{'old_str': 'old', 'new_str': 'new', 'replace_all_matches': False}]}


class NativeTests(unittest.TestCase):
    def test_full_renderer_native_path_preserves_existing_review(self):
        import full_conversion as f
        review = f.own_review([], '428')
        table = '<table header-row="true">\n<tr><td>Face / local</td><td>Options</td></tr>\n<tr><td>Pocket</td><td>Print</td></tr>\n</table>'
        body = review + '\n\n' + table + '\n\n<toggle>Fonte</toggle>'
        tree = fixture()
        target = tree[1]['block']
        target.pop('paragraph')
        target.update(type='table', table={'table_width': 2, 'has_column_header': True,
                                          'has_row_header': False}, has_children=True)
        tree[1]['children'] = []
        for i, cells in enumerate((['Face / local', 'Options'], ['Pocket', 'Print'])):
            tree[1]['children'].append({'block': {
                'object': 'block', 'id': str(uuid.UUID(int=100+i, version=4)),
                'parent': {'type': 'block_id', 'block_id': target['id']},
                'last_edited_time': TIME, 'type': 'table_row', 'has_children': False,
                'table_row': {'cells': [rich(cell) for cell in cells]}}, 'children': []})
        state = {'code': '428', 'page_id': PAGE, 'body': body, 'page_last_edited_at': TIME,
                 'source_state_sha256': 'state', 'properties': {}, 'cover': None, 'icon': None}
        evidence = n.proof(state, snapshot(tree))
        record = {'description': '', 'source': 'Synthetic!A1:B2', 'raw': [],
                  'groups': [{'locals': ['Pocket'], 'options': [{'original': 'Print'}]}]}
        desired, operations, proof = f.render(state, record,
            [{'locations': ['Pocket'], 'options': ['Print']}], [], 'offline-native', evidence)
        self.assertNotIn('blocked_region', proof)
        self.assertEqual(len(operations), 2)
        self.assertTrue(desired.startswith(review))
        self.assertTrue(all(op['region_evidence']['basis'] == 'EXACT_REVIEWED_NATIVE_API_REGION' for op in operations))
        self.assertNotIn(review, operations[0]['payload']['content_updates'][0]['old_str'])

    def test_columns_tables_cells_and_toggle_order(self):
        tree = fixture()
        block = tree[1]['block']
        block.pop('paragraph')
        block.update(type='column_list', column_list={}, has_children=True)
        children = []
        for index in range(2):
            column_id = str(uuid.UUID(int=100+index, version=4))
            table_id = str(uuid.UUID(int=200+index, version=4))
            def make(block_id, parent, kind, data, has_children):
                return {'block': {'object': 'block', 'id': block_id, 'type': kind, kind: data,
                    'parent': {'type': 'block_id', 'block_id': parent},
                    'has_children': has_children, 'last_edited_time': TIME}, 'children': []}
            column = make(column_id, block['id'], 'column', {'width_ratio': .5}, True)
            table = make(table_id, column_id, 'table',
                         {'table_width': 2, 'has_column_header': True, 'has_row_header': False}, True)
            for row_index, cells in enumerate((['Local', 'Options'], ['Pocket', 'Print'])):
                table['children'].append(make(str(uuid.UUID(int=300+index*10+row_index, version=4)),
                    table_id, 'table_row', {'cells': [rich(cell) for cell in cells]}, False))
            column['children'] = [table]
            children.append(column)
        tree[1]['children'] = children
        raw = '<columns>\n' + '\n'.join('<column ratio="50">\n| Local | Options |\n| --- | --- |\n| Pocket | Print |\n</column>' for _ in range(2)) + '\n</columns>'
        value = snapshot(tree, split=True)
        native = n.validate(value)[1]
        self.assertEqual(n.semantic_native(native), n.semantic_mcp(r.parse(raw)[0]))
        native['children'][0]['children'][0]['children'].reverse()
        self.assertNotEqual(n.semantic_native(native), n.semantic_mcp(r.parse(raw)[0]))

    def test_collector_scoped_gets_complete_recursive_pages(self):
        expected = snapshot(fixture(), split=True)
        reads = iter(expected['reads'] + expected['confirmation_reads'])
        calls = []
        def get(path):
            calls.append(path)
            if path.startswith('pages/'):
                return expected['before']
            read = next(reads)
            self.assertTrue(path.startswith('blocks/'+read['parent_id']+'/children?'))
            self.assertEqual('start_cursor=' in path, read['start_cursor'] is not None)
            return read['response']
        value = n.collect(PAGE, 'a'*32, get)
        self.assertEqual(n.validate(value), n.validate(expected))
        self.assertTrue(all(path.startswith(('pages/', 'blocks/')) for path in calls))

    def test_recursive_pagination_and_incomplete_reads(self):
        value = snapshot(fixture(), split=True)
        self.assertEqual(len(n.validate(value)), 3)
        for mutate in (
            lambda x: x['reads'].pop(1),
            lambda x: x['reads'].pop(),
            lambda x: x['reads'][0]['response'].update(next_cursor=None),
        ):
            broken = copy.deepcopy(value)
            mutate(broken)
            with self.assertRaises(ValueError):
                n.validate(broken)

    def test_duplicate_wrong_parent_unknown_and_lossy_fields(self):
        value = snapshot(fixture())
        cases = [
            lambda x: x['reads'][0]['response']['results'].append(copy.deepcopy(x['reads'][0]['response']['results'][1])),
            lambda x: x['reads'][0]['response']['results'][1]['parent'].update(page_id=str(uuid.uuid4())),
            lambda x: x['reads'][0]['response']['results'][1]['paragraph'].update(mystery='lost'),
            lambda x: x['reads'][0]['response']['results'][1].update(type='unsupported'),
        ]
        for mutate in cases:
            broken = copy.deepcopy(value)
            mutate(broken)
            with self.assertRaises(ValueError):
                n.validate(broken)
        tree = n.validate(value)
        tree[1]['block']['paragraph']['rich_text'][0]['annotations']['color'] = 'red'
        with self.assertRaises(ValueError):
            n.semantic_native(tree[1])

    def test_exact_proof_preserves_five_children_and_rejects_saved_change(self):
        tree = fixture()
        value = snapshot(tree)
        evidence = n.proof({'page_id': PAGE, 'body': BODY, 'page_last_edited_at': TIME,
                            'source_state_sha256': 'state'}, value)
        proof = n.operation(BODY, PAYLOAD, evidence)
        self.assertEqual(proof['basis'], 'EXACT_REVIEWED_NATIVE_API_REGION')
        tree[1]['block']['paragraph']['rich_text'] = rich('new')
        n.verify_after(snapshot(tree), proof['expected_native'], PAGE, 'a'*32)
        tree[0]['children'][0]['block']['paragraph']['rich_text'] = rich('human edit')
        with self.assertRaisesRegex(ValueError, 'protected'):
            n.verify_after(snapshot(tree), proof['expected_native'], PAGE, 'a'*32)

    def test_manifest_hash_and_candidate_binding(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            a.atomic(root/'response.json', snapshot(fixture()))
            manifest = {'source': n.SOURCE, 'implementation_sha256': 'candidate', 'synthetic': True,
                        'pages': {'428': {'path': 'response.json', 'sha256': n.file_hash(root/'response.json')}}}
            a.atomic(root/'manifest.json', manifest)
            n.read_manifest(root/'manifest.json', 'candidate')
            with self.assertRaises(ValueError):
                n.read_manifest(root/'manifest.json', 'other')
            (root/'response.json').write_text('{}', encoding='utf-8')
            with self.assertRaises(ValueError):
                n.read_manifest(root/'manifest.json', 'candidate')

    def test_changed_native_page_during_capture(self):
        value = snapshot(fixture())
        value['after']['last_edited_time'] = 'changed'
        with self.assertRaises(ValueError):
            n.validate(value)


class FakeEngine:
    """Only transport transitions mocked; FileSession persistence and native gate are real."""
    isolated = True
    fake = True
    bundle = {}

    def __init__(self):
        self.page = {'code': '428', 'page_id': PAGE, 'source_body': BODY,
                     'source_state_sha256': 'state', 'native_evidence': {'snapshot': snapshot(fixture())}}
        self.initial = {'plan_sha256': 'plan', 'approval_sha256': 'approval', 'phase': 'NEW',
            'page_index': 0, 'op_index': 0, 'queue': [{'page': self.page, 'ops': []}],
            'events': [], 'receipts': [], 'page_reports': {}, 'quarantines': {}, 'review_reference': 'OFFLINE_ONLY',
            'status': 'RUNNING', 'last_before_body': BODY, 'last_state_hash': 'state'}

    def begin(self, state):
        state['phase'] = 'WRITE_PENDING'
        state['nonce'] = 'b'*32
        return {'type': 'WRITE_PENDING', 'nonce': state['nonce'], 'payload': PAYLOAD, 'plan_sha256': 'plan'}

    def step(self, state, event):
        state['phase'] = 'VERIFY_PAGE'
        return {'type': 'VERIFY_PAGE', 'nonce': 'c'*32, 'payload': {'id': PAGE}, 'plan_sha256': 'plan'}


class NativeFenceTests(unittest.TestCase):
    def run_fence(self, change_before=False, change_after=False, unreadable=False):
        with tempfile.TemporaryDirectory() as folder, patch('batch_apply.verify_sources'):
            session = object.__new__(a.FileSession)
            session.root = Path(folder)/'run'
            session.path = session.root/'journal.json'
            session.fence = Path(folder)/'fence.json'
            session.quarantine_dir = Path(folder)/'quarantine'
            session.engine = NativeSession(FakeEngine())
            action = session.start()
            self.assertEqual(action['type'], 'NATIVE_PREWRITE')
            tree = fixture()
            if change_before:
                tree[1]['block']['last_edited_time'] = 'native-only-change'
            event = {'nonce': action['nonce'], 'result': snapshot(tree, action['nonce'])}
            if unreadable:
                event = {'nonce': action['nonce'], 'error': 'unavailable'}
            action = session.event(event)
            if change_before or unreadable:
                self.assertEqual(action['status'], 'BLOCKED')
                return
            self.assertEqual(action['type'], 'WRITE_PENDING')
            journal = json.loads(session.path.read_text(encoding='utf-8'))
            self.assertEqual(len(journal['native']['reads']), 1)
            self.assertEqual(journal['native']['reads'][0]['sha256'], r.digest(event['result']))
            action = session.event({'nonce': action['nonce'], 'result': {}})
            self.assertEqual(action['type'], 'NATIVE_POSTWRITE')
            tree[1]['block']['paragraph']['rich_text'] = rich('bad' if change_after else 'new')
            action = session.event({'nonce': action['nonce'], 'result': snapshot(tree, action['nonce'])})
            self.assertEqual(action.get('status') if change_after else action['type'],
                             'UNCERTAIN' if change_after else 'VERIFY_PAGE')
            journal = json.loads(session.path.read_text(encoding='utf-8'))
            self.assertEqual(len(journal['native']['reads']), 2)

    def test_journal_before_write_then_native_readback_then_mcp(self):
        self.run_fence()

    def test_stale_native_subtree_with_same_mcp_blocks_before_write(self):
        self.run_fence(change_before=True)

    def test_unreadable_native_subtree_blocks_before_write(self):
        self.run_fence(unreadable=True)

    def test_native_postwrite_mismatch_is_uncertain(self):
        self.run_fence(change_after=True)


if __name__ == '__main__':
    unittest.main()
