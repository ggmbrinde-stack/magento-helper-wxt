"""Synthetic native fixtures only; no API requests or real page evidence."""
import copy
import contextlib
import io
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


def hosted(signature='first-secret', asset='22222222-2222-4222-8222-222222222222'):
    return {'type': 'file', 'file': {'url':
        'https://prod-files-secure.s3.us-west-2.amazonaws.com/11111111-1111-4111-8111-111111111111/'
        + asset + '/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=' + signature,
        'expiry_time': '2026-11-19T13:00:00.000Z' if signature == 'first-secret' else '2026-11-19T14:00:00.000Z'}}


def media_snapshot():
    tree = fixture()
    block = tree[1]['block']; block.pop('paragraph')
    block.update(type='image', image={**hosted(), 'caption': rich('Own caption')})
    value = snapshot(tree, split=True)
    for page in (value['before'], value['after']):
        page.update(request_id='first-request', url='https://www.notion.so/' + PAGE,
                    cover=hosted(), properties={'Imagem principal': {'type': 'files', 'files': [
                        {'name': 'own.png', **hosted()},
                        {'name': 'second.png', **hosted(asset='33333333-3333-4333-8333-333333333333')}]}})
    value['after']['request_id'] = 'second-request'
    value['after']['cover'] = hosted('second-secret')
    value['after']['properties']['Imagem principal']['files'][0] = {'name':'own.png', **hosted('second-secret')}
    for read in value['confirmation_reads']:
        read['response']['request_id'] = 'new-list-request'
        for block in read['response']['results']:
            if block['type'] == 'image': block['image'].update(hosted('second-secret'))
    return value


class NativeTests(unittest.TestCase):
    def test_paragraph_null_icon_survives_capture_manifest_and_semantics(self):
        tree=fixture();tree[1]['block']['paragraph']['icon']=None
        value=snapshot(tree);reads=iter(value['reads']+value['confirmation_reads'])
        def get(path):
            return value['before'] if path.startswith('pages/') else next(reads)['response']
        with patch('urllib.request.urlopen',side_effect=AssertionError('No network in offline tests')):
            captured=n.collect(PAGE,'a'*32,get)
        captured['synthetic']=True
        self.assertIsNone(n.validate(captured)[1]['block']['paragraph']['icon'])
        self.assertEqual(n.semantic_native(n.validate(captured)[1]),n.semantic_mcp(r.parse('old')[0]))
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);a.atomic(root/'snapshot.json',captured)
            manifest={'source':n.SOURCE,'implementation_sha256':'candidate','synthetic':True,
                      'pages':{'428':{'path':'snapshot.json','sha256':n.file_hash(root/'snapshot.json')}}}
            a.atomic(root/'manifest.json',manifest)
            _,pages=n.read_manifest(root/'manifest.json','candidate')
            self.assertIn('icon',pages['428']['reads'][0]['response']['results'][1]['paragraph'])
            self.assertIsNone(pages['428']['reads'][0]['response']['results'][1]['paragraph']['icon'])

    def test_nonnull_paragraph_icons_and_unknown_attributes_still_block(self):
        invalid=[{'icon':{'type':'emoji','emoji':'📝'}},{'icon':{'type':'unknown','value':'unmapped'}},
                 {'icon':'unmapped'},{'icon':False},{'icon':None,'unknown':'must not disappear'}]
        for fields in invalid:
            with self.subTest(fields=fields):
                tree=fixture();tree[1]['block']['paragraph'].update(fields);value=snapshot(tree)
                with self.assertRaises(ValueError):n.validate(value)
                with self.assertRaises(ValueError):n.semantic_native(tree[1])
                reads=iter(value['reads']+value['confirmation_reads'])
                def get(path):return value['before'] if path.startswith('pages/') else next(reads)['response']
                with self.assertRaises(ValueError):n.collect(PAGE,'a'*32,get)
                with tempfile.TemporaryDirectory() as folder:
                    root=Path(folder);a.atomic(root/'snapshot.json',n.for_storage(value))
                    manifest={'source':n.SOURCE,'implementation_sha256':'candidate','synthetic':True,
                        'pages':{'428':{'path':'snapshot.json','sha256':n.file_hash(root/'snapshot.json')}}}
                    a.atomic(root/'manifest.json',manifest)
                    with self.assertRaises(ValueError):n.read_manifest(root/'manifest.json','candidate')
        tree=fixture();tree[1]['block'].pop('paragraph');tree[1]['block'].update(type='bulleted_list_item',bulleted_list_item={'rich_text':rich('old'),'color':'default','icon':None})
        with self.assertRaises(ValueError):n.validate(snapshot(tree))

    def test_protected_paragraph_null_icon_is_not_erased_or_normalized(self):
        tree=fixture();tree[1]['block']['paragraph']['icon']=None;value=snapshot(tree)
        expected=[{'preserved':node} for node in n.validate(value)]
        n.verify_after(value,expected,PAGE,'a'*32)
        absent=fixture()
        with self.assertRaisesRegex(ValueError,'protected'):n.verify_after(snapshot(absent),expected,PAGE,'a'*32)
        tree[1]['block']['paragraph']['icon']={'type':'emoji','emoji':'📝'}
        with self.assertRaises(ValueError):n.verify_after(snapshot(tree),expected,PAGE,'a'*32)

    def test_volatile_page_and_descendant_media_metadata_are_not_edits(self):
        value = media_snapshot(); original = copy.deepcopy(value)
        tree = n.validate(value)
        self.assertEqual(value, original)
        self.assertTrue(tree[1]['block']['image']['file']['url'].startswith(n.FILE_LOCATOR))
        expected = [{'preserved': node} for node in tree]
        n.verify_after(value, expected, PAGE, 'a'*32)
        replaced=copy.deepcopy(value)
        for read in replaced['reads']+replaced['confirmation_reads']:
            for block in read['response']['results']:
                if block['type']=='image':block['image'].update(hosted(asset='44444444-4444-4444-8444-444444444444'))
        with self.assertRaisesRegex(ValueError,'protected'):n.verify_after(replaced,expected,PAGE,'a'*32)
        with self.assertRaisesRegex(ValueError, 'unsupported'):
            n.semantic_native(tree[1])  # Locator equality is not a lossless image replacement contract.

    def test_real_page_fields_file_identity_and_property_order_still_block(self):
        value = media_snapshot()
        mutations = [
            lambda x: x['after'].update(last_edited_time='real-edit'),
            lambda x: x['after'].update(url='https://www.notion.so/another-page'),
            lambda x: x['after']['parent'].update(data_source_id=str(uuid.uuid4())),
            lambda x: x['after'].update(cover=hosted(asset='44444444-4444-4444-8444-444444444444')),
            lambda x: x['after']['properties']['Imagem principal']['files'][0].update(name='different.png'),
            lambda x: x['after']['properties']['Imagem principal']['files'].reverse(),
            lambda x: x['after'].update(custom_attribute='not-ignored'),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                changed=copy.deepcopy(value);mutate(changed)
                with self.assertRaises(ValueError):n.validate(changed)

    def test_real_descendant_image_caption_order_attributes_and_parent_still_block(self):
        value=media_snapshot()
        mutations=[
            lambda blocks:blocks[0].update(last_edited_time='real-edit'),
            lambda blocks:blocks[0]['callout'].update(mystery='not-ignored'),
            lambda blocks:blocks[0]['parent'].update(page_id=str(uuid.uuid4())),
            lambda blocks:blocks[0].update(id=str(uuid.uuid4())),
        ]
        for mutate in mutations:
            changed=copy.deepcopy(value);mutate(changed['confirmation_reads'][0]['response']['results'])
            with self.assertRaises(ValueError):n.validate(changed)
        changed=copy.deepcopy(value);changed['confirmation_reads'][1]['response']['results'].reverse()
        with self.assertRaises(ValueError):n.validate(changed)
        for edit in ('file', 'caption'):
            changed=copy.deepcopy(value)
            for read in changed['confirmation_reads']:
                for block in read['response']['results']:
                    if block['type']=='image':
                        if edit=='file':block['image'].update(hosted(asset='44444444-4444-4444-8444-444444444444'))
                        else:block['image']['caption']=rich('Different actual caption')
            with self.assertRaises(ValueError):n.validate(changed)
        changed=copy.deepcopy(value);changed['reads'].pop(1)
        with self.assertRaises(ValueError):n.validate(changed)

    def test_canonical_storage_is_explicit_and_never_claims_raw_response_hash(self):
        value=media_snapshot();safe=n.for_storage(value)
        self.assertEqual(safe['persistence_policy'],n.PERSISTENCE)
        self.assertNotIn('first-secret',json.dumps(safe));self.assertNotIn('second-secret',json.dumps(safe))
        self.assertNotIn('X-Amz-',json.dumps(safe));self.assertNotIn('raw_response_sha256',safe)
        self.assertNotEqual(r.digest(value),r.digest(safe));self.assertEqual(n.validate(value),n.validate(safe))
        missing=copy.deepcopy(safe);missing.pop('persistence_policy')
        with self.assertRaises(ValueError):n.validate(missing)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);a.atomic(root/'snapshot.json',safe)
            manifest={'source':n.SOURCE,'implementation_sha256':'candidate','synthetic':True,
                      'pages':{'428':{'path':'snapshot.json','sha256':n.file_hash(root/'snapshot.json')}}}
            a.atomic(root/'manifest.json',manifest);n.read_manifest(root/'manifest.json','candidate')
            a.atomic(root/'snapshot.json',value);manifest['pages']['428']['sha256']=n.file_hash(root/'snapshot.json');a.atomic(root/'manifest.json',manifest)
            with self.assertRaisesRegex(ValueError,'temporary URLs'):n.read_manifest(root/'manifest.json','candidate')

    def test_unknown_or_semantically_different_file_locator_is_not_scrubbed_away(self):
        first=hosted();second=hosted('second-secret')
        self.assertEqual(n.canonical_file(first),n.canonical_file(second))
        second['file']['url']+='&versionId=actual-different-object-version'
        self.assertNotEqual(n.canonical_file(first),n.canonical_file(second))
        for url in ('https://unknown.example/file?token=private',
                    'https://prod-files-secure.s3.us-west-2.amazonaws.com/unknown-object.png',
                    hosted()['file']['url']+'&unknown=possible-identity-or-token'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                n.canonical_file({'type':'file','file':{'url':url}})
        external={'type':'external','external':{'url':'https://example.com/file?version=1'}}
        self.assertEqual(n.canonical_file(external),external)
        unsafe=media_snapshot();unsafe['before']['cover']=external
        unsafe['before']['cover']['external']['url']='https://example.com/file?signature=private'
        with self.assertRaisesRegex(ValueError,'cannot be persisted'):n.for_storage(unsafe)

    def test_collector_persists_only_canonical_data_and_uses_only_get_paths(self):
        expected=media_snapshot();reads=iter(expected['reads']+expected['confirmation_reads']);calls=[];page_count=0
        def get(path):
            nonlocal page_count
            calls.append(path)
            if path.startswith('pages/'):
                page_count+=1
                return expected['before'] if page_count==1 else expected['after']
            return next(reads)['response']
        with patch('urllib.request.urlopen',side_effect=AssertionError('No network in offline tests')):
            result=n.collect(PAGE,'a'*32,get)
        self.assertEqual(n.validate(result),n.validate(expected))
        self.assertEqual(result['persistence_policy'],n.PERSISTENCE)
        self.assertTrue(all(p.startswith(('pages/','blocks/')) for p in calls))
        self.assertNotIn('secret',json.dumps(result))

    def test_cli_capture_428_is_read_only_and_601_remains_excluded(self):
        import batch_cli
        with tempfile.TemporaryDirectory() as folder:
            args=['batch_cli.py','capture-native','--codes','428','--output',str(Path(folder)/'capture')]
            with patch.object(sys,'argv',args),patch.object(n,'collect',return_value=snapshot(fixture())) as collect,contextlib.redirect_stdout(io.StringIO()):
                batch_cli.main()
            self.assertEqual(collect.call_args.args[0],'074b6705ae1f8257a53701d87a64eb32')
            args[args.index('428')]='601'
            with patch.object(sys,'argv',args),patch.object(n,'collect') as collect,contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):
                batch_cli.main()
            collect.assert_not_called()

    def test_implementation_identity_hashes_both_native_modules(self):
        import batch_plan
        original=n.hashlib.sha256;inputs=[]
        def digest(data=b''):
            inputs.append(data);return original(data)
        with patch.object(n.hashlib,'sha256',side_effect=digest):
            value=batch_plan.implementation_sha()
        root=Path(n.__file__).parent
        self.assertIn((root/'native_evidence.py').read_bytes(),inputs)
        self.assertIn((root/'native_session.py').read_bytes(),inputs)
        self.assertEqual(len(value),64)

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
