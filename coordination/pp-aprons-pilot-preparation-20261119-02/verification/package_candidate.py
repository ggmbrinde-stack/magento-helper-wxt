"""Local preparation only; retain both original input contracts and review hashes."""
import copy
import difflib
import importlib.util
from pathlib import Path
import sys
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
import batch_apply as a
import batch_plan as b
import full_conversion as f
import native_evidence as n
import method_targets

CO=ROOT.parent
BASE=CO/'pp-aprons-pilot-preparation-20261119-01'
CAPTURES=CO/'pp-aprons-pilot-current-20261119-01/captures'
INPUT=CO/'pp-execution-746159f-20261119-01/input'
NATIVE=CO/'pp-aprons-native-capture-20261119-01/manifest.json'
PAIR=CO/'pp429-paired-image-evidence-20261119-01/paired-mcp-input.json'
CODES='428 429 430 467 558 612 633 661 662 786 840'.split()

def save(path,value): a.atomic(ROOT/path,value)

spec=importlib.util.spec_from_file_location('baseline_batch_plan',BASE/'source/batch_plan.py')
baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)
assert baseline.implementation_sha()=='8f6d11c933416c7a61e4f70ae9792878ee45385867b0e9cc806e0a0a64cc66a0'
assert n.file_hash(PAIR)=='0c7223dd59ceec68967127b60b4c7329301c49f5c36511f2bad766a50528bd59'
assert n.file_hash(NATIVE)==n.REVIEWED_MANIFEST
assert n.file_hash(NATIVE.parent/'pp429.json')=='4d6b080e99c7d8862d375c58f0886764d0a7d2b5622dfc6adae264970bffeec1'
with patch('urllib.request.urlopen',side_effect=AssertionError('No network allowed')):
    summary=f.prepare(CAPTURES,INPUT/'workbook.xlsx',INPUT/'workbook-index.json',INPUT/'inventory-current.json',
                      CODES,ROOT/'previews/eleven.json',native_manifest=NATIVE,paired_captures={'429':PAIR})
plan=f.load(ROOT/'previews/eleven.json')
pilot=copy.deepcopy(plan)
pilot['pages']=[copy.deepcopy(next(page for page in plan['pages'] if page['code']=='429'))]
pilot['target_manifest']['targets']={'429':pilot['target_manifest']['targets']['429']}
pilot['target_manifest']['group_id']='full-429-paired-pilot'
pilot['target_manifest_sha256']=f.r.digest(pilot['target_manifest'])
save('previews/pilot-429.json',pilot)
method_targets.configure(pilot['target_manifest'])
page=pilot['pages'][0]
assert page['method_complete'] and not page['technical_unresolved']
assert len(page['operations'])==2 and len(page['property_operations'])==1
a.verify_sources(pilot)
f.validate_layout(page['desired_body'],'429')
state=b.page_state(f.load(CAPTURES/'pp429.json'))
after=copy.deepcopy(state);after['body']=page['desired_body']
for op in page['operations']+page['property_operations']:
    a.validated_payload(op,page['page_id'],True)
for op in page['property_operations']: f.validate_properties(after,op['payload'],pilot['schema_state'])
ids=[op['id'] for op in page['operations']+page['property_operations']+
     [page['completion_status_operation'],page['failure_status_operation']]]
save('previews/pilot-429.approval-pending.json',{'authorisation':None,'review_reference':'',
    'plan_sha256':f.r.digest(pilot),'implementation_sha256':b.implementation_sha(),
    'approved_codes':['429'],'approved_operation_ids':ids})
rows=[]
for current in plan['pages']:
    rows.append({'code':current['code'],'method_complete':current['method_complete'],
        'body_operations':len(current['operations']),'property_operations':len(current['property_operations']),
        'technical_unresolved':current['technical_unresolved'],'preparation_error':current.get('full_prepare_error'),
        'native_binding_present':bool(current.get('native_evidence'))})
save('verification/result.json',{'pages':rows,'pilot_code':'429','pilot_plan_sha256':f.r.digest(pilot),
    'pilot_approval_operation_ids':ids,'native_producer_sha256':n.REVIEWED_PRODUCER,
    'consumer_sha256':b.implementation_sha(),'native_manifest_sha256':n.file_hash(NATIVE),
    'paired_input_sha256':n.file_hash(PAIR),'protected_images':page['native_evidence']['protected_images'],
    'original_mcp_state_sha256':state['source_state_sha256'],
    'paired_mcp_state_sha256':page['native_evidence']['paired_mcp_input']['paired_state_sha256'],
    'writes':0,'remote_requests':0,'session_start':False,'raw_http_claimed':False,'image_bytes_claimed':False,
    'independent_review':'PENDING','human_approval':None})
changed=[];diff=[]
for path in sorted((ROOT/'source').rglob('*')):
    if not path.is_file() or '__pycache__' in path.parts or path.suffix=='.pyc':continue
    rel=path.relative_to(ROOT).as_posix();old=BASE/rel
    if old.exists() and old.read_bytes()==path.read_bytes():continue
    changed.append(rel)
    diff.extend(difflib.unified_diff(old.read_text(encoding='utf-8').splitlines(True) if old.exists() else [],
        path.read_text(encoding='utf-8').splitlines(True),fromfile='a/'+rel if old.exists() else '/dev/null',tofile='b/'+rel))
assert set(changed)=={'source/native_evidence.py','source/full_regions.py','source/full_conversion.py',
                     'source/tests/test_pilot_preparation.py','source/tests/test_paired_pilot.py'}
(ROOT/'preparation.patch').write_text(''.join(diff),encoding='utf-8')
save('CANDIDATE.json',{'candidate':ROOT.name,'status':'PENDING_INDEPENDENT_REVIEW_NO_EXECUTION_AUTHORISED',
    'base_commit':'746159f4228f0cf24ac7e230dad99248c369459b','base_candidate':BASE.name,
    'base_implementation_sha256':baseline.implementation_sha(),'implementation_sha256':b.implementation_sha(),
    'producer_implementation_sha256':n.REVIEWED_PRODUCER,'native_manifest_sha256':n.file_hash(NATIVE),
    'paired_input_sha256':n.file_hash(PAIR),'changed_files':changed,
    'pilot_plan':'previews/pilot-429.json','pilot_plan_sha256':f.r.digest(pilot),'eleven_plan_sha256':f.r.digest(plan),
    'focused_tests':{'new_contract_cases':10,'passed':10,'log':'verification/focused-tests.log'},
    'remote_requests':0,'notion_writes':0,'credentials_read':False,'session_start_or_apply':False,
    'global_suites_repeated':False,'workbook_reindexed':False,'prior_NOGO_not_overridden':True,
    'human_approval':None})
inputs=[PAIR,NATIVE,*sorted(NATIVE.parent.glob('pp*.json')),*sorted(CAPTURES.glob('*.json')),
        INPUT/'workbook.xlsx',INPUT/'workbook-index.json',INPUT/'inventory-current.json',CO/'PP-USER-DECISIONS.md']
save('MANIFEST.json',{'files':{path.relative_to(ROOT).as_posix():n.file_hash(path) for path in sorted(ROOT.rglob('*'))
    if path.is_file() and path.name!='MANIFEST.json' and '__pycache__' not in path.parts and path.suffix!='.pyc'},
    'unchanged_inputs':{str(path.resolve()):n.file_hash(path) for path in inputs}})
print('implementation_sha256='+b.implementation_sha())
print('pilot_plan_sha256='+f.r.digest(pilot))
print('patch_sha256='+n.file_hash(ROOT/'preparation.patch'))
print('manifest_sha256='+n.file_hash(ROOT/'MANIFEST.json'))
print('pilot_operations='+','.join(ids))
