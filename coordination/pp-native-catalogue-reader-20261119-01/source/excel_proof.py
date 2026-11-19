"""Bounded, read-only verification of the explicitly assigned Excel groups."""
import hashlib
import json
from pathlib import Path
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile

SHA = 'c2a99e711658a63a09d83156a8c6c7a3b512bf8c59b8c0b9688c017ee6ab4348'
SHEET = 'PPs BRINDE TÊXTIL'
GROUPS = {
 '428': [(10,15,[10]),(16,17,[16])], '429': [(34,39,[34])],
 '430': [(42,47,[42]),(48,49,[48,49])], '467': [(96,99,[96]),(100,101,[100]),(102,104,[102])],
 '558': [(106,106,[106]),(107,107,[107])], '612': [(118,121,[118]),(122,123,[122])],
 '633': [(22,24,[22]),(25,26,[25])], '661': [(64,70,[64]),(71,72,[71,72])],
 '662': [(75,80,[75]),(81,82,[81,82]),(83,90,[83])], '786': [(53,54,[53,54,55])],
 '840': [(127,130,[127]),(131,132,[131]),(133,135,[133])]}
NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def verify(workbook, evidence_path, groups=None):
    workbook, evidence_path = Path(workbook), Path(evidence_path)
    with workbook.open('rb') as file:
        actual = hashlib.file_digest(file, 'sha256').hexdigest()
    evidence = json.loads(evidence_path.read_text(encoding='utf-8-sig'))
    if actual != SHA or evidence.get('sha256') != SHA or evidence.get('sheet') != SHEET:
        raise ValueError('Workbook/evidence identity mismatch')
    groups=GROUPS if groups is None else groups
    if not isinstance(groups,dict) or not groups:raise ValueError('Explicit reviewed Excel groups required')
    for values in groups.values():
        for first,last,locations in values:
            if type(first) is not int or type(last) is not int or not 1<=first<=last<=1048576 or not locations or any(type(n) is not int or not 1<=n<=1048576 for n in locations):
                raise ValueError('Invalid bounded Excel cell groups')
    row_limit=max(max(last,*locations) for values in groups.values() for first,last,locations in values)
    if set(evidence.get('records', {})) != set(groups):
        raise ValueError('Evidence does not match the exact batch')
    with zipfile.ZipFile(workbook) as archive:
        read = lambda name: ET.fromstring(archive.read(name))
        rels = {e.get('Id'): posixpath.normpath(posixpath.join('xl',e.get('Target'))).lstrip('/') for e in read('xl/_rels/workbook.xml.rels')}
        paths = [rels[e.get(REL)] for e in read('xl/workbook.xml').findall('s:sheets/s:sheet',NS) if e.get('name') == SHEET]
        if len(paths) != 1:
            raise ValueError('Ambiguous Excel sheet')
        strings = [''.join(e.itertext()) for e in read('xl/sharedStrings.xml')]
        cells = {}
        with archive.open(paths[0]) as stream:
            for _, cell in ET.iterparse(stream,events=('end',)):
                if cell.tag != '{'+NS['s']+'}c': continue
                ref = cell.get('r','')
                if re.fullmatch(r'[MNOP]\d+',ref) and int(re.search(r'\d+',ref)[0]) <= row_limit+1:
                    value = cell.find('s:v',NS)
                    value = value.text if value is not None else None
                    if cell.get('t') == 's' and value is not None: value = strings[int(value)]
                    elif cell.get('t') == 'inlineStr': value = ''.join(cell.find('s:is',NS).itertext())
                    if cell.find('s:f',NS) is not None or cell.get('t') == 'e':
                        raise ValueError('Formula/error in scoped source cells')
                    cells[ref] = value
                cell.clear()
    records = {}
    for code, expected in groups.items():
        record = evidence['records'][code]
        start = re.match(r'M(\d+):P\d+$',record.get('range',''))
        if not start or cells.get('M'+start[1]) != code or cells.get('N'+start[1]) != record.get('title'):
            raise ValueError('Excel code/title binding failed: '+code)
        if len(record['groups']) != len(expected): raise ValueError('Source grouping mismatch: '+code)
        groups = []
        for group,(first,last,locations) in zip(record['groups'],expected):
            if [o['cell'] for o in group['options']] != ['P'+str(n) for n in range(first,last+1)] or [o['cell'] for o in group['locations']] != ['O'+str(n) for n in locations]:
                raise ValueError('Source cells/group boundary mismatch: '+code)
            for item in group['locations']:
                if cells.get(item['cell']) != item['name']: raise ValueError('Location text mismatch: '+code)
            for item in group['options']:
                if cells.get(item['cell']) != item['text']: raise ValueError('Original option text mismatch: '+code)
            groups.append({'locations':[{'cell':o['cell'],'text':cells[o['cell']]} for o in group['locations']],
                           'options':[{'cell':o['cell'],'text':cells[o['cell']]} for o in group['options']]})
        records[code] = {'range':record['range'],'title':record['title'],'groups':groups}
    if '786' in groups and str(cells.get('P55') or '').strip(): raise ValueError('PP786 P55 must remain blank, not a third option')
    return {'workbook':str(workbook.resolve()),'workbook_sha256':actual,
            'evidence_sha256':hashlib.sha256(evidence_path.read_bytes()).hexdigest(), 'sheet':SHEET,'records':records,
            'blank_cells':{'P55':cells.get('P55')}}
