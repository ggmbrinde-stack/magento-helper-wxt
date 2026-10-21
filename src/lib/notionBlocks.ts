/**
 * Markdown -> Notion block converter.
 *
 * Mirrors the PowerShell `Convert-MarkdownToBlocks` (notion-api.ps1) so the
 * extension can build the same dossier page body the old pipeline produced.
 * Supports the subset generate-libcontent.ps1 emits:
 *   ## / ### headings, | tables | (header + separator), - bullets, plain lines.
 *
 * Output is the `children` array shape Notion expects on POST /v1/pages.
 * Rich text auto-links http(s) URLs (mirrors ConvertTo-RichText).
 */

export type RichText = { type: 'text'; text: { content: string; link?: { url: string } } };
export type Block =
  | { object: 'block'; type: 'paragraph'; paragraph: { rich_text: RichText[] } }
  | { object: 'block'; type: 'heading_2'; heading_2: { rich_text: RichText[]; is_toggleable: false } }
  | { object: 'block'; type: 'heading_3'; heading_3: { rich_text: RichText[]; is_toggleable: false } }
  | { object: 'block'; type: 'bulleted_list_item'; bulleted_list_item: { rich_text: RichText[] } }
  | {
      object: 'block';
      type: 'table';
      table: {
        table_width: number;
        has_column_header: true;
        has_row_header: false;
        children: { object: 'block'; type: 'table_row'; table_row: { cells: RichText[][] } }[];
      };
    };

const MAX_RICH = 1900;

export function richText(text: string): RichText[] {
  const segs: RichText[] = [];
  const rx = /https?:\/\/\S+/g;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > pos) {
      segs.push({ type: 'text', text: { content: text.slice(pos, m.index) } });
    }
    const url = m[0].replace(/[.,)\]]+$/, '');
    segs.push({ type: 'text', text: { content: url, link: { url } } });
    pos = m.index + url.length;
  }
  const tail = text.slice(pos);
  if (tail || segs.length === 0) {
    segs.push({ type: 'text', text: { content: tail } });
  }
  return segs;
}

function splitChunks(text: string, max = MAX_RICH): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

function para(text: string): Block[] {
  return splitChunks(text).map((c) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(c) },
  }));
}

function bullet(text: string): Block[] {
  return splitChunks(text).map((c) => ({
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(c) },
  }));
}

export function markdownToNotionBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? '').replace(/\s+$/, '');
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      const text = (h3[1] ?? '').trim();
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: richText(text), is_toggleable: false },
      });
      i += 1;
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      const text = (h2[1] ?? '').trim();
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: richText(text), is_toggleable: false },
      });
      i += 1;
      continue;
    }
    const nextLine = lines[i + 1] ?? '';
    if (
      /^\|.*\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      /^\|[\s\-:|]+\|\s*$/.test(nextLine)
    ) {
    const hdr = line
      .split('|')
      .map((c) => (c ?? '').trim())
      .filter((c) => c !== '');
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\|/.test((lines[i] ?? '').trim())) {
        const cells = (lines[i] ?? '')
          .split('|')
          .map((c) => (c ?? '').trim())
          .filter((c) => c !== '');
        if (cells.length > 0) rows.push(cells);
        i += 1;
      }
      if (rows.length > 0) {
        const width = hdr.length;
        const kids = [
          {
            object: 'block' as const,
            type: 'table_row' as const,
            table_row: { cells: hdr.map((h) => richText(h)) },
          },
          ...rows.map((r) => ({
            object: 'block' as const,
            type: 'table_row' as const,
            table_row: { cells: r.map((c) => richText(c)) },
          })),
        ];
        blocks.push({
          object: 'block',
          type: 'table',
          table: {
            table_width: width,
            has_column_header: true,
            has_row_header: false,
            children: kids,
          },
        });
      }
      continue;
    }
      const bullet = /^-\s+(.*)$/.exec(line);
      if (bullet) {
        blocks.push(...bulletBlock((bullet[1] ?? '').trim()));
        i += 1;
        continue;
      }
    blocks.push(...para(line.trim()));
    i += 1;
  }
  return blocks;
}

function bulletBlock(text: string): Block[] {
  return splitChunks(text).map((c) => ({
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(c) },
  }));
}