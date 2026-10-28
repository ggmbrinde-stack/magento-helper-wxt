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
export const MAX_BLOCKS_PER_REQUEST = 100;
export const BODY_CHUNK_BLOCKS = 90;

type TableBlock = Extract<Block, { type: 'table' }>;

/** Count every block object, including table rows nested inside a table. */
export function countBlockObjects(blocks: Block[]): number {
  let total = 0;
  for (const block of blocks) {
    total += 1;
    if (block.type === 'table') total += block.table.children.length;
  }
  return total;
}

function splitTableBlock(block: TableBlock, max: number): TableBlock[] {
  const rows = block.table.children;
  if (rows.length === 0 || rows.length + 1 <= max) return [block];

  const header = rows[0];
  if (!header) return [block];
  const body = rows.slice(1);
  const perChunk = Math.max(1, max - 2); // table block + header row
  const out: TableBlock[] = [];
  for (let i = 0; i < body.length; i += perChunk) {
    out.push({
      ...block,
      table: {
        ...block.table,
        children: [header, ...body.slice(i, i + perChunk)],
      },
    });
  }
  return out;
}

/**
 * Split a block list into request-sized chunks. A table is split only when its
 * own table + rows exceed the budget, so no single chunk can be rejected for
 * being over the block limit.
 */
export function chunkBlocks(
  blocks: Block[],
  max = BODY_CHUNK_BLOCKS,
): Block[][] {
  const expanded: Block[] = blocks.flatMap((block): Block[] =>
    block.type === 'table' ? splitTableBlock(block, max) : [block],
  );
  const chunks: Block[][] = [];
  let current: Block[] = [];
  let count = 0;
  for (const block of expanded) {
    const size = block.type === 'table' ? 1 + block.table.children.length : 1;
    if (current.length > 0 && count + size > max) {
      chunks.push(current);
      current = [];
      count = 0;
    }
    current.push(block);
    count += size;
    if (count > max) {
      chunks.push(current);
      current = [];
      count = 0;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function cellRichText(text: string): RichText[] {
  return splitChunks(text).flatMap((chunk) => richText(chunk));
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  const withoutStart = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const body = withoutStart.endsWith('|')
    ? withoutStart.slice(0, -1)
    : withoutStart;
  return body.split('|').map((cell) => cell.trim());
}

function fitCells(cells: string[], width: number): string[] {
  const out = cells.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

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
    const hdr = parseTableCells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\|/.test((lines[i] ?? '').trim())) {
        const cells = parseTableCells(lines[i] ?? '');
        if (cells.length > 0) rows.push(cells);
        i += 1;
      }
      if (hdr.length > 0 && rows.length > 0) {
        const width = hdr.length;
        const kids = [
          {
            object: 'block' as const,
            type: 'table_row' as const,
            table_row: { cells: hdr.map((h) => cellRichText(h)) },
          },
          ...rows.map((r) => ({
            object: 'block' as const,
            type: 'table_row' as const,
            table_row: { cells: fitCells(r, width).map((c) => cellRichText(c)) },
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