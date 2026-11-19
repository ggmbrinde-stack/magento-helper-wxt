"""Offline, bounded evidence preview. Never a full-workbook import plan."""
import json
from pathlib import Path
import sys
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_importar_pp import pp, EVIDENCE, ROOT, SID


def focused_book(path, evidence):
    book = pp.Excel.__new__(pp.Excel)
    book.path = path.resolve()
    book.z = zipfile.ZipFile(path)
    styles = book.xml('xl/styles.xml')
    book.styles = list(styles.find('s:cellXfs', pp.NS))
    book.borders = list(styles.find('s:borders', pp.NS))
    strings = [''.join(e.itertext()) for e in book.xml('xl/sharedStrings.xml')]
    paths = book.relationships('xl/workbook.xml')
    sheet_path = next(paths[e.get('{' + pp.NS['r'] + '}id')] for e in book.xml('xl/workbook.xml').findall('s:sheets/s:sheet', pp.NS) if e.get('name') == evidence['sheet'])
    cells = {}
    with book.z.open(sheet_path) as stream:
        for _, cell in ET.iterparse(stream, events=('end',)):
            if cell.tag != '{' + pp.NS['s'] + '}c':
                continue
            col, row = pp.parts(cell.get('r'))
            if 13 <= col <= 16 and 6 <= row <= 32:
                value = cell.find('s:v', pp.NS)
                value = value.text if value is not None else None
                if cell.get('t') == 's' and value is not None:
                    value = strings[int(value)]
                elif cell.get('t') == 'inlineStr':
                    value = ''.join(cell.find('s:is', pp.NS).itertext())
                cells[(col, row)] = {'value': value, 'style': int(cell.get('s', '0')), 'formula': cell.find('s:f', pp.NS) is not None, 'type': cell.get('t')}
            cell.clear()
    expected = {pp.parts(c['cell']): c['value'] for c in evidence['cells']}
    assert {pos: cell['value'] for pos, cell in cells.items()} == expected
    book.sheets = {name: {'cells': {}, 'comments': [], 'images': [], 'max_row': 0} for name in [*pp.SHEETS, 'Notas PP']}
    book.sheets[evidence['sheet']] = {'cells': cells, 'comments': evidence['comments'], 'images': evidence['images'], 'max_row': 32}
    book.meta = {e.tag.rsplit('}', 1)[-1]: e.text for e in book.xml('docProps/core.xml')}
    return book


def main():
    output = ROOT / 'focused-preview'
    output.mkdir(exist_ok=True)
    summaries = []
    for evidence in EVIDENCE:
        path = Path.home() / 'Desktop' / evidence['workbook']
        assert pp.digest(path) == evidence['sha256']
        book = focused_book(path, evidence)
        with patch.object(pp, 'Excel', return_value=book), patch.object(pp.urllib.request, 'urlopen', side_effect=AssertionError('Offline only')):
            plan = pp.extract(path, SID)
        for record in plan['records']:
            record['blocked'].append('Focused offline preview only; full-workbook extraction and review required')
        plan['preview_scope'] = evidence['sheet'] + '!M6:P32 only; placeholder destination, no import'
        first = next(r for r in plan['records'] if r['code'] == '428')
        assert first['source'].endswith('!M9:P20')
        assert [len(g['options']) for g in first['groups']] == [6, 2]
        assert [g['locals'] for g in first['groups']] == [['Peito'], ['Bolso']]
        assert [[o['cell'] for o in g['options']] for g in first['groups']] == [['P' + str(n) for n in range(10, 16)], ['P16', 'P17']]
        pp.write_json(output / (path.stem + '.json'), plan)
        summaries.append({'workbook': path.name, 'sha256': plan['source']['sha256'], 'scope': plan['preview_scope'], 'PP428': [{'locals': g['locals'], 'cells': [o['cell'] for o in g['options']]} for g in first['groups']], 'all_records_blocked_for_writes': all(r['blocked'] for r in plan['records'])})
    pp.write_json(output / 'summary.json', summaries)
    print('Two real-workbook bounded previews passed: PP428 = Peito six + Bolso two; all output records blocked for writes.')


if __name__ == '__main__':
    main()
