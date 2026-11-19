"""Ler o Excel, preparar opções e importar PPs sem substituir páginas existentes."""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import posixpath
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zipfile

VERSION = "2026-03-11"
NS = {
    "s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "d": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
SHEETS = {
    "PPs TÊXTIL": ("Têxtil", [3]),
    "PPs BRINDES": ("Brindes", [3, 9, 16, 23, 29, 34, 39]),
    "PPs BRINDE TÊXTIL": ("Brinde têxtil", [3, 8, 13]),
}
HEADERS = {"LOCAL", "LOCAIS", "ÁREA", "PERS.", "PERSONALIZAÇÃO"}
TECHNIQUES = [
    "Transfer Digital", "DTF UV", "UV Circular", "Laser Metal",
    "Laser CO2", "Laser Circular", "Serigrafia Circular", "Serigrafia",
    "Estamparia", "Tampografia", "Transfer", "DTF", "Flex", "Bordado",
    "Sublimação", "Termogravura", "Selo Auto", "Cracha Alfinete", "Cracha Iman",
    "Inserção de Papel", "Etiqueta Vitrificada", "Vinil Autocolante",
    "Laminação", "Lona", "Iman Personalizado", "Pin Personalizado",
    "Tapete de Rato", "Artigo 100%", "CUSTO EXTRA FILME", "UV",
]


def clean(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(value or ""))).strip()


def key(value):
    return clean(value).casefold()


def addr(col, row):
    name = ""
    while col:
        col, rem = divmod(col - 1, 26)
        name = chr(65 + rem) + name
    return f"{name}{row}"


def parts(ref):
    match = re.fullmatch(r"([A-Z]+)(\d+)", ref)
    if not match:
        raise ValueError(f"Célula inválida: {ref}")
    col = 0
    for char in match[1]:
        col = col * 26 + ord(char) - 64
    return col, int(match[2])


def digest(path):
    with Path(path).open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def option_name(raw):
    """Uniformizar técnica/limite/cores; conservar o texto integral no plano e corpo."""
    text = clean(raw).replace("–", "-").replace("—", "-")
    text = re.sub(r"\bcm2\b", "cm²", text, flags=re.I)
    text = re.sub(r"\bAte\b", "Até", text, flags=re.I)
    text = re.sub(r"\s+-\s*|\s*-\s+", " - ", text)
    tech = next((t for t in TECHNIQUES if text.casefold().startswith(t.casefold())), None)
    limit = re.search(
        r"(?i)\bAté\s+(?:[\d.]+\s*cm²|A\d+)\b|>\s*[\d.]+\s*cm²"
        r"|\bEntre\s+\d+\s+e\s+\d+\s*cm²|\bA6/A5\b", text)
    colors = re.search(r"(?i)\b(\d+)\s*Cor(?:es)?\b", text)
    # These standard families have explicit capacity/colour fields in this workbook.
    standard = TECHNIQUES[:16] + ["UV"]
    if tech in standard and (limit or (tech == "Tampografia" and colors)):
        label = tech
        if tech == "Laser CO2" and re.search(r"(?i)\(madeira\)", text):
            label += " (Madeira)"
        fields = [label]
        if limit:
            fields.append(re.sub(r"(?i)^Até", "até", limit[0]))
        if colors:
            count = int(colors[1])
            fields.append(f"{count} {'cor' if count == 1 else 'cores'}")
        mode = re.search(r"(?i)Repetição|1[ªa]\s*Vez", text)
        if mode:
            fields.append("repetição" if key(mode[0]) == "repetição" else "1.ª vez")
        multiplier = re.search(r"(?i)\bx\s*(\d+)\b", text)
        if tech == "Tampografia" and multiplier:
            fields.append("× " + multiplier[1])
        text = " — ".join(fields)
    else:
        text = text.replace(" - ", " — ")
    # Notion option names cannot contain commas; the original remains unmodified.
    text = re.sub(r"(?<=\d),(?=\d)", ".", text).replace(",", " —")
    text = clean(text)
    if not text or len(text) > 100:
        raise ValueError(f"Nome de opção requer revisão: {raw!r}")
    return text


def option_tech(raw):
    text = clean(raw)
    if text.upper().startswith("TRANSFER DTF"):
        return "DTF"
    if text.upper().startswith("TRANSFER FLEX"):
        return "Flex"
    return next((t for t in TECHNIQUES if text.casefold().startswith(t.casefold())), None)


class Excel:
    def __init__(self, path):
        self.path = Path(path).resolve()
        self.z = zipfile.ZipFile(self.path)
        bad = self.z.testzip()
        if bad:
            self.z.close()
            raise ValueError(f"Entrada corrompida no Excel: {bad}")
        self.styles = list(self.xml("xl/styles.xml").find("s:cellXfs", NS))
        self.borders = list(self.xml("xl/styles.xml").find("s:borders", NS))
        strings = self.xml("xl/sharedStrings.xml")
        self.strings = ["".join(e.itertext()) for e in strings]
        rels = self.relationships("xl/workbook.xml")
        self.sheets = {}
        for sheet in self.xml("xl/workbook.xml").findall("s:sheets/s:sheet", NS):
            path = rels[sheet.get("{" + NS["r"] + "}id")]
            root = self.xml(path)
            cells = {}
            for cell in root.findall("s:sheetData/s:row/s:c", NS):
                value = cell.find("s:v", NS)
                if cell.get("t") == "s" and value is not None:
                    value = self.strings[int(value.text)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(cell.find("s:is", NS).itertext())
                else:
                    value = value.text if value is not None else None
                cells[parts(cell.get("r"))] = {
                    "value": value, "style": int(cell.get("s", "0")),
                    "formula": cell.find("s:f", NS) is not None,
                    "type": cell.get("t"),
                }
            related = self.relationships(path)
            comments, images = [], []
            for target in related.values():
                if re.search(r"/comments\d+\.xml$", target):
                    comments.extend({"cell": c.get("ref"), "text": "".join(c.find("s:text", NS).itertext())}
                                    for c in self.xml(target).findall("s:commentList/s:comment", NS))
                elif re.search(r"/drawing\d+\.xml$", target):
                    media = self.relationships(target)
                    for anchor in self.xml(target):
                        start = anchor.find("d:from", NS)
                        blip = anchor.find(".//a:blip", NS)
                        if start is not None and blip is not None:
                            image = media.get(blip.get("{" + NS["r"] + "}embed"))
                            if image:
                                images.append({"row": int(start.find("d:row", NS).text) + 1,
                                               "col": int(start.find("d:col", NS).text) + 1,
                                               "entry": image})
            self.sheets[sheet.get("name")] = {
                "cells": cells, "images": images, "comments": comments,
                "merges": [e.get("ref") for e in root.findall("s:mergeCells/s:mergeCell", NS)],
                "max_row": max((r for _, r in cells), default=0),
            }
        core = self.xml("docProps/core.xml")
        self.meta = {e.tag.rsplit("}", 1)[-1]: e.text for e in core}

    def xml(self, name):
        return ET.fromstring(self.z.read(name))

    def relationships(self, path):
        rel = posixpath.dirname(path) + "/_rels/" + posixpath.basename(path) + ".rels"
        if rel not in self.z.namelist():
            return {}
        result = {}
        for item in self.xml(rel):
            if item.get("TargetMode") == "External":
                continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(path), item.get("Target"))).lstrip("/")
            if target not in self.z.namelist():
                raise ValueError(f"Referência interna em falta: {target}")
            result[item.get("Id")] = target
        return result

    def close(self):
        self.z.close()

    def separator(self, cell, *, allow_automatic=False):
        style = self.styles[cell.get("style", 0)]
        top = self.borders[int(style.get("borderId", "0"))].find("s:top", NS)
        color = top.find("s:color", NS) if top is not None else None
        if top is None or not top.get("style"):
            return False
        if color is None or color.get("indexed") == "64" or color.get("auto") == "1":
            # Automatic border colours are only boundary evidence on a labelled location row.
            return allow_automatic
        if color.get("theme") == "0":
            return float(color.get("tint", "0")) <= -0.3
        rgb = color.get("rgb", "")[-6:]
        return bool(re.fullmatch("[0-9A-Fa-f]{6}", rgb)) and max(
            int(rgb[i:i + 2], 16) for i in (0, 2, 4)) < 200


def family(title, description=""):
    text = key(title + " " + description)
    if text.startswith(("conj", "têxtil conjunto")):
        return ["Conjuntos"]
    for pattern, label in [
        (r"bon[ée]", "Bonés"), (r"boina", "Boinas"), (r"panam", "Panamás"),
        (r"gorro", "Gorros"), (r"guarda.chuva", "Guarda-chuvas"),
        (r"guarda.s[oó]i", "Guarda-sóis"), (r"avental|aventais", "Aventais"),
        (r"toalha", "Toalhas"), (r"manta", "Mantas"), (r"meia", "Meias"),
        (r"luva", "Luvas"), (r"bloco|agenda", "Blocos e agendas"),
        (r"garrafa", "Garrafas"), (r"caneca", "Canecas"), (r"copo", "Copos"),
        (r"t.shirt|polo", "T-shirts e polos"), (r"sweat", "Sweats"),
        (r"casaco|colete", "Casacos e coletes"), (r"calça|calç[oõ]", "Calças e calções"),
        (r"rato de computador|tapete de rato|powerbank|porwer bank|auscultador|fones|base de carregamento|estação meteo|coluna", "Informática e acessórios"),
        (r"esferogr|caneta|lápis|esf\b", "Artigos de escrita"),
        (r"porta.chave|lanyard", "Porta-chaves e lanyards"),
        (r"mochila|sacos?|bolsas?|necessaire|pastas?\b", "Sacos e bolsas"),
        (r"óculos|oculos", "Óculos"), (r"chinelo", "Chinelos"),
    ]:
        if re.search(pattern, text):
            return [label]
    return []


def article_type(description, title=""):
    match = re.match(r"(?i)^Boné\s+([56])\s+Pain(?:éis|és)\b", description)
    if match:
        return [f"Boné {match[1]} painéis"]
    text = key(title + " " + description)
    # shortcut: only named article nouns are mapped; ambiguous material/size-only descriptions need review.
    patterns = [
        (r"\brato de computador\b", "Rato de computador"),
        (r"\btapetes? de rato\b", "Tapete de rato"),
        (r"powerbank|porwer bank", "Powerbank"), (r"auscultador|\bfones\b", "Auscultadores"),
        (r"base de carregamento", "Base de carregamento"), (r"estação meteo", "Estação meteorológica"),
        (r"\bcoluna", "Coluna"), (r"\bt.shirts?\b", "T-shirt"),
        (r"\bp[oó]los?\b", "Polo"), (r"\bsweats?\b", "Sweat"),
        (r"\bparkas?\b", "Parka"), (r"\bcamisas?\b", "Camisa"),
        (r"\bcasacos?\b", "Casaco"), (r"\bcoletes?\b", "Colete"),
        (r"\bcalças?\b", "Calças"), (r"\bcalç[oõ]es\b", "Calções"),
        (r"avental|aventais", "Avental"), (r"\btoalhas?\b", "Toalha"),
        (r"\bmantas?\b", "Manta"), (r"\bmeias?\b", "Meias"),
        (r"\bluvas?\b", "Luvas"), (r"\bgolas?\b", "Gola"),
        (r"cachec[oó]i|cachec[oó]l", "Cachecol"), (r"\bgorros?\b", "Gorro"),
        (r"\bboinas?\b", "Boina"), (r"panam[aá]", "Panamá"),
        (r"guarda.chuvas?", "Guarda-chuva"), (r"guarda.s[oó]i", "Guarda-sol"),
        (r"\bmochilas?\b", "Mochila"), (r"\bsacos?\b", "Saco"),
        (r"necessaire", "Necessaire"), (r"\bbolsas?\b", "Bolsa"),
        (r"\bpastas?\b", "Pasta"), (r"\bblocos?\b", "Bloco"),
        (r"\bagendas?\b", "Agenda"), (r"\bgarrafas?\b", "Garrafa"),
        (r"\bcanecas?\b", "Caneca"), (r"\bcopos?\b", "Copo"),
        (r"\bcanetas?\b|esferogr|\besf\b", "Caneta / esferográfica"),
        (r"\blápis\b", "Lápis"), (r"\br[eé]guas?\b", "Régua"),
        (r"porta.chaves?", "Porta-chaves"), (r"\blanyards?\b", "Lanyard"),
        (r"[óo]culos", "Óculos"), (r"\bchinelos?\b", "Chinelos"),
        (r"\bantistress\b", "Antistress"), (r"\bcanivetes?\b", "Canivete"),
        (r"\bferramentas?\b", "Ferramenta"), (r"\bestojos?\b", "Estojo"),
        (r"\bquadro magnético\b", "Quadro magnético"),
    ]
    return [label for pattern, label in patterns if re.search(pattern, text)]


def explicit_faces(record):
    labels = {key(local) for group in record["groups"] for local in group["locals"]}
    if len(labels) == 1:
        match = re.fullmatch(r"(\d+)\s+faces?", next(iter(labels)))
        if match:
            return int(match[1])
    numbers = [re.fullmatch(r"face\s+(\d+)", label) for label in labels]
    if numbers and all(numbers):
        values = {int(match[1]) for match in numbers}
        if values == set(range(1, len(values) + 1)):
            return len(values)
    return None


def example_reference(record):
    refs = []
    for cell in record["raw"]:
        match = re.match(r"(?i)^(?:ex(?:\s*:\s*|\s+)|e:\s*)([a-z]{1,6}[a-z0-9./-]+)\b", clean(cell["value"]))
        if match and match[1] not in refs:
            refs.append(match[1])
    return "Ex: " + "; ".join(refs) if refs else ""


def extract(path, data_source_id):
    book = Excel(path)
    try:
        catalog = {}
        def add_option(raw, source):
            name = option_name(raw)
            item = catalog.setdefault(key(name), {"name": name, "technique": option_tech(raw), "originals": [], "sources": []})
            if raw not in item["originals"]:
                item["originals"].append(raw)
            if source not in item["sources"]:
                item["sources"].append(source)
            return item["name"]

        note_cells = book.sheets["Notas PP"]["cells"]
        for (col, row), cell in sorted(note_cells.items(), key=lambda x: x[0][1]):
            if col == 6 and row >= 6 and clean(cell["value"]):
                add_option(cell["value"], f"Notas PP!F{row}")
        records, orphans, unknown_options = [], [], []
        for sheet_name, (area, code_cols) in SHEETS.items():
            sheet = book.sheets[sheet_name]
            cells = sheet["cells"]
            def value(col, row):
                return clean(cells.get((col, row), {}).get("value"))
            for code_col in code_cols:
                starts = []
                for row in range(6, sheet["max_row"] + 1):
                    code = value(code_col, row)
                    has_header = value(code_col + 2, row).upper() == "LOCAL" and bool(value(code_col + 1, row))
                    if code.isdigit() or has_header:
                        starts.append((row, code if code.isdigit() else None))
                for index, (start, code) in enumerate(starts):
                    if index + 1 < len(starts):
                        end = starts[index + 1][0] - 1
                    else:
                        # Other column bands can extend thousands of rows below this last block.
                        occupied = [r for (c, r), v in cells.items() if code_col <= c <= code_col + 3 and clean(v['value'])]
                        occupied += [x['row'] for x in sheet['images'] if code_col <= x['col'] <= code_col + 3]
                        occupied += [parts(x['cell'])[1] for x in sheet['comments'] if code_col <= parts(x['cell'])[0] <= code_col + 3]
                        end = max([start, *occupied])
                    source = f"{sheet_name}!{addr(code_col, start)}:{addr(code_col + 3, end)}"
                    raw = [{"cell": addr(col, row), "value": cell["value"]}
                           for (col, row), cell in sorted(cells.items(), key=lambda x: (x[0][1], x[0][0]))
                           if code_col <= col <= code_col + 3 and start <= row <= end and clean(cell["value"])]
                    if not code:
                        orphans.append({"source": source, "raw": raw})
                        continue
                    title = value(code_col + 1, start)
                    flags, blocked, groups = [], [], []
                    if not title:
                        blocked.append("Título em falta")
                    group = {"locals": [], "options": [], "start_row": start + 1}
                    for row in range(start + 1, end + 1):
                        local = value(code_col + 2, row)
                        opt = value(code_col + 3, row)
                        sep = any(book.separator(cells.get((col, row), {}),
                                                 allow_automatic=bool(local and local.upper() not in HEADERS))
                                  for col in (code_col + 2, code_col + 3))
                        if sep and group["options"]:
                            groups.append(group)
                            group = {"locals": [], "options": [], "start_row": row}
                        if local and local.upper() not in HEADERS and local not in group["locals"]:
                            group["locals"].append(local)
                        if opt and opt.upper() not in HEADERS:
                            if option_tech(opt):
                                name = add_option(opt, f"{sheet_name}!{addr(code_col + 3, row)}")
                                group["options"].append({"name": name, "original": opt, "cell": addr(code_col + 3, row)})
                            else:
                                flags.append(f"Texto na coluna de opções a rever: {addr(code_col + 3, row)}")
                                unknown_options.append({"source": source, "cell": addr(code_col + 3, row), "text": opt})
                    if group["locals"] or group["options"]:
                        groups.append(group)
                    for group in groups:
                        if len(group["locals"]) != 1:
                            flags.append("Grupo com vários locais ou sem local: confirmar a distribuição das opções")
                        if not group["options"]:
                            flags.append("Local sem opções detalhadas")
                    # Cap summaries list locations that can be absent from the detailed right-hand groups.
                    known = {key(local) for group in groups for local in group["locals"]}
                    for row in range(start + 1, end + 1):
                        summary = value(code_col + 1, row)
                        match = re.match(r"^(Painel (?:Frontal|Lateral Esquerdo|Lateral Direito)|Verso Cima|Verso Fecho)\b", summary, re.I)
                        if match and key(match[1]) not in known:
                            groups.append({"locals": [match[1]], "options": [], "start_row": row})
                            known.add(key(match[1]))
                            flags.append("Local apenas no resumo; limites por confirmar")
                    if not any(group["options"] for group in groups):
                        blocked.append("Sem opções reconhecidas")
                    desc = value(code_col + 1, start + 1)
                    article_types = article_type(desc, title)
                    families = family(title, desc)
                    if not article_types:
                        flags.append("Tipo de artigo por classificar; consultar descrição e imagem")
                    if not families:
                        flags.append("Família por classificar")
                    notes = [value(code_col + 1, row) for row in range(start + 2, end + 1)
                             if value(code_col + 1, row)]
                    image_entries = list(dict.fromkeys(image["entry"] for image in sheet["images"]
                                                      if code_col <= image["col"] <= code_col + 3 and start <= image["row"] <= end))
                    comments = [comment for comment in sheet["comments"]
                                if code_col <= parts(comment["cell"])[0] <= code_col + 3
                                and start <= parts(comment["cell"])[1] <= end]
                    if not image_entries:
                        flags.append("Sem imagem ancorada dentro do bloco")
                    if any(cells.get(parts(entry["cell"]), {}).get("formula") or cells.get(parts(entry["cell"]), {}).get("type") == "e" for entry in raw):
                        blocked.append("Fórmula ou erro de célula no bloco")
                    records.append({"code": code, "title": title, "area": area,
                                    "families": families, "article_types": article_types,
                                    "description": desc, "notes": notes,
                                    "source": source, "groups": groups, "images": image_entries,
                                    "comments": comments, "raw": raw,
                                    "review_flags": list(dict.fromkeys(flags)),
                                    "blocked": list(dict.fromkeys(blocked + assignment_issues(groups)))})
        duplicates = collections.defaultdict(list)
        for record in records:
            duplicates[record["code"]].append(record)
        for code, rows in duplicates.items():
            if len(rows) > 1:
                for record in rows:
                    record["blocked"].append("Código repetido na origem; confirmar antes de consolidar")
        return {
            "format_version": 1,
            "source": {"path": str(book.path), "sha256": digest(book.path), "metadata": book.meta},
            "data_source_id": data_source_id,
            "records": records, "catalog": list(catalog.values()), "orphans": orphans,
            "unknown_option_text": unknown_options,
            "excluded_sheets": [name for name in book.sheets if name not in SHEETS and name != "Notas PP"],
            "duplicate_codes": {code: [r["source"] for r in rows] for code, rows in duplicates.items() if len(rows) > 1},
        }
    finally:
        book.close()


def assignment_issues(groups):
    issues = []
    if not groups or any(len(group["locals"]) != 1 for group in groups):
        issues.append("Distribuição das opções por local por confirmar")
    if any(not group["options"] for group in groups):
        issues.append("Local sem opções detalhadas; confirmar antes de importar")
    return issues


def verify_source(plan):
    if digest(plan["source"]["path"]) != plan["source"]["sha256"]:
        raise ValueError("O Excel mudou desde a preparação. Gerar um novo plano.")


def schema_options(plan):
    locals_ = {clean(local) for record in plan["records"] for group in record["groups"] for local in group["locals"]}
    return {
        "Opções de personalização": [item["name"] for item in plan["catalog"]],
        "Técnicas": sorted({item["technique"] for item in plan["catalog"] if item["technique"]}),
        "Faces": sorted({option_name(local) for local in locals_}),
        "Família": sorted({name for record in plan["records"] for name in record["families"]}),
        "Tipos de artigo compatíveis": sorted({name for record in plan["records"] for name in record["article_types"]}),
    }


def summary(plan):
    return {
        "blocos": len(plan["records"]),
        "codigos_distintos": len({r["code"] for r in plan["records"]}),
        "blocos_bloqueados": sum(bool(r["blocked"]) for r in plan["records"]),
        "blocos_com_observacoes": sum(bool(r["review_flags"]) for r in plan["records"]),
        "titulos_sem_codigo": len(plan["orphans"]),
        "opcoes": len(plan["catalog"]),
        "codigos_repetidos": plan["duplicate_codes"],
        "folhas_fora_do_catalogo_de_impressao": plan["excluded_sheets"],
    }


def rich(text):
    text = str(text or "")
    return [{"type": "text", "text": {"content": text[i:i + 2000]}} for i in range(0, len(text), 2000)]


def paragraph(text, kind="paragraph"):
    return {"object": "block", "type": kind, kind: {"rich_text": rich(text)}}


def tables(rows):
    result = []
    for index in range(1, len(rows), 99):
        chunk = [rows[0]] + rows[index:index + 99]
        children = [{"object": "block", "type": "table_row", "table_row": {"cells": [rich(cell) for cell in row]}} for row in chunk]
        result.append({"object": "block", "type": "table", "table": {
            "table_width": len(rows[0]), "has_column_header": True, "has_row_header": False, "children": children}})
    return result


def children(record, source, uploaded):
    rows = [["Face / local", "Opções completas e especificações", "Notas"]]
    for group in record["groups"]:
        note = ""
        if len(group["locals"]) > 1:
            note = "Locais apresentados no mesmo grupo do Excel. Distribuição por local por confirmar."
        elif not group["locals"]:
            note = "Local por confirmar."
        if not group["options"]:
            note = "Limites e opções por confirmar; consultar o resumo original."
        rows.append(["\n".join(group["locals"]) or "Por confirmar",
                     "\n".join(o["original"] for o in group["options"]), note])
    blocks = [paragraph("Locais e personalização", "heading_2"), *tables(rows)]
    if uploaded:
        blocks.append(paragraph("Imagens", "heading_2"))
        blocks.extend({"object": "block", "type": "image", "image": {"type": "file_upload", "file_upload": {"id": file_id}}} for file_id in uploaded)
    if record.get("description") or record.get("notes"):
        blocks.append(paragraph("Descrição e notas do perfil", "heading_2"))
        blocks.extend(paragraph(text) for text in [record.get("description", ""), *record.get("notes", [])] if text)
    if record["comments"] or record["review_flags"]:
        blocks.append(paragraph("Notas", "heading_2"))
        blocks.extend(paragraph(f"{comment['cell']}: {comment['text']}") for comment in record["comments"])
        blocks.extend(paragraph(flag, "bulleted_list_item") for flag in record["review_flags"])
    source_note = paragraph(
        f"{Path(source['path']).name} — {record['source']}\n"
        f"Modificação interna: {source['metadata'].get('modified', '')}; revisão {source['metadata'].get('revision', '')}.\n"
        f"SHA-256: {source['sha256']}")
    raw_table = tables([["Célula", "Texto original"]] + [[r["cell"], r["value"]] for r in record["raw"]])
    blocks.append({"object": "block", "type": "toggle", "toggle": {"rich_text": rich("Fonte e original do Excel"), "children": [source_note, *raw_table]}})
    return blocks


def properties(record):
    options = list(dict.fromkeys(o["name"] for group in record["groups"] for o in group["options"]))
    faces = list({key(option_name(local)): option_name(local) for group in record["groups"] for local in group["locals"]}.values())
    techniques = list(dict.fromkeys(option_tech(o["original"]) for group in record["groups"] for o in group["options"]))
    result = {
        "PP": {"title": rich(f"{record['code']} — {record['title']}")},
        "Código PP": {"rich_text": rich(record["code"])},
        "Área": {"select": {"name": record["area"]}},
        "Estado": {"select": {"name": "A rever"}},
        "Número de locais possíveis": {"number": len(faces) if faces else None},
    }
    if explicit_faces(record) is not None:
        result["Número de faces"] = {"number": explicit_faces(record)}
    if example_reference(record):
        result["SKU / referência do fornecedor"] = {"rich_text": rich(example_reference(record))}
    for name, values in [("Família", record["families"]), ("Tipos de artigo compatíveis", record["article_types"]),
                         ("Faces", faces), ("Opções de personalização", options), ("Técnicas", [t for t in techniques if t])]:
        if len(values) > 100:
            raise ValueError(f"PP {record['code']}: mais de 100 valores em {name}")
        result[name] = {"multi_select": [{"name": v} for v in values]}
    return result


class Notion:
    def __init__(self):
        token = os.environ.get("NOTION_TOKEN") or os.environ.get("NOTION_API_KEY")
        if not token:
            raise ValueError("Definir NOTION_TOKEN no ambiente local. Não colocar o token no script nem no chat.")
        self.headers = {"Authorization": "Bearer " + token, "Notion-Version": VERSION, "Content-Type": "application/json"}

    def request(self, method, path, data=None, *, binary=None, content_type=None, readonly=False):
        payload = binary if binary is not None else (json.dumps(data, ensure_ascii=False).encode() if data is not None else None)
        headers = dict(self.headers)
        if content_type:
            headers["Content-Type"] = content_type
        for attempt in range(5):
            req = urllib.request.Request("https://api.notion.com/v1/" + path, data=payload, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=90) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code == 429 and attempt < 4:
                    time.sleep(min(float(error.headers.get("Retry-After", "2")), 60))
                    continue
                if (method == "GET" or readonly) and error.code in (500, 502, 503, 504, 529) and attempt < 4:
                    time.sleep(2 ** attempt)
                    continue
                detail = error.read().decode("utf8", errors="replace")
                raise RuntimeError(f"Notion HTTP {error.code}: {detail}") from None

    def pages(self, source_id):
        result, cursor = [], None
        while True:
            body = {"page_size": 100}
            if cursor:
                body["start_cursor"] = cursor
            response = self.request("POST", f"data_sources/{source_id}/query", body, readonly=True)
            result.extend(response["results"])
            if not response["has_more"]:
                return result
            cursor = response["next_cursor"]

    def upload(self, name, data):
        mime = mimetypes.guess_type(name)[0]
        if mime not in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"}:
            raise ValueError(f"Imagem requer conversão antes de importar: {name}")
        if len(data) > 20 * 1024 * 1024:
            raise ValueError(f"Imagem excede 20 MiB: {name}")
        file = self.request("POST", "file_uploads", {"mode": "single_part", "filename": name, "content_type": mime})
        file_id = str(uuid.UUID(file["id"]))
        boundary = "pp-" + uuid.uuid4().hex
        payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode()
                   + data + f"\r\n--{boundary}--\r\n".encode())
        result = self.request("POST", f"file_uploads/{file_id}/send", binary=payload, content_type="multipart/form-data; boundary=" + boundary)
        if result.get("status") != "uploaded":
            raise RuntimeError(f"Upload não confirmado: {name}")
        return file_id


def option_patch(schema, wanted):
    patch = {}
    for name, names in wanted.items():
        prop = schema["properties"].get(name)
        if not prop or prop["type"] != "multi_select":
            raise ValueError(f"Campo inexistente ou tipo incompatível: {name}")
        existing = prop["multi_select"]["options"]
        have = {key(item["name"]) for item in existing}
        new = []
        for value in names:
            if key(value) not in have:
                new.append({"name": value})
                have.add(key(value))
        if new:
            patch[name] = {"multi_select": {"options": [
                {field: item[field] for field in ("id", "name", "color") if field in item}
                for item in existing] + new}}
    return patch


def prepare_options(api, plan, journal_path=None):
    verify_source(plan)
    journal_path = Path(journal_path) if journal_path is not None else None
    journal = json.loads(journal_path.read_text(encoding="utf8")) if journal_path is not None and journal_path.exists() else {}
    if journal and journal.get("status") != "concluido":
        raise ValueError("Preparação anterior de opções por confirmar. Reconciliar o auxiliar antes de repetir.")
    source_id = str(uuid.UUID(plan["data_source_id"]))
    schema = api.request("GET", f"data_sources/{source_id}")
    patch = option_patch(schema, schema_options(plan))
    small = {name: prop for name, prop in patch.items() if len(prop["multi_select"]["options"]) <= 100}
    if any(name not in small for name in patch) and journal_path is None:
        raise ValueError("A preparação de opções com auxiliar exige um diário local.")
    if small:
        api.request("PATCH", f"data_sources/{source_id}", {"properties": small})
    large = {name: prop for name, prop in patch.items() if name not in small}
    if large:
        # Page writes add new option names without replacing the schema's existing list.
        write_json(journal_path, {"status": "a_criar", "data_source_id": source_id,
                                  "source_sha256": plan["source"]["sha256"]})
        helper = api.request("POST", "pages", {
            "parent": {"type": "data_source_id", "data_source_id": source_id},
            "properties": {"PP": {"title": rich("Preparação temporária de opções — importador Excel")}},
        })
        helper_id = str(uuid.UUID(helper["id"]))
        write_json(journal_path, {"status": "criado", "page_id": helper_id,
                                  "data_source_id": source_id, "source_sha256": plan["source"]["sha256"]})
        try:
            for name, prop in large.items():
                missing = [o for o in prop["multi_select"]["options"] if "id" not in o]
                for index in range(0, len(missing), 100):
                    api.request("PATCH", f"pages/{helper_id}", {"properties": {
                        name: {"multi_select": missing[index:index + 100]}}})
        finally:
            api.request("PATCH", f"pages/{helper_id}", {"in_trash": True})
            write_json(journal_path, {"status": "concluido", "page_id": helper_id,
                                      "data_source_id": source_id, "source_sha256": plan["source"]["sha256"]})
    updated = api.request("GET", f"data_sources/{source_id}")
    if option_patch(updated, schema_options(plan)):
        raise RuntimeError("A preparação das opções não foi confirmada")


def import_records(api, plan, selected, journal_path):
    verify_source(plan)
    codes = [record.get("code") for record in plan["records"]]
    if any(not isinstance(code, str) or not code.isdigit() for code in codes):
        raise ValueError("Código em falta ou inválido no plano; gerar um novo plano.")
    if len(codes) != len(set(codes)):
        raise ValueError("Há códigos repetidos no plano; resolver antes da importação.")
    source_id = str(uuid.UUID(plan["data_source_id"]))
    chosen = [r for r in plan["records"] if not selected or r["code"] in selected]
    if selected - {r["code"] for r in chosen}:
        raise ValueError("Código selecionado não encontrado no plano")
    held = {r["code"] for r in chosen if r["blocked"] or assignment_issues(r["groups"])}
    if selected and held:
        blocked = sorted(held)
        raise ValueError("Resolver os bloqueios no plano antes de importar: " + ", ".join(blocked))
    blocked_count = len(held)
    if blocked_count:
        print(f"{blocked_count} blocos com bloqueios excluídos; consultar revisao.csv.")
        chosen = [r for r in chosen if r["code"] not in held]
    if not chosen:
        return
    index = collections.defaultdict(list)
    for page in api.pages(source_id):
        code = "".join(t.get("plain_text", t.get("text", {}).get("content", "")) for t in page["properties"].get("Código PP", {}).get("rich_text", []))
        if code:
            index[code].append(page["id"])
    if any(len(rows) > 1 for rows in index.values()):
        raise ValueError("Há códigos repetidos no Notion. Resolver antes da importação.")
    journal = json.loads(journal_path.read_text(encoding="utf8")) if journal_path.exists() else {}
    pending = []
    for record in chosen:
        code = record["code"]
        if code in index:
            print(f"{code}: já existe; preservado")
        elif code in journal:
            raise ValueError(f"PP {code}: criação anterior não reconciliada; confirmar no Notion antes de repetir.")
        else:
            pending.append(record)
    if not pending:
        return
    prepare_options(api, plan, journal_path.with_name("opcoes_estado.json"))
    with zipfile.ZipFile(plan["source"]["path"]) as z:
        for record in pending:
            code = record["code"]
            uploaded = [api.upload(f"PP{code}_{i + 1}{Path(entry).suffix.lower()}", z.read(entry)) for i, entry in enumerate(record["images"])]
            props = properties(record)
            payload = {"parent": {"type": "data_source_id", "data_source_id": source_id},
                       "properties": props, "children": children(record, plan["source"], uploaded)}
            if uploaded:
                props["Imagem principal"] = {"files": [{"type": "file_upload", "file_upload": {"id": uploaded[0]}, "name": f"PP{code}"}]}
                payload["cover"] = {"type": "file_upload", "file_upload": {"id": uploaded[0]}}
            if len(payload["children"]) > 100 or len(json.dumps(payload).encode()) > 500_000:
                raise ValueError(f"PP {code}: excede os limites de um pedido; rever o bloco")
            journal[code] = {"status": "a_criar", "data_source_id": source_id, "source_sha256": plan["source"]["sha256"]}
            write_json(journal_path, journal)
            # An uncertain create stays held if the next query cannot reconcile its code.
            page = api.request("POST", "pages", payload)
            index[code] = [page["id"]]
            journal[code] = {"status": "criado", "page_id": page["id"], "data_source_id": source_id, "source_sha256": plan["source"]["sha256"]}
            write_json(journal_path, journal)
            check = api.request("GET", f"pages/{page['id']}")
            actual = "".join(t.get("plain_text", "") for t in check["properties"]["Código PP"]["rich_text"])
            if actual != code:
                raise RuntimeError(f"Código não confirmado na página criada: {code}")
            print(f"{code}: criado em A rever — {page['url']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("preparar")
    prepare.add_argument("--excel", required=True, type=Path)
    prepare.add_argument("--fonte-dados", required=True, help="UUID da fonte de dados de destino no Notion")
    prepare.add_argument("--pasta", type=Path, default=Path("previsualizacao"))
    for command in ("opcoes", "importar"):
        action = sub.add_parser(command)
        action.add_argument("--plano", required=True, type=Path)
        action.add_argument("--aplicar", action="store_true")
        if command == "importar":
            action.add_argument("--codigo", action="append", default=[])
    args = parser.parse_args()
    if args.command == "preparar":
        plan = extract(args.excel, str(uuid.UUID(args.fonte_dados.removeprefix("collection://"))))
        args.pasta.mkdir(parents=True, exist_ok=True)
        write_json(args.pasta / "plano_importacao.json", plan)
        write_json(args.pasta / "resumo.json", summary(plan))
        write_json(args.pasta / "opcoes_notion.json", schema_options(plan))
        with (args.pasta / "revisao.csv").open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.writer(file, delimiter=";")
            writer.writerow(["Código", "Título", "Origem", "Bloqueios", "Observações", "Imagens"])
            for record in plan["records"]:
                writer.writerow([record["code"], record["title"], record["source"], " | ".join(record["blocked"]), " | ".join(record["review_flags"]), len(record["images"])])
        print(json.dumps(summary(plan), ensure_ascii=False, indent=2))
        return
    plan = json.loads(args.plano.read_text(encoding="utf8"))
    if plan.get("format_version") != 1:
        raise ValueError("Versão de plano não suportada")
    destination = str(uuid.UUID(plan["data_source_id"]))
    print(f"Fonte de dados de destino: {destination}")
    if not args.aplicar:
        print(json.dumps(summary(plan), ensure_ascii=False, indent=2))
        if args.command == "importar" and args.codigo:
            chosen = [r for r in plan["records"] if r["code"] in args.codigo]
            if set(args.codigo) - {r["code"] for r in chosen}:
                raise ValueError("Código selecionado não encontrado no plano")
            print(json.dumps([{"codigo": r["code"], "origem": r["source"], "bloqueios": r["blocked"]} for r in chosen], ensure_ascii=False, indent=2))
        print("Pré-visualização: nenhuma alteração enviada ao Notion.")
        return
    api = Notion()
    lock = args.plano.parent / "importacao.lock"
    with lock.open("x", encoding="utf8") as file:
        file.write(str(os.getpid()))
    try:
        if args.command == "opcoes":
            prepare_options(api, plan, args.plano.parent / "opcoes_estado.json")
            print("Opções preparadas e confirmadas; etiquetas existentes preservadas.")
        else:
            import_records(api, plan, set(args.codigo), args.plano.parent / "importacao_estado.json")
    finally:
        lock.unlink()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, zipfile.BadZipFile, ET.ParseError) as error:
        print(f"ERRO: {error}", file=sys.stderr)
        sys.exit(1)
