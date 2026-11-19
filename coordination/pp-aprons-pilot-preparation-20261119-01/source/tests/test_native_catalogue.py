"""Offline catalogue selection/capture tests. No credential or remote calls."""
import contextlib
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
import batch_cli as cli
import batch_plan as b
import native_evidence as n
from test_native_evidence import fixture,snapshot,rich,PAGE

INVENTORY=ROOT.parents[1]/'pp-execution-746159f-20261119-01/input/inventory-current.json'
APRONS=['428','429','430','467','558','612','633','661','662','786','840']


def native_page(page_id,code,nonce):
    value=snapshot(fixture(),nonce)
    value=json.loads(json.dumps(value).replace(str(uuid.UUID(PAGE)),str(uuid.UUID(page_id))).replace(PAGE,page_id))
    value['synthetic']=False  # Simulates collector output, never real evidence outside the test directory.
    for page in (value['before'],value['after']):page['properties']={'Código PP':{'type':'rich_text','rich_text':rich(code)}}
    return n.for_storage(value)


class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.inventory=json.loads(INVENTORY.read_text(encoding='utf-8'))
        self.path=self.root/'inventory.json';self.path.write_text(json.dumps(self.inventory),encoding='utf-8')
        self.network=patch('urllib.request.urlopen',side_effect=AssertionError('No remote calls allowed'))
        self.network.start();self.addCleanup(self.network.stop)

    def invoke(self,codes,collector=None):
        self.output=self.root/('capture-'+str(len(list(self.root.iterdir()))))
        args=['batch_cli.py','capture-native','--inventory',str(self.path),'--codes',*codes,'--output',str(self.output)]
        stdout=io.StringIO()
        collector=collector or (lambda page_id,nonce,expected_code:native_page(page_id,expected_code,nonce))
        with patch.object(sys,'argv',args),patch.object(n,'collect',side_effect=collector) as collect,contextlib.redirect_stdout(stdout):
            cli.main()
        return json.loads(stdout.getvalue()),collect

    def test_code_outside_old_five_is_resolved_from_exact_inventory(self):
        result,collect=self.invoke(['39'])
        expected=cli.full_conversion.page_id(next(r['url'] for r in self.inventory['records'] if r['code']=='39'))
        self.assertEqual(collect.call_args.args[0],expected);self.assertEqual(collect.call_args.kwargs['expected_code'],'39')
        self.assertEqual(result['codes'],['39']);self.assertEqual(result['failed_codes'],[])
        _,pages=n.read_manifest(self.output/'manifest.json',b.implementation_sha())
        self.assertEqual(n.identity(pages['39']['before']['id']),expected)

    def test_all_eleven_requested_codes_use_inventory_ids_without_other_reads(self):
        result,collect=self.invoke(APRONS)
        selected=cli.selection(self.path,APRONS)
        self.assertEqual([c.args[0] for c in collect.call_args_list],[p['page_id'] for p in selected['pages']])
        self.assertEqual([c.kwargs['expected_code'] for c in collect.call_args_list],APRONS)
        self.assertEqual(result['codes'],APRONS);self.assertEqual(collect.call_count,11)

    def test_bad_inventory_selection_and_ids_refuse_before_collection(self):
        cases=[]
        wrong=copy.deepcopy(self.inventory);wrong['data_source']='collection://434b6705-ae1f-8372-9d2e-070435a4f043';cases.append((wrong,['428']))
        wrong=copy.deepcopy(self.inventory);wrong['records'][1]['code']=wrong['records'][0]['code'];cases.append((wrong,['428']))
        wrong=copy.deepcopy(self.inventory);wrong['records'][1]['url']=wrong['records'][0]['url'];cases.append((wrong,['428']))
        for url in ['https://app.notion.com/not-a-uuid','https://wrong.example/074b6705ae1f8257a53701d87a64eb32',
                    'https://app.notion.com/00000000000000000000000000000000',
                    'https://app.notion.com/074b6705ae1f8257a53701d87a64eb32?ambiguous=1']:
            wrong=copy.deepcopy(self.inventory);wrong['records'][0]['url']=url;cases.append((wrong,['428']))
        cases.extend([(self.inventory,['missing']),(self.inventory,['428','428']),(self.inventory,['601'])])
        for inventory,codes in cases:
            with self.subTest(codes=codes):
                self.path.write_text(json.dumps(inventory),encoding='utf-8')
                with patch.object(n,'collect') as collect,self.assertRaises(ValueError):self.invoke(codes,lambda *x,**kw:collect(*x,**kw))
                collect.assert_not_called();self.assertFalse(self.output.exists())

    def test_page_failure_does_not_publish_snapshot_or_block_next_page(self):
        def capture(page_id,nonce,expected_code):
            if expected_code=='429':raise ValueError('Unsupported native block type')
            return native_page(page_id,expected_code,nonce)
        result,collect=self.invoke(['429','39'],capture)
        self.assertEqual(collect.call_count,2);self.assertEqual(result['status'],'COMPLETED_WITH_ERRORS')
        self.assertEqual(result['codes'],['39']);self.assertEqual(result['failed_codes'],['429'])
        self.assertFalse((self.output/'pp429.json').exists())
        manifest=json.loads((self.output/'manifest.json').read_text(encoding='utf-8'));self.assertEqual(set(manifest['pages']),{'39'})
        report=json.loads((self.output/'capture-report.json').read_text(encoding='utf-8'))
        self.assertIn('Unsupported',report['pages']['429']['reason'])
        n.read_manifest(self.output/'manifest.json',b.implementation_sha())

    def test_invalid_synthetic_or_wrong_identity_results_never_enter_manifest(self):
        for mode in ('error','synthetic','wrong-id','wrong-code','unknown-structure'):
            def capture(page_id,nonce,expected_code):
                if expected_code=='39':return native_page(page_id,expected_code,nonce)
                value=native_page(page_id,expected_code,nonce)
                if mode=='error':return {'isError':True}
                if mode=='synthetic':value['synthetic']=True
                if mode=='wrong-id':value['before']['id']=str(uuid.uuid4())
                if mode=='wrong-code':
                    for page in (value['before'],value['after']):page['properties']['Código PP']['rich_text']=rich('601')
                if mode=='unknown-structure':value['reads'][0]['response']['results'][0]['type']='unsupported'
                return value
            with self.subTest(mode=mode):
                result,_=self.invoke(['428','39'],capture)
                self.assertEqual(result['codes'],['39']);self.assertEqual(result['failed_codes'],['428'])
                self.assertFalse((self.output/'pp428.json').exists())

    def test_first_api_page_must_match_id_code_and_parent_before_children(self):
        page_id=cli.selection(self.path,['428'])['pages'][0]['page_id']
        mutations=[lambda p:p.update(id=str(uuid.uuid4())),
                   lambda p:p['parent'].update(data_source_id='434b6705-ae1f-8372-9d2e-070435a4f043'),
                   lambda p:p['properties']['Código PP'].update(rich_text=rich('601'))]
        for mutate in mutations:
            value=native_page(page_id,'428','a'*32);page=value['before'];mutate(page);calls=[]
            def get(path):calls.append(path);return page
            with self.assertRaises(ValueError):n.collect(page_id,'a'*32,get,expected_code='428')
            self.assertEqual(calls,['pages/'+page_id])

    def test_manifest_code_binding_is_checked_for_real_collector_output(self):
        self.invoke(['39'])
        manifest=json.loads((self.output/'manifest.json').read_text(encoding='utf-8'))
        manifest['pages']['428']=manifest['pages'].pop('39')
        (self.output/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'business code'):n.read_manifest(self.output/'manifest.json',b.implementation_sha())


if __name__=='__main__':unittest.main()
