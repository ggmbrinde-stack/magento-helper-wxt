"""Regenerate only local previews and their review evidence; no remote transport."""
import difflib
import importlib.util
import json
from pathlib import Path
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
import batch_plan as b
import full_conversion as f
import native_evidence as n

CO=ROOT.parent
BASE=CO/'pp-native-catalogue-reader-20261119-01'
INPUT=CO/'pp-execution-746159f-20261119-01/input'
CAPTURES=CO/'pp-aprons-pilot-current-20261119-01/captures'
NATIVE=CO/'pp-aprons-native-capture-20261119-01/manifest.json'
CODES='428 429 430 467 558 612 633 661 662 786 840'.split()

def save(path,value): f.a.atomic(ROOT/path,value)

spec=importlib.util.spec_from_file_location('baseline_batch_plan',BASE/'source/batch_plan.py')
baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)
assert baseline.implementation_sha()==n.REVIEWED_PRODUCER
assert n.file_hash(NATIVE)==n.REVIEWED_MANIFEST
with patch('urllib.request.urlopen',side_effect=AssertionError('Remote requests forbidden')):
    summary=f.prepare(CAPTURES,INPUT/'workbook.xlsx',INPUT/'workbook-index.json',INPUT/'inventory-current.json',
                      CODES,ROOT/'previews/eleven.json',native_manifest=NATIVE)
plan=f.load(ROOT/'previews/eleven.json')
diagnostics=[]
for page in plan['pages']:
    code=page['code']
    snap=f.load(NATIVE.parent/f'pp{code}.json')
    state=b.page_state(f.load(CAPTURES/f'pp{code}.json'))
    native_urls=[item[item['type']]['url'] for item in snap['after']['properties']['Imagem principal']['files']]
    mcp_urls=[n.canonical_file({'type':'file','file':{'url':url}})['file']['url'] for url in state['properties'].get('Imagem principal',[])]
    diagnostics.append({'code':code,'native_top_level_nodes':len(n.validate(snap)),
        'mcp_top_level_nodes':len(f.regions.parse(state['body'])),
        'native_edited_at':snap['after']['last_edited_time'],'mcp_edited_at':state['page_last_edited_at'],
        'native_image_locators':native_urls,'mcp_image_locators':mcp_urls,'image_locators_equal':native_urls==mcp_urls,
        'reason':page['native_binding_error'],'eligible_operations':0,'image_bytes_compared':False})
save('verification/evidence-diagnostics.json',diagnostics)
page=next(p for p in plan['pages'] if p['code']=='429')
props=page['source_metadata']['properties']
delta={key:value for key,value in page['wanted_properties'].items() if props.get(key)!=value and
       not (isinstance(value,list) and set(value)==set(props.get(key) or []))}
save('previews/pilot-review.json',{
    'code':'429','page_id':page['page_id'],'status':'BLOCKED_DRAFT_FOR_INDEPENDENT_REVIEW',
    'implementation_sha256':b.implementation_sha(),'eleven_plan_sha256':f.r.digest(plan),
    'selected_because':'Sem escolhas de negócio pendentes; New ainda difere da regra existente.',
    'concrete_change':{'location':'Face 1','before':'Bordado 240 cm², A6','after':'Bordado 600 cm², A4'},
    'content_diff':page['diff'],'wanted_properties':page['wanted_properties'],'property_delta':delta,
    'proposed_success_status':'Para revisão','status_write_eligible':False,
    'source_state_sha256':page['source_state_sha256'],
    'preserved_outside_replacements':['prefixo','callout humano','imagem','fonte existente'],
    'technical_unresolved':page['technical_unresolved'],'blocking_reason':page['native_binding_error'],
    'operations':[],'apply_allowed_now':False,'approval':None,
    'before':'eleven-reports/PP429-before.md','after':'eleven-reports/PP429-after.md'})

changed=[];diff=[]
for path in sorted((ROOT/'source').rglob('*')):
    if not path.is_file() or '__pycache__' in path.parts or path.suffix=='.pyc':continue
    relative=path.relative_to(ROOT).as_posix(); old=BASE/relative
    if old.exists() and path.read_bytes()==old.read_bytes():continue
    changed.append(relative)
    diff.extend(difflib.unified_diff(old.read_text(encoding='utf-8').splitlines(True) if old.exists() else [],
               path.read_text(encoding='utf-8').splitlines(True),fromfile='a/'+relative if old.exists() else '/dev/null',tofile='b/'+relative))
assert set(changed)=={'source/prepare_bridge.js','source/full_conversion.py','source/native_evidence.py',
                     'source/native_session.py','source/tests/test_pilot_preparation.py'}
(ROOT/'preparation.patch').write_text(''.join(diff),encoding='utf-8')
save('CANDIDATE.json',{'candidate':ROOT.name,'status':'PENDING_INDEPENDENT_REVIEW_BLOCKED_REAL_PILOT',
    'base_commit':'746159f4228f0cf24ac7e230dad99248c369459b','base_candidate':BASE.name,
    'producer_implementation_sha256':n.REVIEWED_PRODUCER,'implementation_sha256':b.implementation_sha(),
    'native_manifest_sha256':n.REVIEWED_MANIFEST,'eleven_plan_sha256':f.r.digest(plan),
    'changed_files':changed,'focused_tests':{'run':34,'passed':34,'log':'verification/focused-tests.log'},
    'previews':11,'eligible_live_pilot':None,'preferred_business_draft':'429','eligible_operations':0,
    'remote_requests':0,'credentials_read':False,'notion_writes':0,'session_start_or_apply':False,
    'approval':None,'remaining_blockers':['Native/MCP image locators differ; equivalence not demonstrated',
                                      'PP661 native top-level count 9 vs MCP 8',
                                      'Independent review and exact pilot approval remain pending'],
    'broader_tests_rerun':False,'workbook_reindexed':False})
inputs=[NATIVE,INPUT/'inventory-current.json',INPUT/'workbook-index.json',INPUT/'workbook.xlsx',CO/'PP-USER-DECISIONS.md',*sorted(CAPTURES.glob('*.json'))]
save('MANIFEST.json',{'files':{str(path.relative_to(ROOT).as_posix()):n.file_hash(path) for path in sorted(ROOT.rglob('*'))
    if path.is_file() and path.name!='MANIFEST.json' and '__pycache__' not in path.parts and path.suffix!='.pyc'},
    'unchanged_inputs':{str(path.resolve()):n.file_hash(path) for path in inputs}})
print(json.dumps({'implementation_sha256':b.implementation_sha(),'plan_sha256':f.r.digest(plan),
    'patch_sha256':n.file_hash(ROOT/'preparation.patch'),'manifest_sha256':n.file_hash(ROOT/'MANIFEST.json'),
    'changed_files':changed,'previews':len(plan['pages']),'eligible_pilot':None},indent=2))
