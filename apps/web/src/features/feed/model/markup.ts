/**
 * Light formatting for chat: `**bold**`, `*italic*` or `_italic_`, `~~struck~~`, and `` `code` ``. The parser
 * returns plain data, and the feed renders it as React elements, so a message can never inject markup.
 */

/** A piece of a formatted message. */
export type MarkupNode =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: MarkupNode[] }
  | { type: 'code'; text: string };

interface Rule {
  type: 'strong' | 'em' | 'del';
  open: string;
  close: string;
}

const RULES: readonly Rule[] = [
  { type: 'strong', open: '**', close: '**' },
  { type: 'del', open: '~~', close: '~~' },
  { type: 'em', open: '*', close: '*' },
  { type: 'em', open: '_', close: '_' },
];

/** Whether a delimiter at `index` may open a span: it starts a word, and text follows it. */
function canOpen(text: string, index: number, delimiter: string): boolean {
  const before = index === 0 ? ' ' : (text[index - 1] ?? ' ');
  const after = text[index + delimiter.length] ?? ' ';
  if (/\s/.test(after)) return false;
  if (delimiter === '_' || delimiter === '*') return !/[\p{L}\p{N}]/u.test(before);
  return true;
}

/** Whether a delimiter at `index` may close a span: text precedes it, and it ends a word. */
function canClose(text: string, index: number, delimiter: string): boolean {
  const before = text[index - 1] ?? ' ';
  const after = text[index + delimiter.length] ?? ' ';
  if (/\s/.test(before)) return false;
  if (delimiter === '_' || delimiter === '*') return !/[\p{L}\p{N}]/u.test(after);
  return true;
}

function pushText(nodes: MarkupNode[], text: string): void {
  if (text === '') return;
  const last = nodes.at(-1);
  if (last?.type === 'text') last.text += text;
  else nodes.push({ type: 'text', text });
}

/**
 * Parses a chat message into formatted pieces. Text without matching delimiters stays as typed.
 *
 * @param text - The message.
 * @param depth - How deep the parser is inside other spans. Spans nest at most three deep.
 */
export function parseMarkup(text: string, depth = 0): MarkupNode[] {
  const nodes: MarkupNode[] = [];
  let index = 0;
  let plainStart = 0;
  while (index < text.length) {
    if (text[index] === '`') {
      const end = text.indexOf('`', index + 1);
      if (end > index + 1) {
        pushText(nodes, text.slice(plainStart, index));
        nodes.push({ type: 'code', text: text.slice(index + 1, end) });
        index = end + 1;
        plainStart = index;
        continue;
      }
    }
    if (depth < 3) {
      const rule = RULES.find((r) => text.startsWith(r.open, index) && canOpen(text, index, r.open));
      if (rule) {
        let search = index + rule.open.length;
        let end = -1;
        while (search < text.length) {
          const found = text.indexOf(rule.close, search);
          if (found === -1) break;
          if (canClose(text, found, rule.close) && found > index + rule.open.length) {
            end = found;
            break;
          }
          search = found + 1;
        }
        if (end !== -1) {
          pushText(nodes, text.slice(plainStart, index));
          nodes.push({
            type: rule.type,
            children: parseMarkup(text.slice(index + rule.open.length, end), depth + 1),
          });
          index = end + rule.close.length;
          plainStart = index;
          continue;
        }
      }
    }
    index += 1;
  }
  pushText(nodes, text.slice(plainStart));
  return nodes;
}

/** The message as plain text, without delimiters, for search and screen reader summaries. */
export function markupText(nodes: readonly MarkupNode[]): string {
  return nodes
    .map((node) => (node.type === 'text' || node.type === 'code' ? node.text : markupText(node.children)))
    .join('');
}
