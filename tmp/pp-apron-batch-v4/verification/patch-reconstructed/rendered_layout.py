"""Lossless supported Notion-MCP Markdown layout previews. No network or writer."""
import argparse
import collections
from dataclasses import dataclass, field
from datetime import datetime
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlparse
import uuid

from format_layout import PAGES, digest

TECH = 'Pontos técnicos a confirmar'
SOURCE = 'Fonte e original do Excel'
HISTORY = 'Histórico de apresentação'
CONTAINERS = {'callout', 'toggle', 'columns', 'column'}
INLINE = {'b', 'i', 's', 'u', 'span', 'mention', 'date', 'br'}
ALLOWED = CONTAINERS | INLINE | {'table', 'colgroup', 'col', 'tr', 'td', 'th', 'image', 'p', 'todo', 'h1', 'h2', 'h3', 'h4'}
ATTRS = {'callout': {'icon', 'color'}, 'toggle': {'heading', 'color'}, 'columns': set(),
         'column': {'ratio', 'color'}, 'table': {'fit-page-width', 'header-row', 'header-column', 'color'},
         'colgroup': set(), 'col': {'width', 'color'}, 'tr': {'color'}, 'td': {'color'}, 'th': {'color'},
         'image': {'source', 'color'}, 'p': {'color'}, 'todo': {'checked', 'color'},
         'span': {'color', 'discussion-urls'}, 'mention': {'url', 'type'},
         'date': {'start', 'end', 'start-time', 'end-time', 'time-zone'},
         **{name: set() for name in ('b', 'i', 's', 'u', 'br')},
         **{name: {'color'} for name in ('h1', 'h2', 'h3', 'h4')}}


class Refused(ValueError):
    pass


def plain(value):
    return html.unescape(re.sub(r'<[^>]+>', '', value)).strip()


@dataclass
class Tag:
    name: str
    start: int
    open_end: int
    attrs: dict
    parent: object = None
    close_start: int = 0
    end: int = 0


@dataclass
class Node:
    kind: str
    raw: str
    start: int = 0
    end: int = 0
    attrs: dict = field(default_factory=dict)
    items: list = field(default_factory=list)
    rows: list = field(default_factory=list)
    cell_attrs: list = field(default_factory=list)
    row_attrs: list = field(default_factory=list)
    col_attrs: list = field(default_factory=list)

    @property
    def title(self):
        if self.kind == 'heading':
            return plain(re.sub(r'^#{1,4}\s+', '', self.raw))
        return plain(self.items[0].raw) if self.items else ''


class Lexer(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source, self.tags, self.stack = source, {}, []
        self.offsets = [0]
        for line in source.splitlines(keepends=True):
            self.offsets.append(self.offsets[-1] + len(line))
        self.fences = []
        active = None
        offset = 0
        for line in source.splitlines(keepends=True):
            match = re.match(r'^(`{3,}|~{3,})', line)
            if match:
                if active is None:
                    active = (offset, match[1])
                elif match[1][0] == active[1][0] and len(match[1]) >= len(active[1]):
                    self.fences.append((active[0], offset + len(line)))
                    active = None
            offset += len(line)
        if active:
            raise Refused('Unclosed code fence')
        self.feed(source)
        self.close()
        if self.stack:
            raise Refused('Unclosed or omitted container content')

    def position(self):
        line, col = self.getpos()
        return self.offsets[line - 1] + col

    def ignored(self, pos):
        return any(a <= pos < b for a, b in self.fences) or bool(re.search(r'(?<!\\)(?:\\\\)*\\$', self.source[:pos]))

    def start(self, name, attrs, empty):
        pos = self.position()
        if self.ignored(pos):
            return
        if name not in ALLOWED or len(dict(attrs)) != len(attrs):
            raise Refused('Unsupported or ambiguous tag: ' + name)
        if set(dict(attrs)) - ATTRS[name] or any(value is None for _, value in attrs):
            raise Refused('Unsupported tag attributes: ' + name)
        tag = Tag(name, pos, pos + len(self.get_starttag_text()), dict(attrs), self.stack[-1] if self.stack else None)
        self.tags[pos] = tag
        if empty:
            tag.close_start = tag.end = tag.open_end
        else:
            self.stack.append(tag)

    def handle_starttag(self, name, attrs):
        self.start(name, attrs, False)

    def handle_startendtag(self, name, attrs):
        self.start(name, attrs, True)

    def handle_endtag(self, name):
        pos = self.position()
        if self.ignored(pos):
            return
        if not self.stack or self.stack[-1].name != name:
            raise Refused('Mismatched closing tag: ' + name)
        tag = self.stack.pop()
        tag.close_start, tag.end = pos, self.source.index('>', pos) + 1

    def handle_comment(self, data):
        if not self.ignored(self.position()):
            raise Refused('Unsupported hidden comment content')

    def handle_decl(self, decl):
        raise Refused('Unsupported document declaration')


def pipe_cells(line):
    line = line.strip()
    if not line.startswith('|') or not line.endswith('|'):
        raise Refused('Unsupported pipe-table boundary')
    cells, current, slashes = [], '', 0
    for char in line[1:-1]:
        if char == '|' and slashes % 2 == 0:
            cells.append(current.strip(' ')); current = ''
        else:
            current += char
        slashes = slashes + 1 if char == '\\' else 0
    cells.append(current.strip(' '))
    return cells


def parse(source):
    if not isinstance(source, str) or len(source) > 2_000_000:
        raise Refused('Unsupported Markdown size/type')
    lex = Lexer(source)

    def gaps(parent, direct):
        pos = parent.open_end
        for tag in sorted(direct, key=lambda t: t.start):
            if source[pos:tag.start].strip():
                raise Refused('Unaccounted XML table content')
            pos = tag.end
        if source[pos:parent.close_start].strip():
            raise Refused('Unaccounted XML table content')

    def inline_only(parent):
        if any(t.name not in INLINE for t in lex.tags.values() if parent.open_end <= t.start < parent.close_start):
            raise Refused('Unsupported block children inside inline content')

    def region(start, end):
        result, pos = [], start
        while pos < end:
            while pos < end and source[pos].isspace():
                pos += 1
            if pos >= end:
                break
            fence = next(((a, b) for a, b in lex.fences if a == pos), None)
            if fence:
                result.append(Node('opaque', source[pos:fence[1]].rstrip('\r\n'), pos, fence[1])); pos = fence[1]; continue
            tag = lex.tags.get(pos)
            if tag and tag.name in CONTAINERS | {'table', 'image', 'p', 'todo', 'h1', 'h2', 'h3', 'h4'}:
                if tag.end > end:
                    raise Refused('Container crosses a section boundary')
                kind = 'heading' if tag.name.startswith('h') else tag.name
                node = Node(kind, source[pos:tag.end], pos, tag.end, tag.attrs)
                if tag.name in CONTAINERS:
                    node.items = region(tag.open_end, tag.close_start)
                elif tag.name == 'table':
                    rows = [t for t in lex.tags.values() if t.name == 'tr' and t.parent is tag]
                    if not rows or set(tag.attrs) - {'fit-page-width', 'header-row', 'header-column', 'color'}:
                        raise Refused('Unsupported XML table representation')
                    for row in rows:
                        cells = [t for t in lex.tags.values() if t.name in ('td', 'th') and t.parent is row]
                        if not cells or set(row.attrs) - {'color'} or any(set(c.attrs) - {'color'} for c in cells):
                            raise Refused('Unsupported table cell/row attributes')
                        gaps(row, cells)
                        for cell in cells:
                            inline_only(cell)
                        node.rows.append([source[c.open_end:c.close_start].strip('\r\n') for c in cells])
                        node.cell_attrs.append([c.attrs for c in cells]); node.row_attrs.append(row.attrs)
                    direct = [t for t in lex.tags.values() if t.parent is tag]
                    if any(t.name not in ('tr', 'colgroup') for t in direct):
                        raise Refused('Unsupported XML table children')
                    gaps(tag, direct)
                    for group in [t for t in direct if t.name == 'colgroup']:
                        cols = [t for t in lex.tags.values() if t.parent is group]
                        if any(t.name != 'col' for t in cols):
                            raise Refused('Unsupported column group')
                        gaps(group, cols)
                        node.col_attrs.extend(t.attrs for t in cols)
                    if node.col_attrs and len(node.col_attrs) != len(node.rows[0]):
                        raise Refused('Conflicting XML column/row widths')
                    if len(node.rows[0]) == 3 and (any(node.row_attrs) or any(any(a for a in row) for row in node.cell_attrs) or any(set(a) - {'width'} for a in node.col_attrs)):
                        raise Refused('Styled third-column notes need an explicit supported style-preservation rule')
                elif tag.name == 'image':
                    if not tag.attrs.get('source'):
                        raise Refused('Missing media reference')
                    inline_only(tag)
                elif tag.name in ('p', 'todo') and tag.end != tag.open_end:
                    inline_only(tag)
                elif kind == 'heading':
                    inline_only(tag)
                result.append(node); pos = tag.end; continue
            line_end = source.find('\n', pos, end)
            line_end = end if line_end < 0 else line_end
            line = source[pos:line_end].rstrip('\r')
            if line.startswith('|'):
                lines, stop = [line], line_end
                while stop < end:
                    begin = stop + 1; stop = source.find('\n', begin, end)
                    stop = end if stop < 0 else stop
                    value = source[begin:stop].rstrip('\r')
                    if not value.startswith('|'):
                        stop = begin; break
                    lines.append(value)
                if len(lines) < 2 or not all(re.fullmatch(r':?-{3,}:?', c) for c in pipe_cells(lines[1])):
                    raise Refused('Ambiguous or incomplete pipe table')
                rows = [pipe_cells(value) for i, value in enumerate(lines) if i != 1]
                result.append(Node('table', source[pos:stop].rstrip('\r\n'), pos, stop, rows=rows)); pos = stop; continue
            if re.match(r'^#{1,4}\s+', line):
                kind = 'heading'
            elif re.match(r'^- \[[ xX]\] ', line):
                kind = 'todo'
            else:
                kind = 'paragraph'
                stop = line_end
                while stop < end:
                    begin = stop + 1; next_end = source.find('\n', begin, end)
                    next_end = end if next_end < 0 else next_end
                    value = source[begin:next_end].rstrip('\r')
                    if not value.strip() or re.match(r'^(?:#{1,4}\s|\||- \[[ xX]\])', value) or (begin in lex.tags and lex.tags[begin].name in CONTAINERS | {'table', 'image', 'p', 'todo'}):
                        break
                    stop = next_end
                line_end = stop
            result.append(Node(kind, source[pos:line_end].rstrip('\r\n'), pos, line_end)); pos = line_end + 1
        return result
    nodes = region(0, len(source))
    for node in descend(nodes):
        if node.kind == 'table' and (not node.rows or any(len(row) != len(node.rows[0]) for row in node.rows)):
            raise Refused('Conflicting or incomplete table widths')
    return nodes


def descend(nodes):
    for node in nodes:
        yield node
        yield from descend(node.items)


def ledger(nodes):
    result = collections.Counter()
    for node in nodes:
        if node.kind == 'table':
            result.update(cell for row in node.rows for cell in row if cell)
        elif node.items:
            result.update(ledger(node.items))
        else:
            value = re.sub(r'^#{1,4}\s+', '', node.raw) if node.kind == 'heading' else node.raw
            if value:
                result[value] += 1
    return result


def join(nodes):
    return '\n\n'.join(n.raw if isinstance(n, Node) else n for n in nodes if (n.raw if isinstance(n, Node) else n))


def toggle(title, values, heading=False, attrs=None):
    attrs = {**(attrs or {}), **({'heading': 'h2'} if heading else {})}
    return '<toggle' + ''.join(' ' + k + '="' + html.escape(v, quote=True) + '"' for k, v in attrs.items()) + '>\n' + title + ('\n\n' + join(values) if values else '') + '\n</toggle>'


def xml_table(node):
    if len(node.rows[0]) == 2 and node.raw.startswith('<table'):
        return node.raw
    attributes = {'fit-page-width': 'true', 'header-row': 'true', **node.attrs}
    opening = '<table' + ''.join(' ' + k + '="' + html.escape(v, quote=True) + '"' for k, v in attributes.items()) + '>'
    lines = [opening, '<colgroup>', '<col width="80" />', '<col width="350" />', '</colgroup>']
    for i, row in enumerate(node.rows):
        row_attrs = node.row_attrs[i] if node.row_attrs else {}
        lines.append('<tr' + ''.join(' ' + k + '="' + html.escape(v, quote=True) + '"' for k, v in row_attrs.items()) + '>')
        for j, cell in enumerate(row[:2]):
            attrs = node.cell_attrs[i][j] if node.cell_attrs else {}
            opening = '<td' + ''.join(' ' + k + '="' + html.escape(v, quote=True) + '"' for k, v in attrs.items()) + '>'
            lines += [opening, cell, '</td>']
        lines.append('</tr>')
    return '\n'.join(lines + ['</table>'])


def review_state(node, code):
    if node.kind != 'callout':
        return None
    choices = [n for n in node.items if n.kind == 'todo']
    if not choices:
        return None
    if len(choices) != 2 or 'Revisão do PP ' + code not in node.title:
        raise Refused('Conflicting or unsupported review callout')
    checked, labels = [], []
    for choice in choices:
        if choice.raw.startswith('<todo'):
            value = choice.attrs.get('checked')
            if value not in ('true', 'false'):
                raise Refused('Missing native todo decision')
            checked.append(value == 'true'); labels.append(plain(re.sub(r'</?todo[^>]*>', '', choice.raw)))
        else:
            match = re.fullmatch(r'- \[([ xX])\] (.*)', choice.raw)
            if not match:
                raise Refused('Unsupported review todo')
            checked.append(match[1].lower() == 'x'); labels.append(match[2])
    if not labels[0].startswith(('Sim,', 'Yes,')) or not labels[1].startswith(('Não,', 'No,')) or all(checked) or 'Se não, porquê?' not in plain(node.raw):
        raise Refused('Conflicting choices or missing review reason')
    return {'yes': checked[0], 'no': checked[1], 'exact_callout_sha256': digest(node.raw)}


def body_sections(nodes):
    columns = [n for n in nodes if n.kind == 'columns']
    if not columns:
        starts = {side: [i for i, n in enumerate(nodes) if n.kind == 'heading' and (n.title == title or (side == 'New' and 'nova configuração (proposta)' in n.title) or (side == 'Old' and n.title.startswith('Antes ')))]
                  for side, title in [('New', 'New (proposta)'), ('Old', 'Old (original)')]}
        if any(len(value) != 1 for value in starts.values()) or starts['New'][0] >= starts['Old'][0]:
            raise Refused('Ambiguous uncolumned New/Old sections')
        first, old = starts['New'][0], starts['Old'][0]
        end = next((i for i in range(old + 1, len(nodes)) if (nodes[i].kind == 'heading' and nodes[i].title in ('Imagens', 'Descrição e notas do perfil', 'Notas')) or (nodes[i].kind == 'toggle' and nodes[i].title == SOURCE)), len(nodes))
        # A local span view, never a fabricated native block identity or child-coverage claim.
        views = {side: Node('column', join(values), values[0].start, values[-1].end, {'ratio': '50'}, values)
                 for side, values in [('New', nodes[first:old]), ('Old', nodes[old:end])]}
        return Node('columns', '', nodes[first].start, nodes[end - 1].end, items=list(views.values())), views
    if len(columns) != 1 or len(columns[0].items) != 2 or any(n.kind != 'column' for n in columns[0].items):
        raise Refused('Expected one unambiguous two-column New/Old comparison')
    sides = {}
    for column in columns[0].items:
        headings = [n for n in column.items if n.kind == 'heading' and n.title in ('New (proposta)', 'Old (original)')]
        if len(headings) != 1 or column.attrs.get('ratio', '50') != '50':
            raise Refused('Ambiguous New/Old heading or unsupported column ratio')
        side = headings[0].title.split()[0]
        if side in sides:
            raise Refused('Repeated New/Old column')
        sides[side] = column
    if set(sides) != {'New', 'Old'}:
        raise Refused('Missing New/Old column')
    return columns[0], sides


def mappings(sides):
    result = {}
    for side in ('New', 'Old'):
        tables = [n for n in sides[side].items if n.kind == 'table']
        if not tables:
            raise Refused('Missing full location/options table')
        result[side] = []
        for table in tables:
            header = table.rows[0]
            if len(header) not in (2, 3) or plain(header[0]).casefold() != 'face / local' or not plain(header[1]).casefold().startswith('opções'):
                raise Refused('Unsupported location/options table')
            if len(header) == 3 and plain(header[2]) not in ('Nota', 'Notas'):
                raise Refused('Unknown third table column')
            result[side].append([row[:2] for row in table.rows])
    return result


def validate_template(body):
    nodes = parse(body); columns, sides = body_sections(nodes)
    mappings(sides)
    reviews = [n for n in nodes if review_state(n, '428') is not None]
    tech = [n for n in nodes if n.kind == 'toggle' and n.title == TECH]
    sources = [n for n in nodes if n.kind == 'toggle' and n.title == SOURCE]
    if len(reviews) != 1 or len(tech) != 1 or len(sources) != 1 or not nodes.index(reviews[0]) < nodes.index(columns) < nodes.index(tech[0]) < nodes.index(sources[0]):
        raise Refused('PP428 does not match the approved review/columns/notes/source structure')
    if any(len(t.rows[0]) != 2 for side in sides.values() for t in side.items if t.kind == 'table'):
        raise Refused('PP428 template still has third note columns')
    return nodes


def format_markdown(body, code, template_body):
    validate_template(template_body)
    nodes = parse(body); columns, sides = body_sections(nodes); before_mapping = mappings(sides)
    reviews = [n for n in nodes if review_state(n, code) is not None]
    all_reviews = [n for n in descend(nodes) if review_state(n, code) is not None]
    if len(reviews) > 1 or len(all_reviews) != len(reviews):
        raise Refused('Duplicate or nested current review requires reconciliation')
    tech = [n for n in nodes if n.kind == 'toggle' and n.title == TECH]
    sources = [n for n in nodes if n.kind == 'toggle' and n.title == SOURCE]
    histories = [n for n in nodes if n.kind == 'toggle' and n.title == HISTORY]
    if len(tech) > 1 or len(sources) != 1 or len(histories) > 1:
        raise Refused('Missing/conflicting source, technical notes or history')
    canonical = (columns in nodes and len(reviews) == 1 and len(tech) == 1
                 and list(sides) == ['New', 'Old']
                 and nodes.index(reviews[0]) < nodes.index(columns) < nodes.index(tech[0]) < nodes.index(sources[0])
                 and all(len(t.rows[0]) == 2 and t.raw.startswith('<table') for s in sides.values() for t in s.items if t.kind == 'table')
                 and all(not (n.kind == 'callout' or n.kind == 'toggle' or (n.kind == 'heading' and n.title not in ('New (proposta)', 'Old (original)'))) for s in sides.values() for n in s.items))
    if canonical:
        return body, {'idempotent_existing_layout': True, 'exact_new_old_mappings': before_mapping, 'moved_notes': [], 'review': review_state(reviews[0], code)}
    notes, history, associations, rendered = [], [], [], {}
    for side in ('New', 'Old'):
        kept = []
        for n in sides[side].items:
            if n.kind == 'table':
                kept.append(xml_table(n))
                if len(n.rows[0]) == 3:
                    notes.append(n.rows[0][2])
                    for i, row in enumerate(n.rows[1:], 1):
                        associations.append({'side': side, 'source_span': [n.start, n.end], 'row': i, 'location_exact': row[0], 'note_exact': row[2]})
                        if row[2]:
                            notes.append(toggle(side + ': ' + row[0], [row[2]]))
            elif n.kind == 'heading' and n.title == side + (' (proposta)' if side == 'New' else ' (original)'):
                kept.append(n)
            elif n.kind == 'toggle':
                notes.append(toggle(side, [n]))
            elif n.kind in ('callout', 'heading'):
                history.append(toggle(side, [n]))
            elif n.kind == 'image' or n.kind == 'todo':
                raise Refused('Scoped image/review association is unsupported')
            else:
                kept.append(n)
        if not any(n.kind == 'heading' and n.title == side + (' (proposta)' if side == 'New' else ' (original)') for n in sides[side].items):
            kept.insert(0, '## ' + side + (' (proposta)' if side == 'New' else ' (original)'))
        attrs = {'ratio': '50', **sides[side].attrs}
        rendered[side] = '<column' + ''.join(' ' + k + '="' + html.escape(v, quote=True) + '"' for k, v in attrs.items()) + '>\n' + join(kept) + '\n</column>'
    images, prefix = [], []
    consumed = {id(n) for column in sides.values() for n in column.items}
    for n in nodes:
        if n is columns or id(n) in consumed or n in reviews or n in tech or n in sources or n in histories:
            continue
        if n.kind == 'image':
            images.append(n)
        elif n.kind == 'heading':
            history.append(n)
        elif n.kind in ('todo', 'columns', 'column'):
            raise Refused('Ambiguous top-level review/layout content')
        elif n.kind == 'callout':
            history.append(n)
        else:
            prefix.append(n)
    review = reviews[0].raw if reviews else ('<callout icon="📝">\n<b>Revisão do PP ' + code + '</b>\n\n- [ ] Sim, aprovo a configuração New do PP ' + code + '.\n- [ ] Não, são necessárias correções.\n\n<b>Se não, porquê?</b>\n<p />\n</callout>')
    if tech:
        tech_out = tech[0].raw if not notes else toggle(TECH, tech[0].items[1:] + notes, True, tech[0].attrs)
    else:
        tech_out = toggle(TECH, notes, True)
    history_out = histories[0].raw if histories and not history else toggle(HISTORY, (histories[0].items[1:] if histories else []) + history, attrs=histories[0].attrs if histories else None) if history or histories else ''
    after = join([*images, *prefix, review, '<columns>\n' + rendered['New'] + '\n' + rendered['Old'] + '\n</columns>', tech_out, sources[0], history_out])
    after_nodes = parse(after); _, after_sides = body_sections(after_nodes)
    if mappings(after_sides) != before_mapping or ledger(nodes) - ledger(after_nodes):
        raise Refused('Exact visible-content or New/Old preservation failed')
    after_review = next(n for n in after_nodes if review_state(n, code) is not None)
    if reviews and after_review.raw != reviews[0].raw:
        raise Refused('Human review callout changed')
    return after, {'idempotent_existing_layout': False, 'exact_new_old_mappings': before_mapping, 'moved_notes': associations, 'review': review_state(after_review, code)}


def notion_url_id(url):
    parsed = urlparse(url)
    match = re.fullmatch(r'/(?:p/)?([a-fA-F0-9-]{32,36})/?', parsed.path)
    if parsed.scheme != 'https' or parsed.hostname != 'app.notion.com' or parsed.username or parsed.password or parsed.port or not match:
        raise Refused('Unsupported page URL')
    return uuid.UUID(match[1]).hex


def decode_capture(capture):
    provenance = capture.get('capture', {})
    response = capture.get('response', {})
    if response.get('isError'):
        raise Refused('Connector returned an error')
    value = response.get('structuredContent')
    if not isinstance(value, dict) or provenance.get('tool') != 'mcp__codex_apps__notion_fetch':
        raise Refused('Actual fetch response and capture provenance required')
    displayed = response.get('content')
    if (not isinstance(displayed, list) or len(displayed) != 1 or displayed[0].get('type') != 'text'
            or json.loads(displayed[0].get('text', '')) != value):
        raise Refused('Incomplete or conflicting tool response representations')
    text_value = value.get('text')
    if not isinstance(text_value, str):
        raise Refused('Missing rendered page content')
    def section(name):
        if text_value.count('<' + name + '>') != 1 or text_value.count('</' + name + '>') != 1:
            raise Refused('Incomplete or conflicting page envelope: ' + name)
        matches = re.findall('<' + name + r'>([\s\S]*?)</' + name + '>', text_value)
        if len(matches) != 1:
            raise Refused('Missing or ambiguous page ' + name)
        return matches[0].strip('\r\n')
    props = json.loads(section('properties')); body = section('content'); code = props.get('Código PP')
    if code not in PAGES:
        raise Refused('Actual PP code outside allowlist')
    requested = provenance.get('requested_id', '')
    requested_id = notion_url_id(requested) if requested.startswith('https://') else uuid.UUID(requested).hex
    page_tags = re.findall(r'<page\s+url="([^"]+)"[^>]*>', text_value)
    if (uuid.UUID(value.get('id', '')).hex != PAGES[code] or len(page_tags) != 1
            or notion_url_id(page_tags[0]) != PAGES[code] or notion_url_id(value.get('url', '')) != PAGES[code]
            or notion_url_id(props.get('url', '')) != PAGES[code] or requested_id != PAGES[code]):
        raise Refused('Conflicting actual PP code/page/request identities')
    if not value.get('title', '').startswith(code + ' ') or not props.get('PP', '').startswith(code + ' '):
        raise Refused('Conflicting page title and PP code')
    if 'cover' not in value or 'icon' not in value or not value.get('page_last_edited_at') or not provenance.get('received_at_utc'):
        raise Refused('Incomplete cover/icon/edit/capture metadata')
    for timestamp in (value['page_last_edited_at'], provenance['received_at_utc']):
        if datetime.fromisoformat(timestamp.replace('Z', '+00:00')).tzinfo is None:
            raise Refused('Capture/edit timestamps need explicit time zones')
    fields = ('truncated', 'unknown_block_count', 'unknown_block_ids')
    for extra in (value.get('metadata', {}), response.get('_meta', {})):
        if isinstance(extra, dict):
            for name in fields:
                if name in extra and (extra[name] not in (False, 0, []) or (name in value and extra[name] != value[name])):
                    raise Refused('Conflicting/negative nested connector coverage evidence')
    missing = [k for k in fields if k not in value]
    if missing:
        coverage = {'state': 'UNKNOWN', 'missing_fields': missing}
    elif value['truncated'] is not False or type(value['unknown_block_count']) is not int or value['unknown_block_count'] != 0 or value['unknown_block_ids'] != []:
        raise Refused('Connector reports truncation/unknown or unsupported content')
    else:
        coverage = {'state': 'EXPLICIT_COMPLETE_EXPORT', 'missing_fields': []}
    def stable_metadata(value):
        if isinstance(value, dict):
            return {k: stable_metadata(v) for k, v in value.items() if k != 'expiry_time'}
        if isinstance(value, list):
            return [stable_metadata(v) for v in value]
        return value
    state_hash = digest({'page_id': PAGES[code], 'code': code, 'body': body,
                         'properties': props, 'cover': stable_metadata(value['cover']), 'icon': value['icon'],
                         'edited_at': value['page_last_edited_at'], 'coverage': coverage})
    return {'representation': 'notion-mcp-markdown', 'code': code, 'page_id': PAGES[code], 'body': body,
            'properties': props, 'cover': value['cover'], 'icon': value['icon'], 'coverage': coverage,
            'page_last_edited_at': value['page_last_edited_at'], 'capture': provenance,
            'snapshot_sha256': digest(capture), 'source_state_sha256': state_hash}


def plan(capture, template_capture):
    report = {'status': 'BLOCKED', 'apply_allowed': False, 'representation': 'notion-mcp-markdown', 'source_capture_sha256': digest(capture),
              'synthetic_capture': bool(capture.get('capture', {}).get('synthetic')) if isinstance(capture, dict) else False}
    try:
        source = decode_capture(capture); template = decode_capture(template_capture)
        if template['code'] != '428':
            raise Refused('Exact real PP428 template required')
        after, proof = format_markdown(source['body'], source['code'], template['body'])
        rerun, _ = format_markdown(after, source['code'], template['body'])
        if rerun != after:
            raise Refused('Layout is not semantically idempotent')
        complete = source['coverage']['state'] == template['coverage']['state'] == 'EXPLICIT_COMPLETE_EXPORT'
        report.update(status='LOCAL_PROPOSAL_PENDING_REVIEW' if complete else 'BLOCKED_COVERAGE_UNKNOWN',
                      code=source['code'], page_id=source['page_id'], source_coverage=source['coverage'], template_coverage=template['coverage'],
                      page_last_edited_at=source['page_last_edited_at'], captured_at_utc=source['capture']['received_at_utc'],
                      template_capture_sha256=digest(template_capture), before_body_sha256=digest(source['body']),
                      source_state_sha256=source['source_state_sha256'],
                      after_body_sha256=digest(after), preservation=proof,
                      metadata_unchanged_sha256=digest({k: source[k] for k in ('properties', 'cover', 'icon')}),
                      reason=None if complete else 'Fetch omits explicit truncation/unknown-block evidence. Visible-content preview only; full-page completeness is unproved.')
        report['proposed_content' if complete else 'quarantined_visible_content_preview'] = after
    except (Refused, ValueError, TypeError, KeyError, AttributeError) as error:
        report['reason'] = str(error) if isinstance(error, Refused) else 'Unsupported or conflicting capture structure'
    return report


def verify_precondition(proposal, current_capture):
    try:
        source = decode_capture(current_capture)
        return (proposal.get('status') == 'LOCAL_PROPOSAL_PENDING_REVIEW' and source['coverage']['state'] == 'EXPLICIT_COMPLETE_EXPORT'
                and proposal.get('code') == source['code'] and proposal.get('page_id') == source['page_id']
                and proposal.get('source_state_sha256') == source['source_state_sha256'])
    except (Refused, ValueError, TypeError, KeyError, AttributeError):
        return False


def preview_legacy(snapshot, template_capture):
    """Historical fixture support is explicit; it never masquerades as a fresh fetch."""
    report = {'status': 'BLOCKED_HISTORICAL_COVERAGE_UNKNOWN', 'apply_allowed': False,
              'representation': 'legacy-notion-rendered-fixture', 'source_freshness': 'historical_fixture_not_refetched',
              'source_snapshot_sha256': digest(snapshot)}
    try:
        from format_layout import identity
        code, page_id, _ = identity(snapshot)
        if snapshot.get('fetchError') or any(k not in snapshot for k in ('content', 'properties', 'cover', 'icon')):
            raise Refused('Incomplete historical fixture')
        props_url = snapshot['properties'].get('url', '')
        if notion_url_id(props_url) != page_id:
            raise Refused('Historical property URL conflicts with page identity')
        body = snapshot['content']
        if body.strip().startswith('<content>'):
            match = re.fullmatch(r'\s*<content>\s*([\s\S]*?)\s*</content>\s*', body)
            if not match:
                raise Refused('Incomplete historical content envelope')
            body = match[1]
        template = decode_capture(template_capture)
        if template['code'] != '428':
            raise Refused('Exact real PP428 template required')
        after, proof = format_markdown(body, code, template['body'])
        if format_markdown(after, code, template['body'])[0] != after:
            raise Refused('Historical preview is not idempotent')
        report.update(code=code, page_id=page_id, before_body_sha256=digest(body), after_body_sha256=digest(after),
                      preservation=proof, quarantined_visible_content_preview=after,
                      reason='Historical rendered snapshot; no fresh fetch or explicit completeness evidence. Not an application proposal.')
    except (Refused, ValueError, TypeError, KeyError, AttributeError) as error:
        report['reason'] = str(error) if isinstance(error, Refused) else 'Unsupported historical fixture structure'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True, nargs='+')
    parser.add_argument('--template', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve() in {p.resolve() for p in [*args.input, args.template]}:
        parser.error('Output cannot overwrite inputs')
    def load(path):
        if path.stat().st_size > 8_000_000:
            raise ValueError('Capture exceeds bounded size')
        return json.loads(path.read_text(encoding='utf-8-sig'))
    template = load(args.template)
    reports = [{'input': str(path), **plan(load(path), template)} for path in args.input]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Local rendered reports: ' + str(len(reports)) + '; blocked: ' + str(sum(r['status'].startswith('BLOCKED') for r in reports)))


if __name__ == '__main__':
    main()
