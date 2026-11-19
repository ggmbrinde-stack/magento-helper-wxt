"""New paired-file and grouped-bullet contracts only. No network or session execution."""
import copy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
import batch_plan as b
import batch_apply as a
import full_conversion as f
import native_evidence as n
import rendered_layout as r
from test_native_evidence import rich

CO=ROOT.parents[1]
CODES='428 429 430 467 558 612 633 661 662 786 840'.split()
MCP=CO/'pp-aprons-pilot-current-20261119-01/captures'
PAIR=CO/'pp429-paired-image-evidence-20261119-01/paired-mcp-input.json'
NATIVE=CO/'pp-aprons-native-capture-20261119-01/manifest.json'
INPUT=CO/'pp-execution-746159f-20261119-01/input'


class PairedPilotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.addClassCleanup(cls.tmp.cleanup)
        old=copy.deepcopy(r.PAGES);cls.addClassCleanup(lambda:(r.PAGES.clear(),r.PAGES.update(old)))
        network=patch('urllib.request.urlopen',side_effect=AssertionError('Network forbidden'))
        network.start();cls.addClassCleanup(network.stop)
        out=Path(cls.tmp.name)/'eleven.json'
        f.prepare(MCP,INPUT/'workbook.xlsx',INPUT/'workbook-index.json',INPUT/'inventory-current.json',
                  CODES,out,native_manifest=NATIVE,paired_captures={'429':PAIR})
        cls.bundle=f.load(out)

    def setUp(self):
        self.state=b.page_state(f.load(MCP/'pp429.json'))
        self.paired=b.page_state(f.load(PAIR))
        self.native=f.load(NATIVE.parent/'pp429.json')

    def prove(self): return n.proof(self.state,self.native,self.paired)

    def test_661_both_bullets_are_present_and_exact_with_source_boundaries(self):
        state=b.page_state(f.load(MCP/'pp661.json'));snap=f.load(NATIVE.parent/'pp661.json')
        before=f.regions.parse(state['body']);nodes=n.mcp_nodes(state['body']);tree=n.validate(snap)
        self.assertEqual((len(before),len(nodes),len(tree)),(8,9,9))
        self.assertEqual(n.mcp_children(nodes),[n.semantic_native(item) for item in tree])
        self.assertEqual(nodes[4].raw+'\n'+nodes[5].raw,before[4].raw)
        for node in nodes: self.assertEqual(state['body'][node.start:node.end],node.raw)
        evidence=n.proof(state,snap)
        old=nodes[4].raw;new='- Nota nova simulada'
        payload={'command':'update_content','page_id':state['page_id'],
                 'content_updates':[{'old_str':old,'new_str':new,'replace_all_matches':False}]}
        op=n.operation(state['body'],payload,evidence)
        self.assertEqual(len(op['expected_native']),9)
        self.assertEqual(op['expected_native'][5],{'preserved':tree[5]})
        self.assertEqual(op['expected_native'][4],{'semantic':['bulleted_list_item',[['Nota nova simulada',[]]]]})
        payload['content_updates'][0]['old_str']=old[2:]
        with self.assertRaises(ValueError): n.operation(state['body'],payload,evidence)

    def test_661_reordered_bullets_and_changed_text_are_rejected(self):
        state=b.page_state(f.load(MCP/'pp661.json'));snap=f.load(NATIVE.parent/'pp661.json')
        group=f.regions.parse(state['body'])[4].raw;lines=group.splitlines()
        for changed in ('\n'.join(reversed(lines)),group.replace(lines[0],'- Conteúdo alterado')):
            with self.subTest(changed=changed[:20]):
                other=copy.deepcopy(state);other['body']=state['body'].replace(group,changed)
                with self.assertRaises(ValueError): n.proof(other,snap)

    def test_known_record_fragment_matches_same_canonical_native_locator(self):
        url=self.paired['properties']['Imagem principal'][0]
        native_url=self.native['after']['properties']['Imagem principal']['files'][0]['file']['url']
        locator,parts=n.mcp_file_locator(url,self.state['page_id'])
        self.assertEqual(locator,native_url)
        self.assertEqual(parts.query,'x-amz-checksum-mode=ENABLED&x-id=GetObject')
        self.assertEqual(parts.fragment,'')
        with self.assertRaises(ValueError): n.canonical_file({'type':'file','file':{'url':url}})
        proof=self.prove()
        self.assertEqual(proof['protected_images'][0]['block_id'],'06eb6705-ae1f-838c-9f9b-81d32097401f')
        self.assertEqual(proof['protected_images'][0]['name'],'PP429_1.png')
        self.assertFalse(proof['protected_images'][0]['replacement_supported'])

    def test_unknown_fragment_wrong_record_workspace_or_query_still_refuse(self):
        url=self.paired['properties']['Imagem principal'][0]
        for changed in (url+'extra',url.replace('notion_record=block.','unknown='),
                        url.replace('137b6705-ae1f-8204-8ef1-810070095cf0','00000000-0000-4000-8000-000000000001'),
                        url.replace('#notion_record=','&unreviewed=value#notion_record=')):
            with self.subTest(changed=changed[-20:]):
                with self.assertRaises(ValueError): n.mcp_file_locator(changed,self.state['page_id'])

    def test_real_file_change_or_meaningful_query_change_is_rejected(self):
        url=self.paired['properties']['Imagem principal'][0]
        for old,new in (('85567298-9dcd-4a2b-96ae-df39d2a684f4','00000000-0000-4000-8000-000000000001'),
                        ('ENABLED','DISABLED'),('PP429_1.png','other.png')):
            with self.subTest(old=old):
                self.paired['properties']['Imagem principal']=[url.replace(old,new)]
                with self.assertRaises(ValueError): self.prove()
        self.paired['properties']['Imagem principal']=[url]

    def test_image_name_reference_or_native_caption_change_is_rejected(self):
        raw=self.state['body']
        for old,new in (('name=PP429_1.png','name=changed.png'),
                        ('06eb6705-ae1f-838c-9f9b-81d32097401f','00000000-0000-4000-8000-000000000001')):
            self.state['body']=raw.replace(old,new);self.paired['body']=self.state['body']
            with self.assertRaises(ValueError):self.prove()
        self.state['body']=raw;self.paired['body']=raw
        for reads in ('reads','confirmation_reads'):
            for read in self.native[reads]:
                for block in read['response']['results']:
                    if block['type']=='image':block['image']['caption']=rich('Legenda alterada')
        with self.assertRaisesRegex(ValueError,'caption'):self.prove()

    def test_content_order_receipt_and_properties_must_match_both_captures(self):
        for key,value in (('body',self.paired['body'].replace('Ex: M21425','Ex: outro')),
                          ('page_last_edited_at','2026-11-18T16:33:18.000Z')):
            before=self.paired[key];self.paired[key]=value
            with self.assertRaises(ValueError):self.prove()
            self.paired[key]=before
        self.paired['capture']['received_at_utc']='2026-11-19T15:15:03.423Z'
        with self.assertRaisesRegex(ValueError,'receipt'):self.prove()

    def test_image_and_property_file_order_are_preserved(self):
        page=n.canonical_page(self.native['after'],True)
        extra=copy.deepcopy(page['properties']['Imagem principal']['files'][0])
        extra_url=self.paired['properties']['Imagem principal'][0].replace('85567298-9dcd-4a2b-96ae-df39d2a684f4','00000000-0000-4000-8000-000000000001')
        extra['file']['url']=n.mcp_file_locator(extra_url,self.state['page_id'])[0]
        page['properties']['Imagem principal']['files'].append(extra)
        self.paired['properties']['Imagem principal'].append(extra_url)
        n.metadata_matches(self.paired,page)
        self.paired['properties']['Imagem principal'].reverse()
        with self.assertRaises(ValueError):n.metadata_matches(self.paired,page)
        self.paired=b.page_state(f.load(PAIR))
        tree=n.validate(self.native)
        image=n.mcp_nodes(self.state['body'])[1]
        payload={'command':'update_content','page_id':self.state['page_id'],
                 'content_updates':[{'old_str':image.raw,'new_str':image.raw,'replace_all_matches':False}]}
        with self.assertRaises(ValueError):n.operation(self.state['body'],payload,self.prove())
        expected=[{'preserved':item} for item in tree]
        altered=copy.deepcopy(self.native)
        for name in ('reads','confirmation_reads'):
            blocks=altered[name][0]['response']['results']
            blocks[0],blocks[1]=blocks[1],blocks[0]
        n.verify_after(self.native,expected,self.state['page_id'],self.native['nonce'])
        self.assertNotEqual(n.validate(altered),tree)
        with self.assertRaises(ValueError):n.verify_after(altered,expected,self.state['page_id'],altered['nonce'])

    def test_pilot_uses_original_capture_and_embedded_paired_proof_with_no_execution(self):
        page=next(p for p in self.bundle['pages'] if p['code']=='429')
        self.assertTrue(page['method_complete']);self.assertEqual(page['technical_unresolved'],[])
        self.assertEqual((len(page['operations']),len(page['property_operations'])),(2,1))
        self.assertEqual(page['source_state_sha256'],self.state['source_state_sha256'])
        self.assertEqual(page['source_metadata'],b.stable_metadata(self.state))
        pair=page['native_evidence']['paired_mcp_input']
        self.assertEqual(pair['sha256'],'0c7223dd59ceec68967127b60b4c7329301c49f5c36511f2bad766a50528bd59')
        self.assertEqual(n.file_hash(NATIVE.parent/'pp429.json'),'4d6b080e99c7d8862d375c58f0886764d0a7d2b5622dfc6adae264970bffeec1')
        self.assertEqual(pair['original_capture_sha256'],self.state['snapshot_sha256'])
        self.assertEqual(pair['capture'],f.load(PAIR));a.verify_sources({'pages':[page],**{k:v for k,v in self.bundle.items() if k!='pages'}})
        self.assertFalse(self.bundle['apply_allowed_now'])

    def test_pilot_preserves_old_values_human_callout_image_source_and_pending_business(self):
        page=next(p for p in self.bundle['pages'] if p['code']=='429')
        before=f.regions.parse(page['source_body']);after=f.regions.parse(page['desired_body'])
        old_before=r.mappings(r.body_sections(before)[1])['Old']
        old_after=r.mappings(r.body_sections(after)[1])['Old']
        self.assertEqual(old_before,old_after)
        review=next(node for node in before if r.review_state(node,'429') is not None)
        prefix=before[:before.index(review)+1]
        self.assertEqual([node.raw for node in after[:len(prefix)]],[node.raw for node in prefix])
        source=next(node for node in before if node.title==r.SOURCE)
        self.assertIn(source.raw,[node.raw for node in after])
        for op in page['operations']:
            payload=op['payload']
            if payload['command']=='update_content':
                old=payload['content_updates'][0]['old_str']
                self.assertNotIn(source.raw,old)
                for node in prefix:self.assertNotIn(node.raw,old)
        self.assertIn('600 cm2',page['new_groups'][0]['options'][-1])
        for code in ('467','612','633','661','662','786','840'):
            other=next(p for p in self.bundle['pages'] if p['code']==code)
            self.assertTrue(other['technical_unresolved']);self.assertEqual(other['operations'],[])


if __name__=='__main__':unittest.main()
