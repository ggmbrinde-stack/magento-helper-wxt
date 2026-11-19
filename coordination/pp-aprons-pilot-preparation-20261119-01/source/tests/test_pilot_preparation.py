"""Focused local contract checks. Real captures are read offline; no connector is called."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT/'tests'))
import batch_plan as b
import full_conversion as f
import native_evidence as n
import rendered_layout as r
from native_session import NativeSession
from test_native_evidence import fixture, snapshot, rich, BODY, PAGE, TIME, FakeEngine

CO = ROOT.parents[1]
CODES = '428 429 430 467 558 612 633 661 662 786 840'.split()
CAPTURES = CO/'pp-aprons-pilot-current-20261119-01/captures'
MANIFEST = CO/'pp-aprons-native-capture-20261119-01/manifest.json'
INPUT = CO/'pp-execution-746159f-20261119-01/input'


class BindingTests(unittest.TestCase):
    def setUp(self):
        self.value = snapshot(fixture())
        for page in (self.value['before'], self.value['after']):
            page.update(cover=None, icon=None, properties={'Código PP': {'type':'rich_text','rich_text':rich('428')}})
        self.state = {'page_id':PAGE,'code':'428','body':BODY,'source_state_sha256':'state',
                      'page_last_edited_at':'2026-11-19T12:00:16.219Z',
                      'properties':{'Código PP':'428','url':'https://app.notion.com/p/'+PAGE},
                      'cover':None,'icon':None}

    def test_precision_difference_requires_exact_supported_content_metadata(self):
        proof = n.proof(self.state, self.value)
        self.assertEqual(proof['edit_binding'], 'OBSERVED_MINUTE_PLUS_EXACT_CONTENT_AND_SUPPORTED_METADATA')
        self.assertEqual(proof['mcp_edited_at'], self.state['page_last_edited_at'])
        self.assertEqual(self.value['after']['last_edited_time'], TIME)

    def test_actual_same_minute_content_change_is_rejected(self):
        self.state['body'] = BODY.replace('old','human edit')
        with self.assertRaisesRegex(ValueError,'content differs'): n.proof(self.state,self.value)

    def test_metadata_and_other_minute_changes_are_rejected(self):
        self.state['properties']['Código PP'] = '429'
        with self.assertRaisesRegex(ValueError,'property differs'): n.proof(self.state,self.value)
        self.state['properties']['Código PP'] = '428'
        self.state['page_last_edited_at'] = '2026-11-19T12:01:16.219Z'
        with self.assertRaisesRegex(ValueError,'edit state differs'): n.proof(self.state,self.value)

    def test_prewrite_rejects_same_minute_native_metadata_edit(self):
        engine = FakeEngine(); engine.page['native_evidence']['snapshot'] = self.value
        gate = NativeSession(engine); state = copy.deepcopy(gate.initial)
        action = gate.begin(state)
        changed = copy.deepcopy(self.value); changed['nonce'] = action['nonce']
        for page in (changed['before'],changed['after']): page['properties']['Código PP']['rich_text'] = rich('429')
        with patch('batch_apply.verify_sources'):
            result = gate.step(state, {'nonce':action['nonce'],'result':changed})
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertIn('metadata changed',result['reason'])

    def test_mcp_bullets_are_explicit_and_ordered(self):
        nodes = r.parse('<toggle>Title\n\n- A\n- B</toggle>')
        self.assertEqual(n.semantic_mcp(nodes[0])[-1], [
            ['bulleted_list_item',[['A',[]]]], ['bulleted_list_item',[['B',[]]]]])
        with self.assertRaises(ValueError):
            n.semantic_mcp(r.parse('<toggle>Title\n\n- A\n  - B</toggle>')[0])
        self.assertEqual(n.plain_mcp(r'AI\_READ c\\ bolso'), [['AI_READ c\\ bolso',[]]])

    def test_no_image_replacement_mapping_is_added(self):
        with self.assertRaises(ValueError): n.semantic_mcp(r.parse('<image source="notion-file-block://opaque" />')[0])


class RealPreparationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(); cls.addClassCleanup(cls.tmp.cleanup)
        cls.output = Path(cls.tmp.name)/'eleven.json'
        cls.original_hash = n.file_hash(MANIFEST)
        old_targets = copy.deepcopy(r.PAGES)
        cls.addClassCleanup(lambda: (r.PAGES.clear(),r.PAGES.update(old_targets)))
        with patch('urllib.request.urlopen',side_effect=AssertionError('Remote request forbidden')):
            cls.summary = f.prepare(CAPTURES,INPUT/'workbook.xlsx',INPUT/'workbook-index.json',
                                    INPUT/'inventory-current.json',CODES,cls.output,native_manifest=MANIFEST)
        cls.plan = f.load(cls.output)

    def test_pinned_producer_links_consumer_without_mutating_evidence(self):
        self.assertEqual(self.original_hash, n.REVIEWED_MANIFEST)
        self.assertEqual(n.file_hash(MANIFEST), self.original_hash)
        binding = self.plan['native_manifest']
        self.assertEqual(binding['producer_implementation_sha256'],n.REVIEWED_PRODUCER)
        self.assertEqual(binding['consumer_implementation_sha256'], b.implementation_sha())
        self.assertEqual(list(self.plan['target_manifest']['targets']),CODES)
        with patch('urllib.request.urlopen',side_effect=AssertionError('Remote request forbidden')):
            n.read_manifest(MANIFEST,b.implementation_sha())
        changed = f.load(MANIFEST); changed['implementation_sha256'] = 'unreviewed'
        path = Path(self.tmp.name)/'tampered-manifest.json'; path.write_text(json.dumps(changed),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'provenance'): n.read_manifest(path,b.implementation_sha())
        with self.assertRaisesRegex(ValueError,'provenance'): n.read_manifest(MANIFEST,'unreviewed-consumer')

    def test_all_eleven_have_honest_previews_and_no_eligible_edits(self):
        self.assertEqual([p['code'] for p in self.plan['pages']],CODES)
        self.assertFalse(self.plan['apply_allowed_now'])
        for p in self.plan['pages']:
            with self.subTest(code=p['code']):
                self.assertTrue(p['native_binding_error'])
                self.assertTrue(p['diff'])
                self.assertFalse(p['method_complete'])
                self.assertEqual(p['operations'],[]); self.assertEqual(p['property_operations'],[])
                self.assertFalse(p['completion_status_operation']['eligible'])
                self.assertFalse(p['failure_status_operation']['eligible'])

    def test_prefix_human_callout_images_and_source_are_outside_replacements(self):
        for p in self.plan['pages']:
            before,after = f.regions.parse(p['source_body']),f.regions.parse(p['desired_body'])
            review = next(node for node in before if r.review_state(node,p['code']) is not None)
            prefix = before[:before.index(review)+1]
            self.assertEqual([node.raw for node in after[:len(prefix)]],[node.raw for node in prefix])
            source = next(node for node in before if node.kind=='toggle' and node.title in (r.SOURCE,'Fonte'))
            self.assertEqual([node.raw for node in after if node.kind=='toggle' and node.title==source.title],[source.raw])
            self.assertEqual([node.raw for node in r.descend(after) if node.kind=='image'],
                             [node.raw for node in r.descend(before) if node.kind=='image'])

    def test_business_pending_stays_pending_and_pockets_are_not_reapplied(self):
        pages = {p['code']:p for p in self.plan['pages']}
        for c in ('467','612','633','661','662','786','840'): self.assertTrue(pages[c]['technical_unresolved'])
        for c in ('428','429','430','558'): self.assertEqual(pages[c]['technical_unresolved'],[])
        self.assertEqual(pages['786']['new_groups'][0]['locations'],['Bolso Peito','Bolso Esquerdo','Bolso Direito'])
        for c in ('430','558','661','662'): self.assertEqual(pages[c]['operations'],[])


class BridgeTests(unittest.TestCase):
    def test_native_manifest_is_forwarded_with_no_live_tools(self):
        script = r'''
const fs=require('fs'),vm=require('vm');
const bridge=vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'));
const commands=[];
const tools={exec_command:async ({cmd})=>{commands.push(cmd);return {exit_code:0,output:JSON.stringify(commands.length===1?{pages:[{code:'429',page_id:'id'}],working_copy:'home',collection:'collection'}:{ok:true})}},mcp__codex_apps__notion_fetch:async()=>({structuredContent:{text:'mock'}}),apply_patch:async()=>({})};
(async()=>{await bridge({script:'cli',plan:'plan',inventory:'inv',index:'idx',workbook:'book',captures:'captures',codes:['429'],nativeManifest:'exact manifest.json'},tools);
if(!commands[1].includes("'--native-manifest' 'exact manifest.json'"))throw Error('Manifest not passed');process.stdout.write('mock bridge passed');})().catch(e=>{process.stderr.write(String(e));process.exitCode=1});
'''
        result = subprocess.run(['node','-e',script,str(ROOT/'prepare_bridge.js')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(result.stdout,'mock bridge passed')


if __name__ == '__main__': unittest.main()
