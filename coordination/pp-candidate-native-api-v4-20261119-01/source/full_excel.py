"""Exact-code catalogue index using the corrected, reviewed workbook reader."""
import collections
import copy
import hashlib
import json
from pathlib import Path

import importar_pp as reader


def file_sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def index(workbook):
    return reader.extract(workbook, '431b6705-ae1f-83db-b71c-0739778f9e1a')


def record(index, code):
    matches = [x for x in index['records'] if x['code'] == code]
    if len(matches) != 1:
        raise ValueError('Código Excel ausente ou repetido: ' + code)
    result = copy.deepcopy(matches[0])
    fatal = [x for x in result['blocked'] if 'Distribuição' not in x and 'Local sem opções' not in x]
    unknown = [x for x in index['unknown_option_text'] if x['source'] == result['source']]
    if fatal or unknown:
        raise ValueError('Origem Excel não suportada: ' + '; '.join(fatal + [x['text'] for x in unknown]))
    # Shared groups are source groups, never a claim about physical row allocation.
    for group in result['groups']:
        if not group['locals']:
            raise ValueError('Grupo de opções sem local explícito: ' + result['source'])
        raw = {x['cell']: x['value'] for x in result['raw']}
        for option in group['options']:
            value = raw.get(option['cell'])
            if not isinstance(value, str) or reader.clean(value) != reader.clean(option['original']):
                raise ValueError('Texto original da opção diverge da célula: ' + option['cell'])
            if any(reader.option_tech(line.strip()) for line in value.splitlines()[1:]):
                raise ValueError('Várias opções na mesma célula exigem associação revista: ' + result['source'] + ' ' + option['cell'])
            option['original'] = value
    column = reader.parts(result['source'].split('!')[1].split(':')[0])[0]
    repeated = [name for name, count in collections.Counter(x for g in result['groups'] for x in g['locals']).items() if count > 1]
    if repeated:
        addresses = [x['cell'] for x in result['raw'] if reader.clean(x['value']) in repeated]
        raise ValueError('Local repetido em grupos diferentes; confirmar antes de converter: '+result['source']+' '+','.join(addresses))
    assigned = collections.Counter(x['cell'] for g in result['groups'] for x in g['options'])
    for item in result['raw']:
        col, row = reader.parts(item['cell'])
        value = reader.clean(item['value'])
        if col == column + 3 and value and value.upper() not in reader.HEADERS and reader.option_tech(value):
            if assigned[item['cell']] != 1:
                raise ValueError('Opção não contabilizada exactamente uma vez: ' + result['source'] + ' ' + item['cell'])
    return result


def inventory(value):
    if value.get('data_source') != 'collection://431b6705-ae1f-83db-b71c-0739778f9e1a':
        raise ValueError('Inventário fora da Working Copy')
    rows = value['records']
    codes = [x['code'] for x in rows]
    urls = [x['url'].rstrip('/').split('/')[-1].replace('-', '') for x in rows]
    if (len(rows) != value['verified_total'] or len(set(codes)) != value['distinct_codes']
            or value['missing_codes'] != 0 or any(not c or not c.isdigit() for c in codes)
            or len(set(codes)) != len(codes) or len(set(urls)) != len(urls)):
        raise ValueError('Inventário incompleto, repetido ou em conflito')
    return {x['code']: x for x in rows}


def coverage(index, inv):
    rows = inventory(inv)
    by_code = collections.Counter(x['code'] for x in index['records'])
    sheets = collections.Counter(x['source'].split('!')[0] for x in index['records'])
    bindings=[]
    for code, target in rows.items():
        sources=[x['source'] for x in index['records'] if x['code']==code]
        reason=None
        try: record(index,code)
        except ValueError as error: reason=str(error)
        bindings.append({'code':code,'url':target['url'],'source_occurrences':sources,
                         'source_status':'PROTECTED_NO_CHANGE' if code=='601' else 'SOURCE_ERROR' if reason else 'EXACT_CODE_SOURCE_MATCH',
                         'reason':reason,'body_read_and_full_conversion_proved':False})
    return {'working_copy_total': len(rows), 'excel_blocks': len(index['records']),
            'excel_distinct_codes': len(by_code), 'worksheets': dict(sheets),
            'duplicates': index['duplicate_codes'],
            'notion_missing_in_excel': sorted(set(rows) - set(by_code)),
            'excel_missing_in_notion': sorted(set(by_code) - set(rows)),
            'protected_codes': ['601'],
            'notion_bindings':bindings,
            'page_conversion_not_proved_by_inventory': True}
