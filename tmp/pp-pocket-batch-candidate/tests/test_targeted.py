import copy
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'tests'))
import batch_plan as b
import batch_apply as a
import rendered_layout as r
import targeted_section as scoped
import test_batch as fixtures
from test_batch import FakeConnector,drive,load,sync


class TargetedTests(unittest.TestCase):
    def setUp(self):
        fixture=fixtures.BatchTests();fixture.setUp();self.addCleanup(fixture.doCleanups)
        self.fixture=fixture;self.work=fixture.work
        self.capture=copy.deepcopy(load('pp633.json'));self.capture['capture']['synthetic']=True
        value=self.capture['response']['structuredContent']
        value['text']=value['text'].replace('- [ ] Não,','- [x] Não,').replace('Regista o motivo','Motivo próprio: manter a nota do bolso. Regista o motivo')
        value['text']=value['text'].replace('</content>','\n\nComentário do utilizador: conservar material e costuras.\n\n</content>')
        sync(self.capture['response']);state=b.page_state(self.capture)
        node=next(n for n in r.parse(state['body']) if n.kind=='heading' and n.title=='Imagens')
        old=node.raw+'\n\n'
        payload={'command':'update_content','page_id':state['page_id'],'content_updates':[{'old_str':old,'new_str':'','replace_all_matches':False}]}
        evidence=scoped.inspect_operation(state,payload)
        self.bundle=copy.deepcopy(fixture.bundle);self.bundle.update(version=5,validation_policy=scoped.policy())
        page=next(p for p in self.bundle['pages'] if p['code']=='633')
        page.update(validation_policy=scoped.policy(),status='READY',reasons=[],source_state_sha256=state['source_state_sha256'],source_body=state['body'],
                    source_metadata=b.stable_metadata(state),desired_body=state['body'].replace(old,'',1),property_operations=[],
                    operations=[{'id':'633-scoped-leaf','kind':'body','eligible':True,'payload':payload,'region_evidence':evidence}])
        self.page=page;self.state=state
        self.approval={'plan_sha256':r.digest(self.bundle),'implementation_sha256':self.bundle['implementation_sha256'],
                       'authorisation':'OFFLINE_FAKE_CONNECTOR_TEST','review_reference':'SCOPED_FAKE_REVIEW','approved_codes':['633'],'approved_operation_ids':['633-scoped-leaf']}
    def connector(self):
        captures=copy.deepcopy(self.fixture.captures);captures['633']=self.capture
        connector=FakeConnector(captures,self.fixture.schema_response);connector.comments=load('comments633.json');return connector
    def session(self,name='one'):return a.FileSession(self.work/'scoped-runs'/name,self.bundle,self.approval,fake=True)
    def test_missing_global_metadata_leaf_contract_and_excluded_native_comments(self):
        self.assertEqual(self.state['coverage']['state'],'UNKNOWN')
        self.assertTrue(self.page['operations'][0]['region_evidence']['eligible'])
        connector=self.connector();session=self.session();result=drive(session,connector,session.start())
        self.assertEqual(result['status'],'COMPLETE');self.assertEqual(len(connector.writes),1)
        saved=b.page_state(a.capture_response(connector.pages[r.PAGES['633']],r.PAGES['633']))['body']
        self.assertEqual(scoped.protected_snapshot(saved),scoped.protected_snapshot(self.state['body']))
        self.assertIn('Motivo próprio: manter a nota do bolso',saved);self.assertIn('- [x] Não,',saved)
        self.assertIn('Comentário do utilizador',saved);self.assertNotIn('Falta transfer 1 C 126cm',saved)
        journal=json.loads(session.path.read_text(encoding='utf8'))
        self.assertNotIn('FETCH_COMMENTS',[x['kind'] for x in journal['events']])
        self.assertFalse(scoped.policy()['native_comments']['empty_attested'])
    def test_real_batch_regions_are_assessed_individually_not_globally_attested(self):
        page=b.prepare_page(load('pp633.json'),load('comments633.json'),self.fixture.proof,b.page_state(load('pp428.json')),b.schema_state(self.fixture.schema_response),scoped.policy())
        self.assertEqual(page['status'],'BLOCKED')
        self.assertTrue(any(o['eligible'] for o in page['operations']))
        self.assertTrue(any(not o['eligible'] for o in page['operations']))
        self.assertTrue(all(o['payload']['command']=='update_content' for o in page['operations']))
        self.assertTrue(any('container completeness' in reason for reason in page['reasons']))
        self.assertFalse(page['comments']['empty_attested'])
    def test_missing_multiple_nested_unsupported_and_whole_page_targets_refused(self):
        for old in ['missing',self.state['body'],'<toggle>unclosed','Peito']:
            payload=copy.deepcopy(self.page['operations'][0]['payload']);payload['content_updates'][0]['old_str']=old
            with self.subTest(old=old[:20]),self.assertRaises(ValueError):scoped.inspect_operation(self.state,payload)
        state=copy.deepcopy(self.state);old=self.page['operations'][0]['payload']['content_updates'][0]['old_str'];state['body']+='\n\n'+old
        with self.assertRaises(ValueError):scoped.inspect_operation(state,self.page['operations'][0]['payload'])
    def test_explicit_truncation_and_unknown_affected_content_refused(self):
        for field,value in [('truncated',True),('unknown_block_count',1),('unknown_block_ids',['unknown'])]:
            capture=copy.deepcopy(self.capture);capture['response']['structuredContent'].update(truncated=False,unknown_block_count=0,unknown_block_ids=[])
            capture['response']['structuredContent'][field]=value;sync(capture['response'])
            with self.subTest(field=field),self.assertRaises(ValueError):b.page_state(capture)
    def test_prewrite_changes_inside_outside_body_comment_review_source_property_abort(self):
        for name,old,new in [('inside','## Imagens','## Imagens alteradas'),('outside','Peito','Peito alterado'),('comment','Comentário do utilizador','Comentário humano alterado'),('review','Motivo próprio','Novo motivo humano'),('source','Fonte e original do Excel','Fonte alterada'),('property','"Notas":""','"Notas":"Changed"')]:
            connector=self.connector();session=self.session(name)
            def edit(response):
                text=response['structuredContent']['text'];self.assertIn(old,text);response['structuredContent']['text']=text.replace(old,new);sync(response)
            connector.prewrite_edit=edit
            self.assertEqual(drive(session,connector,session.start())['status'],'STALE',name);self.assertEqual(connector.writes,[])
    def test_body_notes_and_review_inside_section_cannot_be_changed_or_only_archived(self):
        state=copy.deepcopy(self.state);state['coverage']['state']='EXPLICIT_COMPLETE_EXPORT'
        for node in r.parse(state['body']):
            if node.kind=='callout':
                new=node.raw.replace('Motivo próprio','Different reason')
                payload={'command':'update_content','page_id':state['page_id'],'content_updates':[{'old_str':node.raw,'new_str':new,'replace_all_matches':False}]}
                self.assertFalse(scoped.inspect_operation(state,payload)['eligible'])
                payload['content_updates'][0]['new_str']=r.toggle('History',[node.raw])
                self.assertFalse(scoped.inspect_operation(state,payload)['eligible'])
    def test_postread_outside_change_stops_and_uncertain_reconciliation_never_retries(self):
        connector=self.connector();connector.lost_at=1;session=self.session()
        self.assertEqual(drive(session,connector,session.start())['status'],'UNCERTAIN')
        page=connector.pages[r.PAGES['633']];page['structuredContent']['text']=page['structuredContent']['text'].replace('Comentário do utilizador','Human intervened');sync(page)
        restarted=a.FileSession(session.root,self.bundle,self.approval,fake=True,reconcile_only=True)
        self.assertEqual(drive(restarted,connector,restarted.event(reconcile=True))['status'],'RECONCILIATION_CONFLICT')
        self.assertEqual(len(connector.writes),1)
    def test_cancel_before_write_and_pending_intent_never_discards_uncertainty(self):
        session=self.session('before');session.start();self.assertEqual(session.event(cancel=True)['status'],'CANCELLED');self.assertFalse(session.fence.exists())
        session=self.session('pending');connector=self.connector();action=session.start()
        while action['type']!='WRITE_PENDING':action=session.event({'nonce':action['nonce'],'result':connector.fetch(action['payload'],action['type'])})
        self.assertEqual(session.event(cancel=True)['status'],'UNCERTAIN');self.assertTrue(session.fence.exists());self.assertEqual(connector.writes,[])

    def test_postread_visible_outside_edit_is_uncertain_without_continuation(self):
        connector=self.connector();update=connector.update
        def mutate(payload):
            result=update(payload);page=connector.pages[r.PAGES['633']]
            page['structuredContent']['text']=page['structuredContent']['text'].replace('Comentário do utilizador','Human outside edit');sync(page)
            return result
        connector.update=mutate;session=self.session()
        self.assertEqual(drive(session,connector,session.start())['status'],'UNCERTAIN');self.assertEqual(len(connector.writes),1)

    def test_body_comment_tables_and_order_are_protected_inside_complete_section(self):
        old=r.toggle('Notas humanas',['Primeira nota','Segunda nota','| Comentário | Decisão |\n| --- | --- |\n| Manter bolso | Não |'])
        state=copy.deepcopy(self.state);state['body']='# Fora\n\n'+old;state['coverage']['state']='EXPLICIT_COMPLETE_EXPORT'
        for new in [old.replace('Manter bolso','Remover bolso'),old.replace('Primeira nota\n\nSegunda nota','Segunda nota\n\nPrimeira nota')]:
            payload={'command':'update_content','page_id':state['page_id'],'content_updates':[{'old_str':old,'new_str':new,'replace_all_matches':False}]}
            self.assertFalse(scoped.inspect_operation(state,payload)['eligible'])


if __name__=='__main__':unittest.main()
