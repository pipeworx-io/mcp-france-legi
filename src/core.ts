/**
 * Pure helpers for france-legi — no I/O, so tests can pin them.
 *
 * normalizeNum MUST stay identical to scripts/lib/legi.mjs's normalizeNum:
 * the ingest keys nums.json with it and the pack looks numbers up with it.
 * src/__tests__/tools.test.ts asserts the two agree on a fixed list.
 */

export const OPEN_END = '2999-01-01';

export interface VersionRef {
  id: string;
  num: string | null;
  etat: string | null;
  debut: string;
  fin: string;
}

export interface CodeRow {
  cid: string;
  title: string;
  title_full?: string | null;
  etat?: string | null;
  derniere_modification?: string | null;
  article_versions?: number;
  articles_in_force?: number;
}

/** "Art. L. 121-1" / "l121-1" / "L 121-1" -> "L121-1"; "1240" -> "1240". */
export function normalizeNum(s: unknown): string {
  let t = String(s ?? '').trim();
  t = t.replace(/^(?:article|art\.?)\s*/i, '');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^([LRDA])\s*\.?\s*(\*?)\s*(?=\d)/i, (_m, p: string, star: string) => p.toUpperCase() + star);
  return t.replace(/\s+/g, ' ').toUpperCase();
}

export function inForceAt(v: { debut: string; fin: string }, date: string): boolean {
  return v.debut <= date && date < v.fin;
}

export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const FILLER = new Set(['code', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'a', 'au', 'aux']);
const core = (s: string) => fold(s).split(' ').filter((w) => w && !FILLER.has(w)).join(' ');

/** Common abbreviations French lawyers write, mapped to the folded core of
 *  the official title (see core()). Only unambiguous ones. */
const ALIASES: Record<string, string> = {
  cciv: 'civil', cc: 'civil', civ: 'civil',
  cp: 'penal', 'c pen': 'penal',
  cpp: 'procedure penale',
  cpc: 'procedure civile',
  ct: 'travail', 'c trav': 'travail',
  cgi: 'general impots',
  csp: 'sante publique',
  css: 'securite sociale',
  ccom: 'commerce', 'c com': 'commerce',
  cpi: 'propriete intellectuelle',
  cmf: 'monetaire financier',
  cja: 'justice administrative',
  ceseda: 'entree sejour etrangers droit asile',
  cgct: 'general collectivites territoriales',
  cch: 'construction habitation',
  cu: 'urbanisme',
  cenv: 'environnement', 'c env': 'environnement',
  cconso: 'consommation', 'c conso': 'consommation',
  crpa: 'relations entre public administration',
  cpce: 'postes communications electroniques',
  cgfp: 'general fonction publique',
  cr: 'route',
  cdouanes: 'douanes', cd: 'douanes',
  cass: 'assurances', 'c assur': 'assurances',
  cedu: 'education',
  // Two codes share a word with an older, nearly empty predecessor kept in
  // force for a handful of articles; the bare word means the current one.
  rural: 'rural peche maritime', 'code rural': 'rural peche maritime', crpm: 'rural peche maritime',
  minier: 'minier nouveau', 'code minier': 'minier nouveau',
};

export type CodeMatch =
  | { ok: true; code: CodeRow }
  | { ok: false; reason: 'unknown_code' | 'ambiguous_code'; candidates: CodeRow[] };

/** Resolve "Code civil" / "civil" / "CGI" / "LEGITEXT000006070721". */
export function resolveCode(input: unknown, codes: CodeRow[]): CodeMatch {
  const raw = String(input ?? '').trim();
  if (/^LEGITEXT\d{12}$/i.test(raw)) {
    const hit = codes.find((c) => c.cid === raw.toUpperCase());
    return hit ? { ok: true, code: hit } : { ok: false, reason: 'unknown_code', candidates: [] };
  }
  const q = core(raw);
  if (!q) return { ok: false, reason: 'unknown_code', candidates: [] };
  const target = ALIASES[fold(raw)] ?? q;
  const exact = codes.filter((c) => core(c.title) === target);
  if (exact.length === 1) return { ok: true, code: exact[0] };
  const words = target.split(' ');
  const partial = codes.filter((c) => {
    const t = core(c.title).split(' ');
    return words.every((w) => t.some((x) => x === w || (w.length >= 4 && x.startsWith(w))));
  });
  if (partial.length === 1) return { ok: true, code: partial[0] };
  if (partial.length > 1) {
    // Prefer the shortest title: "travail" -> Code du travail, not
    // "Code du travail maritime".
    const sorted = [...partial].sort((a, b) => core(a.title).length - core(b.title).length);
    if (core(sorted[0].title).split(' ').length === words.length) return { ok: true, code: sorted[0] };
    return { ok: false, reason: 'ambiguous_code', candidates: sorted.slice(0, 8) };
  }
  return { ok: false, reason: 'unknown_code', candidates: [] };
}

/** Synthetic per-code token written into every indexed document. */
export function codeToken(cid: string): string {
  return `xc${cid.replace(/^LEGITEXT/, '')}`;
}

/** Caller text -> a safe FTS5 MATCH expression. Quoted phrases stay
 *  phrases; every other word is quoted as a literal so FTS5 operators,
 *  column filters and stray punctuation in a question cannot change the
 *  query's meaning or make it a syntax error. */
export function ftsQuery(text: string, mode: 'all' | 'any', cid?: string | null): string | null {
  const parts: string[] = [];
  const re = /"([^"]+)"|([\p{L}\p{N}]+)/gu;
  for (const m of text.matchAll(re)) {
    const raw = m[1] ?? m[2];
    const words = raw.match(/[\p{L}\p{N}]+/gu);
    if (!words?.length) continue;
    parts.push(`"${words.join(' ')}"`);
  }
  if (!parts.length) return null;
  const body = parts.length === 1 ? parts[0] : mode === 'all' ? parts.join(' AND ') : `(${parts.join(' OR ')})`;
  return cid ? `${body} AND "${codeToken(cid)}"` : body;
}

export function legiNum(id: string): number | null {
  const m = /^LEGIARTI0*(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}
export function legiId(n: number): string {
  return `LEGIARTI${String(n).padStart(12, '0')}`;
}
export const BUCKETS = 4096;
export function bucketOf(id: string): number {
  const n = legiNum(id);
  if (n == null) throw new Error(`not a LEGIARTI id: ${id}`);
  return n % BUCKETS;
}

/** ~`width` chars of `text` around the first query word found in it. */
export function excerpt(text: string, query: string, width = 320): string {
  const flat = text.replace(/\s+/g, ' ');
  const foldedText = fold(flat);
  const words = (query.match(/[\p{L}\p{N}]+/gu) ?? []).map(fold).filter((w) => w.length > 3);
  let at = -1;
  for (const w of words) {
    const i = foldedText.indexOf(w);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  // fold() can shorten text (it drops punctuation runs), so map back
  // approximately; a slightly early window is harmless.
  const start = at < 0 ? 0 : Math.max(0, Math.round(at * (flat.length / Math.max(1, foldedText.length))) - 80);
  const out = flat.slice(start, start + width);
  return (start > 0 ? '…' : '') + out + (start + width < flat.length ? '…' : '');
}

export function legifranceUrl(id: string): string {
  return `https://www.legifrance.gouv.fr/codes/article_lc/${id}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Accept YYYY-MM-DD only; anything else is a caller error, said plainly. */
export function parseDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new Error(`date must be YYYY-MM-DD (got ${JSON.stringify(s).slice(0, 40)})`);
  }
  return s;
}
