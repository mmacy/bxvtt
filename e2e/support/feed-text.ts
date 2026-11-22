/**
 * Checks text that a player reads for leaks of raw identifiers and codes: entity IDs such as `character-0001`,
 * stored IDs such as `chr_…`, snake_case tokens, dotted rejection codes, coordinates, and leftovers such as
 * `undefined` or `[object Object]`. The feed must read as sentences.
 */

/** One pattern that must not appear in feed text, with a name for the failure message. */
interface RawPattern {
  name: string;
  pattern: RegExp;
}

const RAW_PATTERNS: RawPattern[] = [
  {
    name: 'session entity ID',
    pattern: /\b(?:character|group|monster|member|area|cache|feature|trap)-\d{2,}\b/,
  },
  { name: 'stored ID', pattern: /\b(?:chr|tbl|usr|adv|ses|sav|tgt|ann|roll|fed)_[A-Za-z0-9_-]{6,}/ },
  { name: 'snake_case token', pattern: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/ },
  { name: 'dotted code', pattern: /\b[a-z][a-z_]+\.[a-z_]+(?:\.[a-z_]+)*\b/ },
  { name: 'coordinates', pattern: /\(\s*-?\d+\s*,\s*-?\d+\s*\)|\b\d+,\d+(?::[a-z]+)?\b(?!\d)/ },
  { name: 'edge reference', pattern: /\b\d+,\d+:(?:north|south|east|west)\b/ },
  { name: 'leftover value', pattern: /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/ },
  { name: 'template placeholder', pattern: /\{[a-z_]+\}/ },
];

/** A feed line that reads like code rather than a sentence. */
export interface RawTextFinding {
  line: string;
  kind: string;
  match: string;
}

/**
 * Finds raw identifiers and codes in lines of text.
 *
 * Numbers with a thousands separator, such as `1,000 gp`, aren't coordinates, so a comma followed by exactly three
 * digits and no colon is allowed.
 *
 * @param lines - The lines to check.
 * @returns Every finding, in line order.
 */
export function findRawText(lines: Iterable<string>): RawTextFinding[] {
  const findings: RawTextFinding[] = [];
  for (const line of lines) {
    for (const { name, pattern } of RAW_PATTERNS) {
      const match = pattern.exec(line);
      if (match === null) continue;
      if (name === 'coordinates' && /^\d{1,3},\d{3}$/.test(match[0])) continue;
      findings.push({ line, kind: name, match: match[0] });
    }
  }
  return findings;
}
