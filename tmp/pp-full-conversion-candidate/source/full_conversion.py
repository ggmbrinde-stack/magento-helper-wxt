"""Full-page source-backed PP conversion plans. No network access or Notion writer."""
import collections
import copy
import difflib
import html
import json
from pathlib import Path
import re
import uuid

import batch_apply as a
import batch_plan as b
import full_excel as excel
import full_regions as regions
import method_plan as rules
import method_targets
import page_batch
import rendered_layout as r
from catalog_names import option_name, option_tech

VERSION = 'PP_FULL_CONVERSION_V1'
POCKET_CODES = {'428', '430', '558', '661', '662'}
POCKET_TRANSFER = 'Transfer - Até 126 cm2 - 1 Cor (aprox. 11,2x11,2cm - MOCHILA)'


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def page_id(value):
    return r.notion_url_id(value) if value.startswith('https://') else uuid.UUID(value).hex


def rule_source(response):
    if response.get('isError'):
        raise ValueError('Leitura das regras falhou')
    value = response['structuredContent']
    if len(response.get('content', [])) != 1 or json.loads(response['content'][0]['text']) != value:
        raise ValueError('Representações das regras em conflito')
    if page_id(value['id']) != b.HOME:
        raise ValueError('Página de regras fora da Working Copy')
    for extra in (value, value.get('metadata', {}), response.get('_meta', {})):
        for name, expected in {'truncated': False, 'unknown_block_count': 0, 'unknown_block_ids': []}.items():
            if name in extra and (type(extra[name]) is not type(expected) or extra[name] != expected):
                raise ValueError('As regras têm conteúdo omitido ou truncado')
    text = value['text']
    tabs = {}
    for title in ('IMP', 'Regras de Atualização'):
        found = re.findall(r'<tab[^>]*>\s*' + re.escape(title) + r'\s+([\s\S]*?)</tab>', text)
        if len(found) != 1:
            raise ValueError('Separador de regras ausente ou repetido: ' + title)
        tabs[title] = found[0]
    return tabs


def verify_rules(response, expected):
    if r.digest(rule_source(response)) != expected:
        raise a.SourceGuardError('As regras IMP/Regras mudaram desde a revisão do plano')


def catalog(tabs):
    matches = re.findall(r'<column[^>]*>\s*New\s+([\s\S]*?)</column>', tabs['IMP'])
    if len(matches) != 1:
        raise ValueError('É necessária a coluna IMP New exacta')
    return list(dict.fromkeys(b.lines(m[2:])[0] for m in matches[0].splitlines()
                             if m.startswith('- ') and len(b.lines(m[2:])) == 1 and option_tech(b.lines(m[2:])[0])))


def category(record, context):
    if context.get('category'):
        return context['category']
    text = rules.key(record['title'] + ' ' + record['description'])
    if 'avental' in text:
        return 'APRON_SET' if 'conj' in text else 'APRON'
    if any(x in text for x in ('bone', 'panama', 'gorro', 'boina')):
        return 'CAP'
    if 'guarda-sol' in text or 'guarda-sois' in text:
        return 'PARASOL'
    if 'guarda-chuva' in text:
        return 'UMBRELLA'
    if 'manta' in text:
        return 'BLANKET'
    if 'toalha' in text:
        if any(x in text for x in ('banho', 'praia')): return 'TOWEL_LARGE'
        if any(x in text for x in ('pequena', 'social', 'mao', 'rosto')): return 'TOWEL_SMALL'
    if any(x in text for x in ('bloco', 'agenda', 'caderno')):
        return 'NOTEBOOK'
    if 'garrafa' in text:
        return 'BOTTLE'
    if any(x in text for x in ('saco', 'mochila', 'bolsa', 'necessaire')):
        if 'grande' in text: return 'BAG_LARGE'
        if 'pequen' in text: return 'BAG_SMALL'
        return 'BAG_UNKNOWN_SIZE'
    if 'sublim' in text:
        return 'SUBLIMATION'
    if record['area'] == 'Têxtil':
        return 'TEXTILE'
    return 'GENERAL'


def same_option(value, candidates):
    # Exact business fields, not fuzzy names or page-to-page option copying.
    try: name = option_name(value)
    except ValueError: return []
    return [x for x in candidates if option_name(x) == name]


def generate(record, context, choices):
    kind = category(record, context)
    output, questions, changes = [], [], []
    for group in record['groups']:
        locations = group['locals']
        sizes = {rules.reference(kind, loc, context) for loc in locations}
        size = next(iter(sizes)) if len(sizes) == 1 else None
        if kind in ('NOTEBOOK', 'SUBLIMATION') and not size:
            explicit = re.findall(r'\bA[1-8]\b', record['title'] + ' ' + record['description'])
            if len(set(explicit)) == 1: size = explicit[0]
        originals = [x['original'] for x in group['options']]
        selected, pending = [], []
        if not originals:
            pending.append('Área ou opções não definidas na origem Excel')
        for original in originals:
            tech = option_tech(original)
            if tech == 'Transfer Digital':
                changes.append({'locations': locations, 'before': original, 'after': None,
                                'reason': 'Transfer Digital Têxtil retirado por decisão humana'})
                continue
            candidates = [x for x in choices if option_tech(x) == tech]
            if kind == 'SUBLIMATION' and tech != 'Sublimação':
                pending.append('Artigo de sublimação com outra técnica na origem: ' + original)
                continue
            if tech == 'Transfer' and record['code'] in POCKET_CODES and all('bolso' in rules.key(x) for x in locations) and '126' in original:
                wanted = [POCKET_TRANSFER]
            elif tech in ('DTF', 'Flex', 'Bordado', 'Estamparia', 'Sublimação') and size:
                wanted = [x for x in candidates if re.search(r'\b' + size + r'\b', x)]
            elif kind == 'BOTTLE' and tech in ('UV Circular', 'Laser Circular', 'Serigrafia Circular'):
                # Compatibility is evidenced by the technique on this own source group.
                limit = {'UV Circular': '260', 'Laser Circular': '50', 'Serigrafia Circular': '1 Cor'}[tech]
                wanted = [x for x in candidates if re.search(r'(?<!\d)' + re.escape(limit) + r'(?!\d)', x)] if re.search(r'(?<!\d)' + re.escape(limit) + r'(?!\d)', original) else []
            else:
                wanted = same_option(original, candidates)
            decision = context.get('confirmed_options', {}).get('|'.join(locations))
            if decision:
                if decision.get('human_confirmed') is not True or not decision.get('evidence_reference'):
                    raise ValueError('Escolhas específicas exigem referência humana explícita')
                allowed = set(choices) | set(context.get('confirmed_catalog_exceptions', []))
                if not decision.get('options') or set(decision['options']) - allowed:
                    raise ValueError('Escolha fora do catálogo e das excepções revistas')
                selected = decision['options'][:]
                pending = []
                break
            if len(wanted) == 1:
                selected.append(wanted[0])
                if wanted[0] != original:
                    changes.append({'locations': locations, 'before': original, 'after': wanted[0], 'reference_size': size})
            else:
                selected.append(original)
                pending.append('Sem correspondência única aprovada em IMP New: ' + original)
            if tech == 'Tampografia' and re.search(r'\b2\s*Cor', original, re.I):
                pending.append('Tampografia 2 cores: decisão de negócio ainda pendente')
            if kind in ('APRON', 'APRON_SET') and any('caixa' in rules.key(x) for x in locations):
                pending.append('Caixa: confirmar material e processo/área próprios')
            if kind == 'BAG_UNKNOWN_SIZE':
                pending.append('Saco/bolsa: falta confirmar se é pequeno ou grande')
            if kind in ('NOTEBOOK', 'SUBLIMATION') and not size:
                pending.append('Falta dimensão do artigo na origem ou no contexto revisto')
        selected = list(dict.fromkeys(selected))
        if not selected:
            pending.append('Não há opções New confirmadas para este grupo')
        output.append({'locations': locations, 'options': selected, 'shared_source_group': len(locations) > 1})
        questions.extend(' / '.join(locations) + ': ' + q for q in pending)
    return output, list(dict.fromkeys(questions)), changes, kind


def table(groups):
    rows = [['Face / local', 'Opções completas e especificações']]
    rows += [['<br />'.join(b.inline(x) for x in g['locations']),
              '<br />'.join(b.inline(x) for x in g['options']) or 'Por confirmar na origem'] for g in groups]
    return r.xml_table(r.Node('table', '', rows=rows))


def own_review(nodes, code):
    values = [n for n in r.descend(nodes) if r.review_state(n, code) is not None]
    if len(values) > 1: raise ValueError('Decisão Sim/Não repetida')
    if values: return values[0].raw
    return ('<callout icon="📝">\n<b>Revisão do PP ' + code + '</b>\n\n'
            '- [ ] Sim, aprovo a configuração New do PP ' + code + '.\n'
            '- [ ] Não, são necessárias correções.\n\n<b>Se não, porquê?</b>\n<p />\n</callout>')


def notes(nodes):
    result = []
    def visit(items, side='Old', in_column=False):
        for node in items:
            if node.kind == 'heading':
                title = rules.key(node.title)
                if 'proposta' in title or title.startswith('new'): side = 'New'
                if title.startswith(('old', 'antes')): side = 'Old'
            if node.kind == 'table' and len(node.rows[0]) > 2 and 'local' in rules.key(node.rows[0][0]):
                for row in node.rows[1:]:
                    for value in row[2:]:
                        if value.strip(): result.append({'side': side, 'location': row[0], 'text': value})
            if node.kind in ('columns', 'column'):
                visit(node.items, side, True)
            elif in_column and node.kind not in ('table', 'heading', 'image'):
                result.append({'side':side,'location':'Geral','text':node.raw})
    visit(nodes)
    return result


def preserve_current_extras(state, record, new, questions):
    nodes = regions.parse(state['body'])
    active = [n for n in nodes if n.kind != 'toggle' or n.title not in (r.SOURCE, r.HISTORY, 'Fonte')]
    originals = [n for n in r.descend(active) if n.kind == 'table' and len(n.rows[0]) >= 2
                 and 'local' in rules.key(n.rows[0][0]) and 'propost' not in rules.key(n.rows[0][1])]
    try:
        _, sides = r.body_sections(nodes)
        originals = [n for n in sides['Old'].items if n.kind == 'table']
    except ValueError: pass
    for table_node in originals:
        for row in table_node.rows[1:]:
            locs = {rules.key(x) for x in b.lines(row[0])}
            groups = [g for g in new if {rules.key(x) for x in g['locations']} == locs]
            source_groups = [g for g in record['groups'] if {rules.key(x) for x in g['locals']} == locs]
            if len(groups) != 1 or len(source_groups) != 1:
                continue
            source_names = {option_name(x['original']) for x in source_groups[0]['options']}
            for value in b.lines(row[1]):
                if option_tech(value) and option_name(value) not in source_names:
                    if value not in groups[0]['options']: groups[0]['options'].append(value)
                    questions.append(' / '.join(groups[0]['locations']) + ': opção actual ausente do Excel, preservada até revisão: ' + value)
    return list(dict.fromkeys(questions))


def validate_layout(body, code):
    nodes=regions.parse(body); columns,sides=r.body_sections(nodes)
    reviews=[n for n in nodes if r.review_state(n,code) is not None]
    technical=[n for n in nodes if n.kind=='toggle' and n.title==r.TECH]
    sources=[n for n in nodes if n.kind=='toggle' and n.title in (r.SOURCE,'Fonte')]
    histories=[n for n in nodes if n.kind=='toggle' and n.title==r.HISTORY]
    if any(len(x)!=1 for x in (reviews,technical,sources,histories)):
        raise ValueError('Layout completo exige revisão própria, notas, fonte e histórico únicos')
    order=[nodes.index(x) for x in (reviews[0],columns,technical[0],sources[0],histories[0])]
    if order!=sorted(order) or any(nodes.index(n)>order[0] for n in nodes if n.kind=='image'):
        raise ValueError('Ordem do layout completo ou do hero foi alterada')
    for column in sides.values():
        tables=[n for n in column.items if n.kind=='table']
        if len(tables)!=1 or any(len(row)!=2 for row in tables[0].rows):
            raise ValueError('New/Old exigem uma tabela de duas colunas em cada lado')


def render(state, record, new, pending, binding, bounded=None):
    nodes = regions.parse(state['body'])
    source = [n for n in nodes if n.kind == 'toggle' and n.title in (r.SOURCE, 'Fonte')]
    if len(source) != 1: raise ValueError('É necessária uma fonte original inequívoca, preservada no mesmo local')
    histories = [n for n in nodes if n.kind == 'toggle' and n.title == r.HISTORY]
    marker = VERSION + ' ' + binding
    if any(marker in n.raw for n in histories):
        # A full-scope marker is necessary, but the current New/Old and layout are checked too.
        validate_layout(state['body'],state['code'])
        _, sides = r.body_sections(nodes)
        if r.mappings(sides) != {'New': [regions.parse(table(new))[0].rows],
                                 'Old': [regions.parse(table([{'locations': g['locals'], 'options': [x['original'] for x in g['options']]} for g in record['groups']]))[0].rows]}:
            raise ValueError('PP anteriormente convertido foi modificado; requer novo plano e revisão')
        return state['body'], [], {'idempotent': True, 'marker': marker, 'notes': notes(nodes)}
    flat = [n for n in nodes if n is not source[0]]
    images = [n.raw for n in r.descend(flat) if n.kind == 'image']
    tables = [n for n in r.descend(flat) if n.kind == 'table' and 'local' in rules.key(n.rows[0][0])]
    if not tables: raise ValueError('Página sem tabela de locais suportada')
    own_notes = notes(flat)
    # Own prose, including references and body comments, never comes from PP428.
    prose = [n.raw for n in flat if n.kind == 'paragraph']
    if not prose:
        prose = [b.inline(record['description'])] if record['description'] else []
    review = own_review(flat, state['code'])
    old = [{'locations': g['locals'], 'options': [x['original'] for x in g['options']]} for g in record['groups']]
    technical = [r.toggle(x['side'] + ': ' + x['location'], [x['text']]) for x in own_notes]
    technical += ['- ' + b.inline(x) for x in pending]
    # Existing body callouts/toggles remain explicitly associated, beyond their historical copy.
    technical += [n.raw for n in flat if n.kind in ('toggle', 'callout') and n.raw != review and n.title != r.HISTORY]
    layout = r.join([*images, *prose, review,
        '<columns>\n<column ratio="50">\n## New (proposta)\n\n' + table(new) +
        '\n</column>\n<column ratio="50">\n## Old (original)\n\n' + table(old) + '\n</column>\n</columns>',
        r.toggle(r.TECH, technical, True)])
    raw = r.xml_table(r.Node('table', '', rows=[['Célula', 'Texto original']] + [[b.inline(x['cell']), b.inline(str(x['value']))] for x in record['raw']]))
    excel_notes = [r.toggle('Comentário Excel: '+x['cell'], [b.inline(x['text'])]) for x in record.get('comments', [])]
    history = r.toggle(r.HISTORY, [marker, r.toggle('Origem Excel verificada', [b.inline(record['source']), raw, *excel_notes]),
        r.toggle('Apresentação anterior preservada', [n.raw for n in flat])])
    operations = []
    mutable = [n for n in nodes if n is not source[0]]
    if not mutable or not all(regions.leaf(n) or regions.verified_container(n, state, bounded) for n in mutable):
        # We can render these pages, but must not rewrite an unverified native container.
        desired = r.join([layout, source[0], history])
        return desired, [], {'idempotent': False, 'marker': marker, 'notes': own_notes,
                            'blocked_region': 'Contentor existente exige prova limitada de preservação ou edição nativa suportada'}
    anchor = mutable[0]
    if nodes[0] is source[0]:
        raise ValueError('Fonte antes do conteúdo: requer uma inserção inicial revista separadamente')
    # The durable journal contains the full before snapshot before the first leaf edit.
    # Remove old leaves before adding their exact copies, so targets never become ambiguous.
    groups = []
    for node in nodes:
        if node is source[0]:
            groups.append([])
        elif not groups: groups = [[node]]
        else: groups[-1].append(node)
    for group in reversed([g for g in groups if g]):
        first, last = group[0], group[-1]
        prefix = '\n\n' if state['body'][:first.start].endswith('\n\n') else ''
        suffix = '\n\n' if state['body'][last.end:].startswith('\n\n') else ''
        old = prefix + state['body'][first.start:last.end] + suffix
        replacement = prefix + (layout if anchor in group else '') + suffix
        operations.append({'kind': 'body', 'payload': {'command': 'update_content', 'page_id': state['page_id'],
            'content_updates': [{'old_str': old, 'new_str': replacement, 'replace_all_matches': False}]}})
    operations.append({'kind': 'append', 'payload': {'command': 'insert_content', 'page_id': state['page_id'],
                       'position': {'type': 'end'}, 'content': '\n\n' + history}})
    current = copy.deepcopy(state)
    for index, op in enumerate(operations, 1):
        op.update(id=state['code'] + '-full-body-' + str(index), eligible=True)
        op['region_evidence'] = regions.inspect(current, op['payload'], bounded)
        current['body'], _ = a.apply_model(current['body'], b.stable_metadata(current), op['payload'])
    desired = current['body']
    validate_layout(desired,state['code'])
    return desired, operations, {'idempotent': False, 'marker': marker, 'notes': own_notes}


def properties(state, new, schema):
    locations = list(dict.fromkeys(x for g in new for x in g['locations']))
    options = list(dict.fromkeys(x for g in new for x in g['options']))
    wanted = {'Faces': locations, 'Número de locais possíveis': len(locations),
              'Técnicas': list(dict.fromkeys(option_tech(x) for x in options)),
              'Opções de personalização': list(dict.fromkeys(option_name(x) for x in options))}
    if None in wanted['Técnicas']: raise ValueError('Técnica New não reconhecida')
    payload = {'command': 'update_properties', 'page_id': state['page_id'], 'properties': wanted}
    a.validate_properties(payload, schema)
    delta = {k: v for k, v in wanted.items() if state['properties'].get(k) != v and
             not (isinstance(v, list) and set(v) == set(state['properties'].get(k) or []))}
    return wanted, delta


def validate_properties(state, payload, schema):
    _, sides = r.body_sections(regions.parse(state['body']))
    tables = r.mappings(sides)['New']
    new = [{'locations': b.lines(row[0]), 'options': b.lines(row[1])} for t in tables for row in t[1:]]
    wanted, _ = properties(state, new, schema)
    if any(k not in wanted or wanted[k] != v for k, v in payload['properties'].items()):
        raise ValueError('As propriedades não correspondem ao New actualmente guardado')


def prepare(captures, workbook, index_path, inventory_path, codes, output, contexts=None):
    captures, output = Path(captures), Path(output)
    index = load(index_path)
    if excel.file_sha(workbook) != index['source']['sha256'] or index['source']['sha256'] != __import__('excel_proof').SHA:
        raise ValueError('Excel diferente da origem autorizada')
    inv = load(inventory_path); selected = excel.inventory(inv)
    if not codes or len(codes) != len(set(codes)) or set(codes) - set(selected):
        raise ValueError('Selecção de códigos não pertence ao inventário exacto')
    excluded = [code for code in codes if code == '601']; codes = [code for code in codes if code != '601']
    if not codes: raise ValueError('PP601 é protegido; não há alvos mutáveis')
    manifest = {'collection': b.COLLECTION, 'group_id': 'full-' + '-'.join(codes), 'review_scope': VERSION,
                'inventory_sha256': excel.file_sha(inventory_path),
                'targets': {code: {'page_id': page_id(selected[code]['url']), 'mode': 'FULL_CONVERSION'} for code in codes}}
    method_targets.configure(manifest)
    home = load(captures / 'home.json'); tabs = rule_source(home); choices = catalog(tabs)
    schema = b.schema_state(load(captures / 'schema.json'))
    template = load(captures / 'pp428.json')
    # Template defines structure only; no PP428 business value is used by render().
    template_text = template['response']['structuredContent']['text']
    if page_id(template['response']['structuredContent']['id']) != '074b6705ae1f8257a53701d87a64eb32' or '<column ratio="50">' not in template_text:
        raise ValueError('Referência de layout PP428 não verificada')
    contexts = load(contexts) if contexts else {}
    pages = []
    bounded_path = captures / 'browser-regions.json'
    bounded_pages = load(bounded_path)['pages'] if bounded_path.exists() else {}
    template_body=re.findall(r'<content>([\s\S]*?)</content>',template_text)
    if len(template_body)!=1:raise ValueError('Corpo da referência de layout ausente ou ambíguo')
    source_binding = {'rules_sha256': r.digest(tabs), 'excel_sha256': index['source']['sha256'],
                      'index_sha256': excel.file_sha(index_path), 'template_sha256': r.digest(template_body[0].strip('\r\n')), 'scope': VERSION}
    for code in codes:
        source_error=None
        capture={}
        try:
            capture = load(captures / ('pp' + code + '.json'))
            if not isinstance(capture,dict):capture={};raise ValueError('Capture must be an object')
            state = b.page_state(capture)
        except (ValueError, KeyError, TypeError, OSError, AttributeError, IndexError) as error:
            source_error='Leitura inicial do PP recusada: '+str(error)
            props={}
            try:props=page_batch.identity(capture['response'],{'code':code,'page_id':manifest['targets'][code]['page_id']})['properties']
            except (ValueError,KeyError,TypeError,AttributeError,IndexError):pass
            state={'code':code,'page_id':manifest['targets'][code]['page_id'],'body':'','properties':props,
                   'cover':None,'icon':None,'source_state_sha256':None}
        if state['code'] != code or state['page_id'] != manifest['targets'][code]['page_id']:
            raise ValueError('Identidade actual diferente do manifesto revisto')
        page = {'code': code, 'page_id': state['page_id'], 'status': 'READY_FOR_REVIEW', 'reasons': [],
                'source_state_sha256': state['source_state_sha256'], 'source_body': state['body'],
                'source_metadata': b.stable_metadata(state), 'validation_policy': regions.policy(),
                'operations': [], 'property_operations': [], 'technical_unresolved': [], 'method_complete': False,
                'synthetic_capture':bool(capture.get('capture',{}).get('synthetic'))}
        try:
            if source_error:raise ValueError(source_error)
            record = excel.record(index, code)
            new, questions, changes, kind = generate(record, contexts.get(code, {}), choices)
            questions = preserve_current_extras(state, record, new, questions)
            binding = r.digest({**source_binding, 'code': code, 'record': record, 'context': contexts.get(code, {})})
            bounded = copy.deepcopy(bounded_pages.get(code))
            if bounded:
                if bounded['source_edited_at'] != state['page_last_edited_at'] or bounded['page_id'] != state['page_id']:
                    raise ValueError('Observação do navegador refere-se a outro estado do PP')
                bounded.update(source_state_sha256=state['source_state_sha256'], global_export_claimed=False)
                page['bounded_region_evidence'] = bounded
            desired, ops, preservation = render(state, record, new, questions, binding, bounded)
            try:wanted, delta = properties(state, new, schema)
            except ValueError as error:
                wanted, delta = {}, {}
                questions.append('Sincronização das propriedades pendente: '+str(error))
            page.update(desired_body=desired, operations=ops, technical_unresolved=questions, rule_changes=changes,
                        category=kind, new_groups=new, excel=record, preservation=preservation,
                        completion_binding={'full_scope_sha256': binding, **source_binding,
                            'source_state_sha256':state['source_state_sha256'],'implementation_sha256':b.implementation_sha()}, wanted_properties=wanted,
                        method_complete=not questions and not preservation.get('blocked_region'))
            if preservation.get('blocked_region'): page['full_prepare_error'] = preservation['blocked_region']
            if not questions and not page.get('full_prepare_error') and delta:
                page['property_operations'] = [{'id': code + '-full-properties', 'kind': 'properties', 'eligible': True,
                    'payload': {'command': 'update_properties', 'page_id': state['page_id'], 'properties': delta}}]
            page['diff'] = ''.join(difflib.unified_diff(state['body'].splitlines(True), desired.splitlines(True), fromfile=code + '-before', tofile=code + '-after'))
        except (ValueError, KeyError, TypeError) as error:
            page.update(full_prepare_error=str(error), desired_body=state['body'], diff='')
        for key, suffix, kind, status in [('completion_status_operation', 'full-review-status', 'success_status', 'Para revisão'),
                                           ('failure_status_operation', 'full-error-status', 'error_status', 'Erro')]:
            page[key] = {'id': code + '-' + suffix, 'kind': kind, 'eligible': True,
                'payload': {'command': 'update_properties', 'page_id': state['page_id'], 'properties': {'Estado': status}}}
        if page.get('full_prepare_error'): page['status']='READY_FOR_ERROR_REPORT'
        elif not page['method_complete']: page['status']='LAYOUT_ONLY_PENDING_BUSINESS'
        pages.append(page)
    proof = {'workbook': str(Path(workbook).resolve()), 'workbook_sha256': index['source']['sha256'],
             'evidence_sha256': excel.file_sha(index_path), 'records': {p['code']: p.get('excel') for p in pages}}
    bundle = {'version': VERSION, 'validation_policy': regions.policy(), 'target_manifest': manifest,
        'target_manifest_sha256': r.digest(manifest), 'working_copy': b.HOME, 'collection': b.COLLECTION,
        'excel': proof, 'evidence_path': str(Path(index_path).resolve()),
        'inventory_path': str(Path(inventory_path).resolve()), 'inventory_sha256': excel.file_sha(inventory_path),
        'schema_state': schema, 'schema_state_sha256': r.digest(schema), 'full_scope': source_binding,
        'page_failure_isolation': page_batch.POLICY, 'synthetic': any(p['synthetic_capture'] for p in pages),
        'apply_allowed_now': False, 'excluded_protected_codes': excluded, 'pages': pages,
        'implementation_sha256': b.implementation_sha()}
    a.atomic(output, bundle)
    reports = output.parent / (output.stem + '-reports'); reports.mkdir(exist_ok=True)
    for p in pages:
        a.atomic(reports / ('PP' + p['code'] + '.json'), p)
        (reports / ('PP' + p['code'] + '-before.md')).write_text(p['source_body'], encoding='utf-8')
        (reports / ('PP' + p['code'] + '-after.md')).write_text(p['desired_body'], encoding='utf-8')
    coverage=excel.coverage(index,inv);a.atomic(reports/'notion-excel-join.json',coverage)
    result = {'plan_sha256': r.digest(bundle), 'implementation_sha256': bundle['implementation_sha256'],
              'coverage': {k:v for k,v in coverage.items() if k!='notion_bindings'}, 'pages': [{'code': p['code'], 'method_complete': p['method_complete'],
                  'body_operations': len(p['operations']), 'property_operations': len(p['property_operations']),
                  'pending': p['technical_unresolved'], 'preparation_error': p.get('full_prepare_error')} for p in pages]}
    a.atomic(reports / 'summary.json', result)
    approval = {'authorisation': 'EXPLICIT_HUMAN_APPROVAL', 'review_reference': '', 'plan_sha256': r.digest(bundle),
                'implementation_sha256': bundle['implementation_sha256'], 'approved_codes': codes,
                'approved_operation_ids': [op['id'] for p in pages for op in p['operations'] + p['property_operations'] +
                                           [p['completion_status_operation'], p['failure_status_operation']]]}
    a.atomic(output.with_suffix('.approval-pending.json'), approval)
    return result
