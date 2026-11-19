"""Unmodified naming helpers from reviewed importer SHA256 1fb60fb6...; no writer code."""
import re
import unicodedata

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
