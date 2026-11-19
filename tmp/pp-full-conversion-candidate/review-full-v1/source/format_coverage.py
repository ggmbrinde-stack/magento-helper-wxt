"""Read-only format coverage of actual workbook cells, styles, merges and known cases."""
import collections
import json
from pathlib import Path
import re

import importar_pp as reader
import full_excel


def inspect(workbook, index):
    book = reader.Excel(workbook)
    try:
        report = {'workbook_sha256': reader.digest(workbook), 'worksheets': {}, 'cases': {}, 'blocks': [],
                  'scope': 'Actual workbook structure and reader output; not counts as a claim of correct grouping'}
        rich = {''.join(e.itertext()) for e in book.xml('xl/sharedStrings.xml') if e.findall('s:r', reader.NS)}
        for name in reader.SHEETS:
            sheet = book.sheets[name]; cells = sheet['cells']; borders = collections.Counter(); examples = {}
            multiline = []; rich_cells = []
            for (col, row), cell in cells.items():
                if cell['value'] is None: continue
                address = reader.addr(col, row)
                if '\n' in str(cell['value']): multiline.append({'cell': address, 'raw': cell['value']})
                if cell['value'] in rich: rich_cells.append({'cell': address, 'raw': cell['value']})
                top = book.borders[int(book.styles[cell['style']].get('borderId', '0'))].find('s:top', reader.NS)
                if top is not None and top.get('style'):
                    color = top.find('s:color', reader.NS)
                    family = 'default' if color is None else next(iter(color.attrib), 'default')
                    borders[family] += 1
                    examples.setdefault(family, {'cell': address, 'style': top.get('style'), 'color': dict(color.attrib) if color is not None else None})
            records = [x for x in index['records'] if x['source'].startswith(name + '!')]
            heights = [int(re.search(r':\D+(\d+)$', x['source'])[1]) - int(re.search(r'!\D+(\d+):', x['source'])[1]) + 1 for x in records]
            report['worksheets'][name] = {'records': len(records), 'block_height_min': min(heights), 'block_height_max': max(heights),
                'merges': sheet['merges'], 'top_border_kinds': dict(borders), 'border_examples': examples,
                'multiline_cells': multiline, 'rich_text_cells': rich_cells,
                'blank_spacing_examples': [reader.addr(c, r) for (c, r), v in cells.items() if isinstance(v['value'], str) and v['value'] and not v['value'].strip()][:12],
                'visto_cells': [{'cell':reader.addr(c,r),'raw':v['value']} for (c,r),v in cells.items() if reader.clean(v['value']).upper().startswith('VISTO')]}
        for record in index['records']:
            name, span = record['source'].split('!'); sheet = book.sheets[name]
            left, top = reader.parts(span.split(':')[0]); right, bottom = reader.parts(span.split(':')[1])
            errors = []
            if right-left != 3 or left not in reader.SHEETS[name][1]: errors.append('Column band is not an explicit source band')
            code_cell = sheet['cells'].get((left, top), {})
            if reader.clean(code_cell.get('value')) != record['code']: errors.append('Code/header binding differs')
            options = collections.defaultdict(list)
            for number, group in enumerate(record['groups']):
                for option in group['options']: options[option['cell']].append(number)
            accounted = []
            for row in range(top, bottom+1):
                for col in (left+2, left+3):
                    address = reader.addr(col, row); value = sheet['cells'].get((col,row), {}).get('value')
                    text = reader.clean(value); groups = []
                    if not text: reason = 'BLANK'
                    elif text.upper() in reader.HEADERS: reason = 'HEADER'
                    elif col == left+3:
                        groups = options.get(address, [])
                        if len(groups) == 1: reason = 'GROUP_OPTION'
                        elif not reader.option_tech(text): reason = 'UNKNOWN_OPTION_TEXT_REQUIRES_REVIEW'
                        else: reason = 'OPTION_ACCOUNTING_ERROR'; errors.append(address+': option counted '+str(len(groups))+' times')
                    else:
                        groups = [i for i,g in enumerate(record['groups']) if text in g['locals']]
                        if len(groups) == 1: reason = 'GROUP_LOCATION'
                        elif len(groups)>1: reason = 'REPEATED_LOCATION_LABEL_REQUIRES_REVIEW'
                        else: reason = 'UNACCOUNTED_LOCATION'; errors.append(address+': location missing from groups')
                    accounted.append({'cell':address, 'classification':reason, 'groups':groups, 'raw':value})
            merges = []
            for merge in sheet['merges']:
                begin,end = merge.split(':') if ':' in merge else (merge,merge)
                x1,y1=reader.parts(begin);x2,y2=reader.parts(end)
                if x1<=right and x2>=left and y1<=bottom and y2>=top:
                    merges.append({'range':merge,'intersects_location_or_option':x2>=left+2})
            report['blocks'].append({'code':record['code'],'source':record['source'],'code_cell':reader.addr(left,top),
                'boundary':{'first_row':top,'last_row':bottom,'first_column':left,'last_column':right},
                'relevant_cells':accounted,'notes_and_description':[{**x} for x in record['raw'] if reader.parts(x['cell'])[0]==left+1],
                'groups':record['groups'],'merges':merges,'images':record['images'],'comments':record['comments'],
                'reader_flags':record['review_flags'],'reader_blocked':record['blocked'],'structural_errors':errors,
                'neighbour_columns_included':any(not left<=reader.parts(x['cell'])[0]<=right for x in record['raw']),
                'visto_column_included':any(reader.clean(x['value']).upper().startswith('VISTO') for x in record['raw'])})
        for code in ('33', '39', '42', '50', '261', '262', '430', '558', '661', '662', '786', '840'):
            record = full_excel.record(index, code)
            sheet_name, span = record['source'].split('!'); sheet = book.sheets[sheet_name]
            left, top = reader.parts(span.split(':')[0]); right, bottom = reader.parts(span.split(':')[1])
            merges = []
            for merge in sheet['merges']:
                begin, end = merge.split(':') if ':' in merge else (merge, merge)
                x1, y1 = reader.parts(begin); x2, y2 = reader.parts(end)
                if x1 <= right and x2 >= left and y1 <= bottom and y2 >= top: merges.append(merge)
            scoped = []
            for (col, row), cell in sheet['cells'].items():
                if left <= col <= right and top <= row <= bottom and cell['value'] is not None:
                    scoped.append({'cell': reader.addr(col, row), 'raw': cell['value'], 'style': cell['style'],
                                   'separator': book.separator(cell, allow_automatic=bool(col == left+2 and reader.clean(cell['value'])))})
            report['cases'][code] = {'source': record['source'], 'groups': record['groups'], 'cells': scoped,
                                    'merges': merges, 'images': record['images'], 'excel_comments': record['comments']}
        report['notes'] = [
            'Shared multi-location groups remain shared; no physical per-row option allocation is inferred.',
            'PP558 left Transfer and right DTF are separate original groups.',
            'PP661 source image list is checked directly; absence does not create a placeholder.',
            'Merged cells are reported and intersected with source ranges; no propagation of merged values is guessed.',
            'Multiline cells retain raw values. A second recognised technique on a later line is refused for manual grouping review.'
        ]
        report['all_blocks_summary']={'blocks':len(report['blocks']),
            'structural_errors':sum(bool(x['structural_errors']) for x in report['blocks']),
            'cells_by_classification':dict(collections.Counter(c['classification'] for x in report['blocks'] for c in x['relevant_cells'])),
            'orphan_blocks':index['orphans'],'unknown_option_text':index['unknown_option_text'],
            'duplicate_occurrences':index['duplicate_codes']}
        return report
    finally: book.close()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(); parser.add_argument('--workbook', required=True); parser.add_argument('--index', required=True); parser.add_argument('--output', required=True)
    args = parser.parse_args(); value = inspect(args.workbook, json.loads(Path(args.index).read_text(encoding='utf-8')))
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'worksheets': {k: {'merges': len(v['merges']), 'multiline': len(v['multiline_cells']), 'richtext': len(v['rich_text_cells']), 'borders': v['top_border_kinds']} for k,v in value['worksheets'].items()}}))
