"""Seal the review artifact, then run its own tests from a clean ZIP extraction."""
import difflib
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
FREEZE = ROOT / 'review-full-v1'
VERIFY = ROOT / 'verification'
MANIFEST = FREEZE / 'manifest-full-v1.json'
ARCHIVE = ROOT / 'PP_Full_Conversion_REVIEW_v1.zip'
if MANIFEST.exists() or ARCHIVE.exists():
    raise SystemExit('Existing sealed artifacts must remain immutable')
for cache in FREEZE.rglob('__pycache__'):
    if not cache.resolve().is_relative_to(FREEZE.resolve()): raise ValueError('Cache escapes intended review tree')
    shutil.rmtree(cache)
sys.path.insert(0, str(FREEZE / 'source'))
import batch_plan as b
import rendered_layout as r


def sha(path):
    with path.open('rb') as file: return hashlib.file_digest(file, 'sha256').hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')


baseline = ROOT.parent / 'pp-pocket-batch-candidate/review-batch-v1/source'
patch = []
for path in sorted((FREEZE / 'source').rglob('*')):
    if not path.is_file() or path.suffix not in ('.py', '.js', '.cjs'): continue
    relative = path.relative_to(FREEZE / 'source')
    old = ROOT.parent / 'pp-importer-python-candidate/review-v1/source' / relative if str(relative) == 'importar_pp.py' else baseline / relative
    before = old.read_text(encoding='utf-8') if old.exists() else ''
    after = path.read_text(encoding='utf-8')
    if before != after:
        patch.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile='accepted/source/' + relative.as_posix(), tofile='source/' + relative.as_posix()))
(FREEZE / 'full-against-accepted.patch').write_text(''.join(patch), encoding='utf-8')
plans = {name: json.loads((FREEZE / 'plans' / (name + '.json')).read_text(encoding='utf-8')) for name in ('pilot39', 'representative')}
implementation = b.implementation_sha()
assert all(p['implementation_sha256'] == implementation for p in plans.values())
manifest = {'version': 'PP_FULL_CONVERSION_V1', 'base_commit': '946e7514d0fe90f4f89029f9c0eb3bdf47619031',
            'implementation_sha256': implementation, 'plans': {name: r.digest(p) for name, p in plans.items()},
            'live_writes_performed_by_this_session': False, 'independent_review': 'PENDING',
            'files': {p.relative_to(FREEZE).as_posix(): sha(p) for p in sorted(FREEZE.rglob('*')) if p.is_file()}}
write(MANIFEST, manifest)
with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
    for path in sorted(FREEZE.rglob('*')):
        if path.is_file(): archive.write(path, path.relative_to(FREEZE).as_posix())
archive_sha = sha(ARCHIVE)
(ROOT / (ARCHIVE.name + '.sha256')).write_text(archive_sha + '  ' + ARCHIVE.name + '\n', encoding='ascii')
extracted = VERIFY / 'clean-extracted'
if extracted.exists(): raise ValueError('Keep the previous extraction; choose a new review version')
with zipfile.ZipFile(ARCHIVE) as archive: archive.extractall(extracted)
for name, digest in manifest['files'].items(): assert sha(extracted / name) == digest
assert sha(extracted / MANIFEST.name) == sha(MANIFEST)
results = []
for name, command in [
    ('archive-python', [sys.executable, '-I', '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v']),
    ('archive-node', ['node', '--test', 'tests/test_session_bridge.cjs', 'tests/test_prepare_bridge.cjs'])
]:
    result = subprocess.run(command, cwd=extracted / 'source', capture_output=True, encoding='utf-8', errors='replace')
    log = result.stdout + result.stderr
    (VERIFY / (name + '.log')).write_text(log, encoding='utf-8')
    results.append({'check': name, 'exit_code': result.returncode})
    if result.returncode:
        write(VERIFY / 'archive-results.json', {'zip_sha256': archive_sha, 'results': results, 'passed': False})
        raise SystemExit(name + ' failed; preserve the sealed candidate and logs')
for name, digest in manifest['files'].items():
    assert sha(extracted / name) == digest and sha(FREEZE / name) == digest
python_log = (VERIFY / 'archive-python.log').read_text(encoding='utf-8')
node_log = (VERIFY / 'archive-node.log').read_text(encoding='utf-8')
value = {'zip_sha256': archive_sha, 'manifest_sha256': sha(MANIFEST), 'implementation_sha256': implementation,
         'plans': manifest['plans'], 'python_passed': int(re.search(r'Ran (\d+) tests', python_log)[1]),
         'node_passed': int(re.search(r'(?:ℹ |# )tests (\d+)', node_log)[1]), 'results': results,
         'passed': True, 'extracted_and_frozen_hashes_unchanged': True, 'self_contained': True}
write(VERIFY / 'archive-results.json', value)
print(json.dumps(value))
