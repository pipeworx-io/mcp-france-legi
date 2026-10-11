interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Legal authority typing and the age-labelling contract.
 *
 * Phase 0 of docs/secondary-legal-sources-plan.md (fleet #1970). This is the
 * SHARED shape that 14 federal secondary-legal source packs key on, so it is
 * defined once here rather than retrofitted across 14 packs later.
 *
 * WHAT THIS IS FOR. The product claim is that an agent asking a legal question
 * can rank what it gets back — controlling authority above the issuing agency's
 * own reading of its rule, that above a practitioner manual, that above a law
 * review article, that above a 1910 treatise. No free legal tool does this. The
 * ranking is only possible if every pack labels its documents with the same
 * vocabulary, which is what `AUTHORITY_TYPES` and `BINDING_STATUSES` are.
 *
 * THE TWO AXES ARE NOT THE SAME AXIS, and conflating them is the mistake this
 * file exists to prevent:
 *
 *   authority_type  — what KIND of instrument this is. A property of the
 *                     document. Stable forever. A repealed statute is still a
 *                     statute.
 *   binding_status  — what FORCE it carries. Changes over time (a rule is
 *                     proposed, then binding, then vacated) and is the axis
 *                     `superseded_by` hangs off.
 *
 * A single "authority level" field cannot express "an agency manual that its own
 * staff must follow but which binds no court", and that describes the IRM, the
 * Justice Manual, the MPEP and the TMEP — four of our fourteen sources. Hence
 * two fields.
 *
 * Vocabulary rationale, including everything deliberately EXCLUDED:
 * docs/secondary-legal-authority-vocabulary.md
 */

// ───────────────────────── authority_type ─────────────────────────
//
// Ordered by tier, and the order in this array is not load-bearing — read the
// tier from AUTHORITY_TIER. Each value has to earn its place by changing what a
// caller would DO with the document; a value that only adds a synonym is a value
// that will be filled in inconsistently by 14 packs.

const AUTHORITY_TYPES = [
  // ── Tier 1: controlling. A tribunal in the document's own jurisdiction must
  //    follow it. These are the things an answer should lead with.
  'constitution',        // Constitutional text itself. Separated from `statute`
                         // because nothing supersedes it by ordinary enactment,
                         // so it never carries binding_status 'superseded'.
  'treaty',              // Ratified agreement with domestic force. Not in the
                         // current 14 sources, but included because its absence
                         // would force treaties into `statute`, which is wrong
                         // about how they are amended and displaced.
  'statute',             // Enacted legislation. U.S.C., Public Laws.
  'regulation',          // Legislative rule with the force of law — notice and
                         // comment, codified in the CFR. Distinct from
                         // `agency_guidance` precisely because that one is the
                         // sub-regulatory material that does NOT bind.
  'case',                // Judicial decision. Binding within its own court
                         // hierarchy, persuasive outside it — which is why the
                         // forum-relativity note below matters most here.
  'court_rule',          // FRCP, FRE, local rules. Force of law, but procedural
                         // and promulgated by courts rather than legislatures,
                         // so a caller filtering for "substantive law" needs to
                         // be able to exclude them.

  // ── Tier 2: official interpretation. The issuing body's own reading of an
  //    instrument it administers. Entitled to weight; binds no court.
  'agency_guidance',     // Sub-regulatory: interpretive rules, policy
                         // statements, staff bulletins, no-action letters,
                         // enforcement guidance. EEOC/DOL/NLRB guidance, SEC
                         // staff interpretations, FTC Legal Library.
  'agency_manual',       // The agency's internal operating manual: IRS IRM, DOJ
                         // Justice Manual, USPTO MPEP/TMEP, Copyright Office
                         // Compendium. Split from `agency_guidance` because
                         // these are the documents that carry binding_status
                         // 'binding_on_issuer' — they direct the agency's own
                         // staff while expressly conferring no rights on the
                         // public.
  'legislative_history', // Committee reports, conference reports, floor
                         // statements. Official in origin, interpretive in use.

  // ── Tier 3: practitioner guidance. Authoritative in practice, no legal force.
  'practice_manual',     // Court and tribunal practice manuals: EOIR practice
                         // manuals, FJC benchbooks.
  'jury_instruction',    // Pattern jury instructions. The direct answer to
                         // "what must be proven", which is why they get their
                         // own value rather than sitting inside
                         // `practice_manual` where a caller could not filter
                         // for them.
  'legal_treatise',      // Systematic expert treatment: the GAO Red Book.
                         // Current, maintained, cited by practitioners.
  'legislative_analysis',// CRS reports, GAO reports, Commons Library briefings.
                         // Non-partisan expert analysis prepared for
                         // legislators. NOT tier 2: CRS speaks for nobody and
                         // interprets no rule of its own. NOT tier 4: not
                         // peer-reviewed scholarship either.

  // ── Tier 4: scholarly commentary.
  'scholarly_article',   // Peer-reviewed or law-review published. OpenAlex,
                         // Crossref, DOAJ, Digital Commons.
  'working_paper',       // Preprint or unreviewed. Split from
                         // `scholarly_article` because "has this been through
                         // review" changes how much weight an agent should give
                         // it, and both arrive from the same upstreams.

  // ── Tier 5: historical commentary.
  'historical_treatise', // A treatise whose value is historical rather than
                         // current — the public-domain 1910 titles. Labelled so
                         // an agent never presents one as the current rule.

  // ── Tier 6: reference. Makes no authority claim at all.
  'reference',           // Glossaries, citation guides, dictionaries. Kept
                         // rather than folded into `scholarly_article`, which
                         // would put a definition list in the scholarship tier
                         // and corrupt every ranking that reads it.
] as const;

type AuthorityType = (typeof AUTHORITY_TYPES)[number];

/** The five tiers the product promise names, plus reference for things making no claim. */
const AUTHORITY_TIERS = [
  'controlling',
  'official_interpretation',
  'practitioner_guidance',
  'scholarly_commentary',
  'historical_commentary',
  'reference',
] as const;

type AuthorityTier = (typeof AUTHORITY_TIERS)[number];

const TIER_OF: Record<AuthorityType, AuthorityTier> = {
  constitution: 'controlling',
  treaty: 'controlling',
  statute: 'controlling',
  regulation: 'controlling',
  case: 'controlling',
  court_rule: 'controlling',
  agency_guidance: 'official_interpretation',
  agency_manual: 'official_interpretation',
  legislative_history: 'official_interpretation',
  practice_manual: 'practitioner_guidance',
  jury_instruction: 'practitioner_guidance',
  legal_treatise: 'practitioner_guidance',
  legislative_analysis: 'practitioner_guidance',
  scholarly_article: 'scholarly_commentary',
  working_paper: 'scholarly_commentary',
  historical_treatise: 'historical_commentary',
  reference: 'reference',
};

/** 1 = controlling … 6 = reference. Lower sorts first. */
function authorityTier(t: AuthorityType): AuthorityTier {
  return TIER_OF[t];
}

function authorityTierRank(t: AuthorityType): number {
  return AUTHORITY_TIERS.indexOf(TIER_OF[t]) + 1;
}

/**
 * The one-bit view a lot of callers actually want. Derived rather than stored,
 * so it cannot drift away from authority_type — which is what would happen if
 * `primary`/`secondary` were a column somebody had to remember to set.
 */
function isPrimaryAuthority(t: AuthorityType): boolean {
  return TIER_OF[t] === 'controlling';
}

// ───────────────────────── binding_status ─────────────────────────

const BINDING_STATUSES = [
  'binding',            // A tribunal in this document's own jurisdiction must
                        // follow it. See the forum-relativity note below: this
                        // is the document's claim, not a claim about the
                        // caller's forum.
  'persuasive',         // May be relied on, need not be followed. The default
                        // truthful answer for most secondary material.
  'binding_on_issuer',  // Binds the issuing agency's own staff; creates no
                        // rights in third parties and binds no court. The IRM,
                        // the Justice Manual and the MPEP all say this about
                        // themselves in terms. Collapsing it into 'binding'
                        // would be flatly false; collapsing it into
                        // 'persuasive' loses that an examiner IS required to
                        // follow it, which is the whole reason a patent
                        // practitioner reads the MPEP.
  'proposed',           // Not yet in force: an NPRM's rule text, an introduced
                        // bill, a draft edition. effective_date is in the
                        // future or unknown.
  'superseded',         // Replaced by a later instrument. `superseded_by` names
                        // it. Still served — per Bruce's serve-and-label ruling
                        // we never withhold — but never as current law. The GAO
                        // Red Book third edition against the fourth is exactly
                        // this.
  'repealed',           // Withdrawn with nothing replacing it. Distinct from
                        // 'superseded' because the caller's next action differs:
                        // superseded means go read superseded_by, repealed means
                        // there is nothing to go and read.
  'vacated',            // Struck down by a court. Distinct from 'repealed'
                        // because it was never validly law rather than having
                        // been withdrawn, and because a vacated rule served as
                        // binding is the worst single error this schema can
                        // make.
  'unknown',            // We could not determine it from the source. THE
                        // DEFAULT, deliberately: the alternative to an explicit
                        // 'unknown' is a pack guessing, and a guessed 'binding'
                        // is the most dangerous value in this vocabulary. An
                        // omission has to read as an omission, not as
                        // 'persuasive'.
] as const;

type BindingStatus = (typeof BINDING_STATUSES)[number];

/**
 * BINDING_STATUS IS A CODED VALUE **AND** A PROSE NOTE. Both, not either.
 *
 * Settled here because two shipped tools had already guessed differently. The
 * govinfo GAO tools (#1972) put a whole sentence in `binding_status` — "GAO's own
 * view of federal appropriations law. Persuasive and followed in practice by
 * agency counsel; not binding on courts." That sentence is genuinely more useful
 * to a caller than any enum value, and it is also unrankable, unfilterable and
 * unjoinable. Choosing one loses something real either way:
 *
 *   enum only   — an agent can rank and filter, but "followed in practice by
 *                 agency counsel though not binding on courts" is exactly the
 *                 kind of thing a lawyer needs and `persuasive` does not say.
 *   prose only  — reads well and cannot be computed over. Ranking 14 sources by
 *                 authority is the product promise; it dies here.
 *
 * So `binding_status` is the controlled vocabulary (machine-readable, what
 * authoritySortKey reads) and `binding_note` is the sentence (human-readable,
 * never parsed). A pack SHOULD set both. The enum is what ranks; the note is
 * what explains. Nothing ever infers one from the other — a note is not parsed
 * into a status, because a regex over legal prose producing `binding` is the
 * single worst failure available to this schema.
 */
const BINDING_STATUS_IS_CODED_PLUS_PROSE = true;

/**
 * BINDING IS RELATIVE TO A FORUM AND WE DO NOT KNOW THE CALLER'S FORUM.
 *
 * A Second Circuit opinion is binding in the Second Circuit and persuasive in
 * the Ninth. So `binding_status: 'binding'` means "this instrument carries the
 * force of law within the jurisdiction named in its own `jurisdiction` field",
 * and nothing more. The caller composes (jurisdiction, binding_status) against
 * its own forum. Baking the forum in — a `binding_in_2d_cir` value — would make
 * the field a lie for every other caller, so it is excluded by design.
 */
const BINDING_IS_FORUM_RELATIVE = true;

/**
 * How much a binding_status should discount a document WITHIN its tier. A
 * superseded statute must not outrank a current agency manual when the question
 * is "what is the rule now", and tier alone would rank it above.
 *
 * Multiplied into the sort key rather than bolted on as a special case so the
 * behaviour is one number a reader can check.
 */
const TIER_STEP = 10;

const STATUS_PENALTY: Record<BindingStatus, number> = {
  // In force. No penalty — these three are equally "live", and which of them is
  // the right answer is decided by the TIER, not here.
  binding: 0,
  binding_on_issuer: 0,
  persuasive: 0,
  // Unlabelled costs a little, but we do not bury a document for being honest
  // about what we could not determine. Stays well inside one tier.
  unknown: 2,
  // ── Past TIER_STEP, so these CROSS A TIER BOUNDARY. That is the point and it
  //    is worth being explicit about, because it is the one place where
  //    binding_status outranks authority_type:
  //
  //    superseded statute      = 10 + 12 = 22
  //    current agency manual   = 20 +  0 = 20   ← wins
  //
  //    The default question a caller is asking is "what is the rule NOW", and a
  //    superseded statute is not an answer to it while a current manual is. A
  //    caller asking what the law was in 2019 filters on effective_date and
  //    binding_status explicitly rather than relying on this ordering.
  //
  //    The penalties are sized to cross exactly ONE tier, never two: the largest
  //    is 16, so nothing falls more than one-and-a-bit tiers. A repealed statute
  //    (25) still outranks a practitioner treatise (30), which is deliberate —
  //    the treatise is not law either, and the statute is at least primary text.
  proposed: 11,    // Not yet in force. Lands just below current guidance (20 vs 21).
  superseded: 12,  // A current version exists; prefer it. Read superseded_by.
  repealed: 15,    // Withdrawn, nothing replaces it.
  vacated: 16,     // Struck down. The value most dangerous to serve as current.
};

/**
 * Sort key for "which of these is the better authority". Ascending: lower is
 * stronger. Combines both axes, because either one alone gives a wrong order.
 */
function authoritySortKey(a: Pick<LegalAuthority, 'authority_type' | 'binding_status'>): number {
  return authorityTierRank(a.authority_type) * TIER_STEP + STATUS_PENALTY[a.binding_status ?? 'unknown'];
}

/** Strongest authority first. Stable for equal keys. */
function rankByAuthority<T extends Pick<LegalAuthority, 'authority_type' | 'binding_status'>>(docs: T[]): T[] {
  return docs
    .map((d, i) => ({ d, i, k: authoritySortKey(d) }))
    .sort((x, y) => x.k - y.k || x.i - y.i)
    .map((x) => x.d);
}

function isAuthorityType(v: unknown): v is AuthorityType {
  return typeof v === 'string' && (AUTHORITY_TYPES as readonly string[]).includes(v);
}

function isBindingStatus(v: unknown): v is BindingStatus {
  return typeof v === 'string' && (BINDING_STATUSES as readonly string[]).includes(v);
}

/**
 * A TIER NAME IS NOT AN AUTHORITY TYPE, and something has to say so out loud.
 *
 * The shipped govinfo GAO tools (#1972) emit `authority_type:
 * 'official_interpretation'` — which is a TIER, spanning three types. It is a
 * reasonable-looking mistake and `isAuthorityType` already returns false for it,
 * but a pack that proxies live never touches the CHECK constraint that would
 * reject it, so nothing tells the author. Fourteen packs making this call
 * independently is exactly the "vague enum poisons everything downstream" risk
 * this vocabulary exists to close.
 *
 * Accepting a tier as a type is NOT the fix. `official_interpretation` covers
 * `agency_guidance`, `agency_manual` and `legislative_history`, and collapsing
 * them destroys the only distinction that justifies `binding_on_issuer` — the
 * reason the two-field design exists at all. So the coarse value is refused and
 * the author is told which types to choose between.
 *
 * Returns the valid type, or a diagnosis naming the candidates.
 */
function classifyAuthorityInput(v: unknown):
  | { ok: true; authority_type: AuthorityType }
  | { ok: false; reason: string; candidates: AuthorityType[] } {
  if (isAuthorityType(v)) return { ok: true, authority_type: v };

  if (typeof v === 'string' && (AUTHORITY_TIERS as readonly string[]).includes(v)) {
    const candidates = AUTHORITY_TYPES.filter((t) => TIER_OF[t] === v);
    return {
      ok: false,
      candidates,
      reason: `"${v}" is a TIER, not an authority_type. A tier is derived from the ` +
        `type via authorityTier(); passing it as the type loses the distinction the ` +
        `tier is made of. Pick one of: ${candidates.join(', ')}.`,
    };
  }

  return {
    ok: false,
    candidates: [],
    reason: `"${String(v)}" is not an authority_type. Valid values: ${AUTHORITY_TYPES.join(', ')}.`,
  };
}

// ───────────────────────── licence terms ─────────────────────────
//
// Added for decision #1973 / task #1974: Bruce ruled we WILL mirror CC BY-NC-SA
// material (Cornell LII/Wex, CORE, CALI), served free through the gateway's
// existing `zeroRated` mechanism. That makes the licence side of this shape
// load-bearing in a way a single string cannot carry.
//
// WHY THIS IS PER DOCUMENT AND NOT PER SOURCE. CALI is the proof: most eLangdell
// titles are BY-NC-SA, but *Sources of American Law* is BY-SA with no NC clause.
// A per-pack licence constant mislabels it, and one mis-filed title is the whole
// compliance story. Same shape as the `finra` precedent, where one pack reads two
// distributions under two different sets of terms — which is why `zeroRated`
// accepts a string[] of tool names rather than only `true`.
//
// WHY A US FEDERAL WORK IS NOT "A LICENCE". 17 U.S.C. §105 makes the work
// UNCOPYRIGHTABLE. Nobody granted us anything and there is no licensor, no
// attribution clause and no downstream obligation. Forcing that into a
// CC-shaped field would tell a caller it is bound by terms that do not exist,
// which is its own kind of false statement — so `license_kind` separates the
// two and `obligations` comes back empty rather than defaulting to attribution.

const LICENSE_KINDS = [
  'public_domain_us_gov',   // 17 U.S.C. §105. Uncopyrightable, not licensed.
  'public_domain_expired',  // Copyright lapsed — the Gutenberg treatises.
  'public_domain_dedicated',// CC0 and equivalents: a deliberate dedication.
  'creative_commons',       // A CC grant with clauses that bite. BY/SA/NC/ND.
  'open_government',        // UK OGL, Open Parliament Licence, EU CC BY. Reuse
                            // including commercial reuse is granted, usually
                            // with attribution.
  'permission_none',        // No reuse grant published. Per the standing rule
                            // (`mirror-needs-grant-proxy-does-not`, Bruce
                            // 2026-09-08) we may PROXY this live but must not
                            // mirror it. The corpus table refuses this value —
                            // see the CHECK in migration 196.
  'unknown',                // Not yet checked. Also refused by the corpus table:
                            // "check before you bake, not after".
  'vendor_terms',           // A bespoke API/vendor licence with its own clauses —
                            // the Semantic Scholar API License Agreement, CORE's
                            // Terms & Conditions. Not CC, not open government,
                            // and not "no grant": there IS a grant, it is just
                            // theirs. Proxy-only: such terms forbid passing the
                            // data on as a dataset, so `mayMirror` is false and
                            // the corpus table's CHECK does not admit it. Added
                            // for #1974 so a proxied non-commercial API can carry
                            // real LicenseTerms instead of being mislabelled as
                            // Creative Commons or as unlicensed.
] as const;

type LicenseKind = (typeof LICENSE_KINDS)[number];

/** The clauses that actually constrain a caller. Empty for a public-domain work. */
const LICENSE_OBLIGATIONS = [
  'attribution',    // BY — the credit in `attribution` must be shown.
  'share_alike',    // SA — derivatives must carry the same licence.
  'non_commercial', // NC — the reason #1974 needs zeroRated.
  'no_derivatives', // ND — no modified redistribution.
] as const;

type LicenseObligation = (typeof LICENSE_OBLIGATIONS)[number];

interface LicenseTerms {
  /**
   * SPDX identifier where one exists: 'CC-BY-NC-SA-4.0', 'CC-BY-SA-4.0',
   * 'CC-BY-4.0', 'CC0-1.0', 'OGL-UK-3.0'. US federal works have no SPDX id
   * because they are not licensed at all, so they carry the LicenseRef form
   * 'LicenseRef-US-Gov-Works-17USC105' — distinguishable at a glance from a CC
   * grant, which is the point.
   */
  id: string;
  kind: LicenseKind;
  url: string | null;
  /**
   * The literal attribution string we are required to render, written out. A
   * boolean cannot be shown to a user, and ShareAlike compliance means SHOWING
   * the credit — so this is the text, or null when nothing is required.
   */
  attribution: string | null;
  /** The clauses that bite. Empty array for a public-domain work. */
  obligations: LicenseObligation[];
}

/** 'LicenseRef-' prefix marks an id that is not an SPDX licence — see LicenseTerms.id. */
const US_GOV_LICENSE_ID = 'LicenseRef-US-Gov-Works-17USC105';

/** The terms for a work of the US federal government. No licensor, no clauses. */
function usGovernmentWork(): LicenseTerms {
  return {
    id: US_GOV_LICENSE_ID,
    kind: 'public_domain_us_gov',
    url: 'https://www.law.cornell.edu/uscode/text/17/105',
    attribution: null,
    obligations: [],
  };
}

/**
 * Is the CALLER bound by anything downstream? This is the flag a caller needs in
 * order to comply, and it must be surfaced on the payload: they cannot honour
 * terms we never showed them.
 */
function isEncumbered(l: LicenseTerms): boolean {
  return l.obligations.length > 0;
}

/**
 * Does serving this document have to be free? NC forbids commercial use, and
 * Pipeworx bills per call, so an NC document must route through the gateway's
 * `zeroRated` path. This is the hook #1974 reads; it is derived from the
 * obligations rather than stored, so it cannot drift away from the licence.
 */
function requiresZeroRating(l: LicenseTerms): boolean {
  return l.obligations.includes('non_commercial');
}

/**
 * May we MIRROR this document, as opposed to proxying it live? Bruce's standing
 * rule: `mirror-needs-grant-proxy-does-not` (2026-09-08). Everything in the
 * corpus rail is a mirror by construction, so this has to be true for anything
 * that lands in `secondary_legal_documents` — and migration 196 enforces it in
 * the database rather than trusting 14 loaders to remember.
 */
function mayMirror(l: LicenseTerms): boolean {
  return l.kind !== 'permission_none' && l.kind !== 'unknown' && l.kind !== 'vendor_terms';
}

/** One sentence a caller can render verbatim next to the text. */
function licenseNote(l: LicenseTerms): string {
  if (!isEncumbered(l)) {
    return l.kind === 'public_domain_us_gov'
      ? 'Work of the United States Government — not subject to copyright (17 U.S.C. § 105). No reuse conditions.'
      : `${l.id} — no reuse conditions.`;
  }
  const clauses: string[] = [];
  if (l.obligations.includes('attribution')) {
    clauses.push(`you must credit the source${l.attribution ? ` as: "${l.attribution}"` : ''}`);
  }
  if (l.obligations.includes('share_alike')) clauses.push(`any derivative you publish must carry ${l.id}`);
  if (l.obligations.includes('non_commercial')) clauses.push('you may not use it commercially');
  if (l.obligations.includes('no_derivatives')) clauses.push('you may not publish modified versions');
  return `${l.id} — ${clauses.join('; ')}. These conditions bind you as well as us.`;
}

/**
 * A Creative Commons grant, with the obligations DERIVED from the SPDX id so
 * the two can never disagree: 'CC-BY-NC-SA-2.5' yields attribution +
 * non_commercial + share_alike, and the licence URL is built from the same
 * tokens. `attribution` is the credit line the rightsholder asks for, written
 * out — BY means rendering it, so it travels on the payload verbatim.
 *
 * Added for #1974 (Cornell LII/Wex is BY-NC-SA 2.5 per its own terms page;
 * CALI eLangdell titles are BY-NC-SA 4.0 or BY-SA 4.0 per each book's front
 * matter). A pack that hand-types `obligations` next to an id is one edit
 * away from a BY-SA title labelled non-commercial or the reverse, and one
 * mis-filed title is the whole compliance story.
 */
function creativeCommonsLicense(id: string, attribution: string | null): LicenseTerms {
  const m = /^CC-(0|BY(?:-NC)?(?:-SA|-ND)?)-(\d+\.\d+)$/i.exec(id.trim());
  if (!m) throw new Error(`creativeCommonsLicense: unrecognised id ${JSON.stringify(id)} (expected e.g. CC-BY-NC-SA-4.0 or CC0-1.0-style CC-0-1.0)`);
  const clauses = m[1].toUpperCase();
  const version = m[2];
  if (clauses === '0') {
    return {
      id: `CC0-${version}`,
      kind: 'public_domain_dedicated',
      url: `https://creativecommons.org/publicdomain/zero/${version}/`,
      attribution: null,
      obligations: [],
    };
  }
  const obligations: LicenseObligation[] = ['attribution'];
  if (clauses.includes('-NC')) obligations.push('non_commercial');
  if (clauses.includes('-SA')) obligations.push('share_alike');
  if (clauses.includes('-ND')) obligations.push('no_derivatives');
  return {
    id: `CC-${clauses}-${version}`,
    kind: 'creative_commons',
    url: `https://creativecommons.org/licenses/${clauses.toLowerCase()}/${version}/`,
    attribution,
    obligations,
  };
}

/**
 * Terms that are a vendor's own document rather than a public licence — an API
 * licence agreement we accepted to hold a key. `id` uses the SPDX LicenseRef
 * form so it cannot be mistaken for a CC grant; `url` is the document itself;
 * `obligations` are whichever of the four clauses the document actually
 * imposes, read from it rather than assumed. Always proxy-only (see mayMirror).
 */
function vendorTermsLicense(opts: {
  ref: string;
  url: string;
  attribution: string | null;
  obligations: LicenseObligation[];
}): LicenseTerms {
  const ref = opts.ref.startsWith('LicenseRef-') ? opts.ref : `LicenseRef-${opts.ref}`;
  return { id: ref, kind: 'vendor_terms', url: opts.url, attribution: opts.attribution, obligations: [...opts.obligations] };
}

/**
 * Put the licence ON THE PAYLOAD. Every response of a licensed pack — including
 * soft failures, which are still "derived from" the licensed source — carries
 * `license` (the LicenseTerms: id, kind, url, attribution, obligations),
 * `license_note` (one sentence a caller can render verbatim) and, for BY
 * terms, a top-level `attribution` so the credit is the first thing a
 * synthesising model reads. Leading keys on purpose — mcps/finra established
 * that ordering and the reason (fleet #531): the answer path passes a pack's
 * structuredContent through, so what leads the object leads the answer.
 *
 * This is the coordination point with #1970/#1976: one `license` field, one
 * shape, derived from LicenseTerms — never a second per-pack mechanism.
 */
function attachLicense<T>(result: T, terms: LicenseTerms): Record<string, unknown> {
  const head: Record<string, unknown> = {
    ...(terms.attribution ? { attribution: terms.attribution } : {}),
    license: terms,
    license_note: licenseNote(terms),
  };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...head, ...(result as Record<string, unknown>) };
  }
  return { ...head, data: result };
}

function isLicenseKind(v: unknown): v is LicenseKind {
  return typeof v === 'string' && (LICENSE_KINDS as readonly string[]).includes(v);
}

function isLicenseObligation(v: unknown): v is LicenseObligation {
  return typeof v === 'string' && (LICENSE_OBLIGATIONS as readonly string[]).includes(v);
}

// ───────────────────────── the envelope ─────────────────────────

/**
 * The authority envelope every secondary-legal pack attaches to a document.
 * Mirrors the columns in supabase/migrations/196_secondary_legal_corpus.sql —
 * keep the two in step.
 */
interface LegalAuthority {
  /** Stable id within the source, e.g. 'R47132' or 'mpep-2106'. */
  doc_id: string;
  /** Pack/source slug this came from, e.g. 'crs-reports'. */
  source: string;
  title: string;

  authority_type: AuthorityType;
  /** Nullable so an honest omission is representable; treated as 'unknown'. */
  binding_status: BindingStatus | null;
  /**
   * The nuance the enum cannot carry, as a sentence a caller can show a human.
   * BOTH fields ship — see BINDING_STATUS_IS_CODED_PLUS_PROSE below.
   *
   * e.g. binding_status: 'persuasive' + binding_note: "GAO's own view of federal
   * appropriations law. Persuasive and followed in practice by agency counsel;
   * not binding on courts."
   */
  binding_note: string | null;

  /**
   * Whose law. Hierarchical so a caller can prefix-match:
   * 'us' · 'us-federal' · 'us-federal-ca9' · 'us-tx' · 'uk' · 'eu'.
   *
   * 'us-federal', NOT 'us-federal': the shipped govinfo GAO tools (#1972) already
   * emit the long form, and matching what is live costs nothing while an
   * abbreviation nobody needs would make two spellings of one jurisdiction.
   */
  jurisdiction: string;
  /** The body that issued it, in its own words: 'Congressional Research Service'. */
  issuer: string;

  /** When the instrument took or takes effect. Null when the source says nothing. */
  effective_date: string | null;
  /** Set when binding_status is superseded/repealed/vacated. A doc_id or citation. */
  superseded_by: string | null;

  /** Citations this document makes, as the source writes them. Never guessed. */
  citations: string[];

  /**
   * The terms WE rely on to serve this document, and the obligations they put on
   * the CALLER. Per document, not per source — see the LicenseTerms doc comment
   * for why that is not a nicety.
   */
  license: LicenseTerms;

  /** When we fetched our copy. Always set by the loader; never by hand. */
  retrieved_at: string;
  /** The source's own last-modified, when it publishes one. */
  source_last_modified: string | null;
}

// ───────────────────────── the age-labelling contract ─────────────────────────
//
// Bruce's ruling, 2026-09-14: SERVE STALE DATA AND LABEL THE AGE. Never refuse.
// So nothing in this section throws, returns null, or withholds a document. The
// only output is a label, and the caller decides.
//
// THE TWO AGES ARE DIFFERENT AND THE FLAG ONLY WATCHES ONE OF THEM.
//
//   age_days        — how old OUR COPY is (now - retrieved_at). This is the one
//                     `stale` keys on, because it is the one that answers "did
//                     our refresh stop running". It is a defect when it grows.
//   source_age_days — how old the DOCUMENT is (now - source_last_modified).
//                     Informational, and NEVER a staleness signal: the
//                     Constitution is 238 years old and perfectly fresh. Wiring
//                     the flag to this instead is the obvious bug here, which is
//                     why they have different names and this paragraph exists.

const DAY_MS = 86_400_000;

/**
 * Per-source tolerance in days: how old our copy may get before we say so.
 * Set from the source's own publication cadence plus one missed cycle, because
 * the failure worth catching is a refresh that STOPPED, not a source that is
 * between releases.
 *
 * A source absent from this map gets DEFAULT_TOLERANCE_DAYS and is reported as
 * using the default, rather than being skipped. An unlisted source that is
 * silently exempt is how a staleness check becomes unable to fail.
 */
const SOURCE_TOLERANCE_DAYS: Record<string, number> = {
  // Continuously revised, so a copy older than ~2 weeks means the cron stopped.
  'crs-reports': 14,
  'doj-justice-manual': 21,
  'irs-irm': 21,
  'govuk-manuals': 14,
  // Weekly to monthly publishers: one cycle plus a missed one.
  'gao-reports': 21,
  'ftc-legal-library': 60,
  'eeoc-dol-nlrb-guidance': 60,
  'sec-staff-interpretations': 60,
  'fjc-publications': 60,
  // Quarterly / edition-driven. Generous on the document, tight enough that a
  // dead refresh still surfaces within a cycle or two.
  'constitution-annotated': 120,
  'eoir-practice-manuals': 120,
  'uspto-mpep': 200,
  'uspto-tmep': 400,
  'copyright-compendium': 400,
  'federal-jury-instructions': 400,
  // Historical corpus: the documents never change, but a re-crawl that stops
  // still means the pipeline is dead, so this is a liveness number not a
  // freshness one.
  'gutenberg-legal': 400,
};

const DEFAULT_TOLERANCE_DAYS = 90;

function sourceToleranceDays(source: string): number {
  return SOURCE_TOLERANCE_DAYS[source] ?? DEFAULT_TOLERANCE_DAYS;
}

interface AgeLabel {
  retrieved_at: string;
  source_last_modified: string | null;
  effective_date: string | null;
  /** Age of OUR COPY in days. What `stale` watches. */
  age_days: number;
  /** Age of the DOCUMENT in days, or null. Informational — never a defect. */
  source_age_days: number | null;
  /**
   * false when the source's own last-modified is known NOT to track content.
   * GAOREPORTS is the case: 16,569 packages, none issued after 2009, every one
   * stamped last_modified 2025-03-07 — a bulk re-stamp. Present, well-formed,
   * recent, and meaningless.
   */
  source_last_modified_trusted: boolean;
  /**
   * The date the CONTENT is actually as-of, when the change signal cannot be
   * believed. Where this is set, source_age_days is measured from it rather than
   * from the re-stamp, because reporting a 2009 report as 191 days old is a
   * confident false statement and "we don't know" would have been better.
   */
  content_as_of: string | null;
  tolerance_days: number;
  /** true when age_days > tolerance_days. Never a reason to withhold. */
  stale: boolean;
  /** Set when tolerance came from DEFAULT_TOLERANCE_DAYS rather than the map. */
  tolerance_is_default: boolean;
  /** One sentence a caller can show a human verbatim. */
  note: string;
}

function ageDays(fromIso: string | null | undefined, nowMs: number): number | null {
  if (!fromIso) return null;
  const ms = Date.parse(fromIso);
  if (Number.isNaN(ms)) return null;
  // Clamp at 0: a retrieved_at a few seconds in the future (clock skew between
  // the loader and the reader) must not read as a negative age.
  return Math.max(0, Math.round(((nowMs - ms) / DAY_MS) * 10) / 10);
}

/**
 * Label a document's age. ALWAYS returns a label — there is no failure mode and
 * no refusal, by ruling.
 *
 * `toleranceOverrideDays` exists so a tool can expose a per-call tolerance and
 * so the contract is testable: lower it and `stale` must flip to true on the
 * same document, which is the red case for this check.
 */
function labelAge(
  doc: Pick<LegalAuthority, 'source' | 'retrieved_at' | 'source_last_modified' | 'effective_date'> & {
    /** Pass false when the source's last_modified is a bulk re-stamp. */
    source_last_modified_trusted?: boolean;
    /** Required when the above is false: what the content is really as-of. */
    content_as_of?: string | null;
  },
  nowMs: number = Date.now(),
  toleranceOverrideDays?: number,
): AgeLabel {
  const mapped = SOURCE_TOLERANCE_DAYS[doc.source];
  const tolerance = toleranceOverrideDays ?? mapped ?? DEFAULT_TOLERANCE_DAYS;
  const toleranceIsDefault = toleranceOverrideDays === undefined && mapped === undefined;

  // A missing or unparseable retrieved_at is not an excuse to skip the check.
  // It reads as infinitely old, which is loud, rather than as fresh, which is
  // the silent failure this whole contract exists to prevent.
  const copyAge = ageDays(doc.retrieved_at, nowMs);
  const age = copyAge ?? Number.POSITIVE_INFINITY;
  // A change signal we cannot believe must not produce a freshness number. Where
  // the source says "trust content_as_of instead", measure the document age from
  // that; where it says neither, report null rather than inventing one.
  const signalTrusted = doc.source_last_modified_trusted !== false;
  const asOf = doc.content_as_of ?? null;
  const srcAge = signalTrusted ? ageDays(doc.source_last_modified, nowMs) : ageDays(asOf, nowMs);
  const stale = age > tolerance;

  // WORDING IS LOAD-BEARING: no possessive. "our copy is 0d old" ships to
  // callers on every response on this rail and tells them we hold a copy, which
  // is against the standing rule to let callers assume pass-through. "retrieved
  // Nd ago" carries the identical meaning — a retrieval time is a fact about
  // the record either way — without making a claim about who stores what.
  // Caught live on crs_recent by Marten (0) before this rail reached its other
  // 13 sources; check:hosting-claims did not catch it because it does not scan
  // shared/ at all.
  const note = copyAge === null
    ? `no usable retrieved_at, so this is treated as stale against the ${tolerance}d tolerance for "${doc.source}"`
    : stale
      ? `retrieved ${age}d ago, past the ${tolerance}d refresh tolerance for "${doc.source}" — served anyway, labelled stale`
      : `retrieved ${age}d ago, within the ${tolerance}d refresh tolerance for "${doc.source}"`;

  return {
    retrieved_at: doc.retrieved_at,
    source_last_modified: doc.source_last_modified ?? null,
    effective_date: doc.effective_date ?? null,
    age_days: age === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : age,
    source_age_days: srcAge,
    source_last_modified_trusted: signalTrusted,
    content_as_of: asOf,
    tolerance_days: tolerance,
    stale,
    tolerance_is_default: toleranceIsDefault,
    note,
  };
}

/**
 * The shape a pack returns for one document: the authority envelope, the age
 * label, and the text. Every secondary-legal tool response carries this so a
 * caller never has to ask a second question to find out how old the answer is.
 */
interface AuthoredDocument extends LegalAuthority {
  tier: AuthorityTier;
  freshness: AgeLabel;
  /**
   * The licence obligations, surfaced ON THE PAYLOAD rather than left in the row.
   * A caller cannot comply with terms we never showed it, so an encumbered
   * document always arrives with the conditions attached and the attribution
   * string spelled out.
   */
  license_terms: {
    encumbered: boolean;
    requires_zero_rating: boolean;
    note: string;
  };
  text?: string;
}

function withAuthorityEnvelope(
  doc: LegalAuthority,
  opts: { text?: string; nowMs?: number; toleranceOverrideDays?: number } = {},
): AuthoredDocument {
  return {
    ...doc,
    tier: authorityTier(doc.authority_type),
    freshness: labelAge(doc, opts.nowMs ?? Date.now(), opts.toleranceOverrideDays),
    license_terms: {
      encumbered: isEncumbered(doc.license),
      requires_zero_rating: requiresZeroRating(doc.license),
      note: licenseNote(doc.license),
    },
    ...(opts.text !== undefined ? { text: opts.text } : {}),
  };
}
/**
 * France LEGI — the official consolidated French codes (Code civil, Code
 * pénal, Code du travail, Code général des impôts and the rest of the codes
 * in force), article by article and version by version. Fleet #2936.
 *
 * SOURCE: DILA's LEGI open-data base — the same consolidated text Légifrance
 * publishes — from https://echanges.dila.gouv.fr/OPENDATA/LEGI/ (catalogue:
 * https://www.data.gouv.fr/datasets/legi-codes-lois-et-reglements-consolides).
 * DILA ships it only as bulk XML (a global stock plus a daily update archive);
 * the per-article API (PISTE) needs an account. scripts/ingest-france-legi.mjs
 * applies the stock and every daily update in order, exactly as DILA
 * specifies, and writes per-code indexes plus article text that this pack
 * reads through the `_r2` binding; full-text search runs on the
 * `_searchShards` FTS5 index (shard "fr-legi", workers/gateway/src/search-shard.ts).
 * .github/workflows/france-legi-refresh.yml applies each new daily archive.
 *
 * LICENCE: Licence Ouverte / Open Licence 2.0 (Etalab) — reuse including
 * commercial reuse, on condition of naming the source and the date of its
 * last update. Every response carries both (`attribution`, `data_as_of`).
 *
 * VERSIONS: every LEGI article version is its own record (LEGIARTI id) with
 * DATE_DEBUT / DATE_FIN; an amendment creates a new one and closes the old.
 * All versions of every article in the codes in force are available, so a
 * caller can ask what an article said on a past date, or follow a
 * renumbering (Code civil 1382 -> 1240 in 2016).
 */

import {
  type CodeRow, type VersionRef, normalizeNum, inForceAt, resolveCode, ftsQuery, bucketOf,
  legiId, excerpt, legifranceUrl, todayIso, parseDate,
} from './core.js';

const PREFIX = 'legi';
const SHARD = 'fr-legi';
// Publisher + dataset only -- never the archive route (CLAUDE.md step 9b, fleet #2938).
const SOURCE = 'DILA — base LEGI (codes consolidés, Légifrance), LEGI open-data archive';
// The only outbound request is to the gateway's own search Durable Object;
// it still says who is asking, like every other call a pack makes.
const UA = 'pipeworx-mcp-france-legi/1.0 (+https://pipeworx.io)';

interface R2Like {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}
interface ShardStub { fetch: (url: string, init?: RequestInit) => Promise<Response> }
interface ShardNs { idFromName(name: string): unknown; get(id: unknown): ShardStub }

interface CodesDoc {
  data_as_of: string;
  last_archive: string;
  built_for: string;
  code_count: number;
  codes: CodeRow[];
}

interface ArticleEntry {
  id: string;
  cid: string;
  num: string | null;
  etat: string | null;
  debut: string;
  fin: string;
  type: string | null;
  breadcrumb: { id: string; title: string }[];
  versions: VersionRef[];
  text: string;
  nota: string | null;
}

interface TocNode {
  id: string;
  title: string;
  sections?: TocNode[];
  articles?: { id: string; num: string | null }[];
  missing?: boolean;
}
interface TocDoc {
  cid: string;
  title: string | null;
  as_of: string;
  section_count: number;
  article_count: number;
  sections: TocNode[];
  articles?: { id: string; num: string | null }[];
}

/** Store-level failures are LOUD: a missing binding or object means the
 *  store is broken or not loaded, which must never read as "no such law". */
class StoreError extends Error {
  constructor(msg: string) {
    super(`france-legi: ${msg}`);
    this.name = 'StoreError';
  }
}

function r2Of(args: Record<string, unknown>): R2Like {
  const r2 = args._r2 as R2Like | undefined;
  if (!r2 || typeof r2.get !== 'function') {
    throw new StoreError('the LEGI article store is not bound in this runtime (no _r2). These tools answer through the Pipeworx gateway; a standalone install has no data to read.');
  }
  return r2;
}

// Per-isolate read cache. Not baked data: these are R2 reads, kept for a few
// minutes so a burst of lookups in one code does not re-read its index.
const CACHE_TTL_MS = 10 * 60 * 1000;
// Keyed by the binding object, so two stores (or a test's fake) never share.
const caches = new WeakMap<R2Like, Map<string, { at: number; v: unknown }>>();
async function readJson<T>(r2: R2Like, key: string, opts: { required: boolean; cache?: boolean }): Promise<T | null> {
  let cache = caches.get(r2);
  if (!cache) { cache = new Map(); caches.set(r2, cache); }
  const hit = opts.cache ? cache.get(key) : undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.v as T;
  const obj = await r2.get(key);
  if (!obj) {
    if (opts.required) throw new StoreError(`store object ${key} is missing — the LEGI load is incomplete.`);
    return null;
  }
  let v: T;
  try {
    v = JSON.parse(await obj.text()) as T;
  } catch (e) {
    throw new StoreError(`store object ${key} is not valid JSON (${String(e).slice(0, 80)}).`);
  }
  if (opts.cache) {
    if (cache.size > 64) cache.clear();
    cache.set(key, { at: Date.now(), v });
  }
  return v;
}

const loadCodes = (r2: R2Like) => readJson<CodesDoc>(r2, `${PREFIX}/codes.json`, { required: true, cache: true }) as Promise<CodesDoc>;
const loadNums = (r2: R2Like, cid: string) =>
  readJson<Record<string, VersionRef[]>>(r2, `${PREFIX}/code/${cid}/nums.json`, { required: true, cache: true }) as Promise<Record<string, VersionRef[]>>;

async function loadArticles(r2: R2Like, ids: string[]): Promise<Map<string, ArticleEntry>> {
  const byBucket = new Map<number, string[]>();
  for (const id of ids) {
    const b = bucketOf(id);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(id);
  }
  const out = new Map<string, ArticleEntry>();
  await Promise.all(
    [...byBucket.keys()].map(async (b) => {
      const entries = await readJson<Record<string, ArticleEntry>>(r2, `${PREFIX}/art/${b}.json`, { required: false });
      for (const id of byBucket.get(b)!) {
        const e = entries?.[id];
        if (e) out.set(id, e);
      }
    }),
  );
  return out;
}

function licence(dataAsOf: string): LicenseTerms {
  return {
    id: 'etalab-2.0',
    kind: 'open_government',
    url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
    attribution: `DILA — base LEGI (Légifrance), Licence Ouverte 2.0, mise à jour du ${dataAsOf.slice(0, 10)}`,
    obligations: ['attribution'],
  };
}

function wrap(result: Record<string, unknown>, codes: CodesDoc): Record<string, unknown> {
  return attachLicense({ ...result, data_as_of: codes.data_as_of, source: SOURCE }, licence(codes.data_as_of));
}

function codeMiss(input: unknown, codes: CodesDoc, m: Exclude<ReturnType<typeof resolveCode>, { ok: true }>) {
  return wrap({
    found: false,
    reason: m.reason,
    code: String(input ?? ''),
    message: m.reason === 'ambiguous_code'
      ? `"${String(input)}" matches several codes; pass one of the candidate titles or its cid.`
      : `No code in force matches "${String(input)}".`,
    candidates: m.reason === 'ambiguous_code' ? m.candidates.map((c) => ({ cid: c.cid, title: c.title })) : undefined,
    hint: m.reason === 'unknown_code'
      ? `Codes available (${codes.code_count}): ${codes.codes.slice(0, 80).map((c) => c.title).join(' · ')}`
      : undefined,
  }, codes);
}

const shapeVersion = (v: VersionRef, date: string) => ({
  id: v.id, num: v.num, etat: v.etat, date_debut: v.debut, date_fin: v.fin === '2999-01-01' ? null : v.fin,
  in_force: inForceAt(v, date),
});

function shapeArticle(e: ArticleEntry, date: string) {
  return {
    id: e.id,
    num: e.num,
    etat: e.etat,
    in_force: inForceAt(e, date),
    date_debut: e.debut,
    date_fin: e.fin === '2999-01-01' ? null : e.fin,
    path: e.breadcrumb.map((b) => b.title),
    text: e.text,
    nota: e.nota,
    url: legifranceUrl(e.id),
  };
}

// ───────────────────────── tools ─────────────────────────

async function frCodeArticle(args: Record<string, unknown>) {
  const r2 = r2Of(args);
  const codes = await loadCodes(r2);
  const date = parseDate(args.date) ?? todayIso();
  const m = resolveCode(args.code, codes.codes);
  if (!m.ok) return codeMiss(args.code, codes, m);
  const num = normalizeNum(args.article);
  if (!num) {
    return wrap({ found: false, reason: 'missing_article', message: 'Pass `article`, the article number as cited, e.g. "1240" or "L1221-1".' }, codes);
  }
  const nums = await loadNums(r2, m.code.cid);
  const versions = nums[num] ?? [];
  if (!versions.length) {
    return wrap({
      found: false,
      reason: 'article_not_found',
      code: { cid: m.code.cid, title: m.code.title },
      article: num,
      message: `No article ${num} in the ${m.code.title}, in any version.`,
      hint: 'Check the prefix (L = législative, R/D = réglementaire). fr_code_toc lists the numbers in force; fr_legi_search finds an article by its words.',
    }, codes);
  }
  const inForce = versions.filter((v) => inForceAt(v, date));
  const pick = inForce[0] ?? versions[0];
  const got = await loadArticles(r2, [pick.id, ...inForce.slice(1, 4).map((v) => v.id)]);
  const entry = got.get(pick.id);
  if (!entry) throw new StoreError(`article ${pick.id} is indexed in ${m.code.cid}/nums.json but its text is missing from the store.`);
  const article = shapeArticle(entry, date);
  return wrap({
    found: true,
    as_of_date: date,
    code: { cid: m.code.cid, title: m.code.title },
    article,
    ...(article.in_force ? {} : {
      note: `Article ${entry.num} of the ${m.code.title} was not in force on ${date}. This is its latest version (${entry.etat}, ${entry.debut} to ${entry.fin}). An article that was renumbered or abrogated keeps its old number in LEGI; fr_legi_search with a phrase from the text finds where it went.`,
    }),
    versions: entry.versions.map((v) => shapeVersion(v, date)),
    ...(inForce.length > 1 ? {
      other_matches: inForce.slice(1).map((v) => {
        const e = got.get(v.id);
        return { id: v.id, num: v.num, path: e?.breadcrumb.map((b) => b.title) ?? null };
      }),
    } : {}),
  }, codes);
}

async function frLegiSearch(args: Record<string, unknown>) {
  const r2 = r2Of(args);
  const ns = args._searchShards as ShardNs | undefined;
  if (!ns || typeof ns.idFromName !== 'function') {
    throw new StoreError('full-text search needs the Pipeworx search index (no _searchShards binding in this runtime).');
  }
  const codes = await loadCodes(r2);
  const query = String(args.query ?? '').trim();
  if (!query) {
    return wrap({ found: false, reason: 'empty_query', message: 'Pass `query` — words or a quoted phrase, in French, e.g. "responsabilité du fait des choses".' }, codes);
  }
  const date = parseDate(args.date) ?? todayIso();
  const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
  let cid: string | null = null;
  let codeTitle: string | null = null;
  if (args.code != null && String(args.code).trim() !== '') {
    const m = resolveCode(args.code, codes.codes);
    if (!m.ok) return codeMiss(args.code, codes, m);
    cid = m.code.cid;
    codeTitle = m.code.title;
  }
  const stub = ns.get(ns.idFromName(SHARD));
  const ask = async (mode: 'all' | 'any') => {
    const q = ftsQuery(query, mode, cid);
    if (!q) return [];
    const res = await stub.fetch('https://shard/query', {
      method: 'POST',
      body: JSON.stringify({ q, limit: Math.min(100, limit * 4) }),
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) {
      throw new StoreError(`the LEGI search index answered HTTP ${res.status}. This is an infrastructure failure, not an absence of matching articles.`);
    }
    const out = (await res.json()) as { results?: { opinion_id: number; score: number }[] };
    return out.results ?? [];
  };
  let mode: 'all' | 'any' = 'all';
  let hits = await ask('all');
  if (!hits.length && /\s/.test(query.trim())) {
    mode = 'any';
    hits = await ask('any');
  }
  const ids = hits.map((h) => legiId(h.opinion_id));
  const got = await loadArticles(r2, ids);
  const titles = new Map(codes.codes.map((c) => [c.cid, c.title]));
  const results = [];
  let notInForce = 0;
  for (const h of hits) {
    const e = got.get(legiId(h.opinion_id));
    if (!e) continue;
    if (!inForceAt(e, date)) { notInForce++; continue; }
    results.push({
      id: e.id,
      code: titles.get(e.cid) ?? e.cid,
      cid: e.cid,
      num: e.num,
      path: e.breadcrumb.slice(-2).map((b) => b.title),
      excerpt: excerpt(e.text, query),
      date_debut: e.debut,
      score: Math.round(h.score * 1000) / 1000,
      url: legifranceUrl(e.id),
    });
    if (results.length >= limit) break;
  }
  if (!results.length) {
    return wrap({
      found: false,
      reason: 'no_match',
      query,
      ...(codeTitle ? { code: { cid, title: codeTitle } } : {}),
      as_of_date: date,
      message: `No article in force on ${date}${codeTitle ? ` in the ${codeTitle}` : ` in the ${codes.code_count} codes in force`} matched "${query}".`,
      hint: 'Search is on the words of the article text and its section headings (French, accents optional). Try fewer or different words, or drop `code`.',
    }, codes);
  }
  return wrap({
    found: true,
    query,
    match: mode === 'all' ? 'all_words' : 'any_word',
    ...(codeTitle ? { code: { cid, title: codeTitle } } : {}),
    as_of_date: date,
    count: results.length,
    results,
    ...(notInForce ? { excluded_not_in_force: notInForce } : {}),
    hint: 'fr_code_article with the code and num returns the full text and its versions.',
  }, codes);
}

function prune(node: TocNode, depth: number, maxDepth: number, maxArticles: number): Record<string, unknown> {
  const count = (n: TocNode): { s: number; a: number } => {
    let s = 0, a = n.articles?.length ?? 0;
    for (const c of n.sections ?? []) { const k = count(c); s += 1 + k.s; a += k.a; }
    return { s, a };
  };
  const out: Record<string, unknown> = { id: node.id, title: node.title };
  if (depth >= maxDepth) {
    const c = count(node);
    if (c.s) out.subsection_count = c.s;
    if (c.a) out.article_count = c.a;
    return out;
  }
  if (node.sections?.length) out.sections = node.sections.map((s) => prune(s, depth + 1, maxDepth, maxArticles));
  if (node.articles?.length) {
    out.articles = node.articles.slice(0, maxArticles).map((a) => a.num ?? a.id);
    if (node.articles.length > maxArticles) out.articles_truncated = node.articles.length - maxArticles;
  }
  return out;
}

function findNode(nodes: TocNode[], id: string): TocNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const k = findNode(n.sections ?? [], id);
    if (k) return k;
  }
  return null;
}

async function frCodeToc(args: Record<string, unknown>) {
  const r2 = r2Of(args);
  const codes = await loadCodes(r2);
  const m = resolveCode(args.code, codes.codes);
  if (!m.ok) return codeMiss(args.code, codes, m);
  const toc = (await readJson<TocDoc>(r2, `${PREFIX}/code/${m.code.cid}/toc.json`, { required: true, cache: true })) as TocDoc;
  const depth = Math.min(8, Math.max(1, Number(args.depth) || 2));
  const sectionId = String(args.section_id ?? '').trim();
  let roots: TocNode[] = toc.sections;
  let rootArticles = toc.articles ?? [];
  let within: { id: string; title: string } | null = null;
  if (sectionId) {
    const n = findNode(toc.sections, sectionId);
    if (!n) {
      return wrap({
        found: false, reason: 'section_not_found', code: { cid: m.code.cid, title: m.code.title }, section_id: sectionId,
        message: `No section ${sectionId} in force in the ${m.code.title}.`,
        hint: 'Call fr_code_toc without section_id to list the top-level sections and their ids.',
      }, codes);
    }
    roots = n.sections ?? [];
    rootArticles = n.articles ?? [];
    within = { id: n.id, title: n.title };
  }
  if (!roots.length && !rootArticles.length) {
    throw new StoreError(`the table of contents for ${m.code.cid}${sectionId ? ` / ${sectionId}` : ''} is empty, which the source never is for a code in force — the load is incomplete.`);
  }
  return wrap({
    found: true,
    code: { cid: m.code.cid, title: m.code.title },
    toc_as_of: toc.as_of,
    ...(within ? { section: within } : {}),
    totals: { sections: toc.section_count, articles_in_force: toc.article_count },
    depth,
    sections: roots.map((s) => prune(s, 1, depth, 400)),
    ...(rootArticles.length ? { articles: rootArticles.slice(0, 400).map((a) => a.num ?? a.id) } : {}),
    hint: 'Pass a section id as section_id (and depth) to expand one branch; fr_code_article returns an article\'s text.',
  }, codes);
}

async function frArticleVersions(args: Record<string, unknown>) {
  const r2 = r2Of(args);
  const codes = await loadCodes(r2);
  const date = todayIso();
  let id = String(args.id ?? '').trim().toUpperCase();
  let codeRef: { cid: string; title: string } | null = null;
  if (!id) {
    const m = resolveCode(args.code, codes.codes);
    if (!m.ok) {
      if (args.code == null) {
        return wrap({ found: false, reason: 'missing_argument', message: 'Pass `id` (a LEGIARTI id) or both `code` and `article`.' }, codes);
      }
      return codeMiss(args.code, codes, m);
    }
    codeRef = { cid: m.code.cid, title: m.code.title };
    const num = normalizeNum(args.article);
    const vs = (await loadNums(r2, m.code.cid))[num] ?? [];
    if (!vs.length) {
      return wrap({
        found: false, reason: 'article_not_found', code: codeRef, article: num,
        message: `No article ${num} in the ${m.code.title}, in any version.`,
        hint: 'fr_legi_search finds an article by its words; fr_code_toc lists numbers in force.',
      }, codes);
    }
    id = vs[0].id;
  }
  if (!/^LEGIARTI\d{12}$/.test(id)) {
    return wrap({ found: false, reason: 'bad_id', id, message: 'id must be a LEGIARTI identifier, e.g. LEGIARTI000032041571.' }, codes);
  }
  const head = (await loadArticles(r2, [id])).get(id);
  if (!head) {
    return wrap({
      found: false, reason: 'id_not_found', id,
      message: `${id} is not an article version of a code in force.`,
      hint: 'Only the codes in force are covered; ids from non-codified laws and decrees are not.',
    }, codes);
  }
  const includeText = args.include_text !== false;
  const list = [...head.versions].sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  const texts = includeText ? await loadArticles(r2, list.slice(-20).map((v) => v.id)) : new Map<string, ArticleEntry>();
  const titles = new Map(codes.codes.map((c) => [c.cid, c.title]));
  return wrap({
    found: true,
    code: codeRef ?? { cid: head.cid, title: titles.get(head.cid) ?? head.cid },
    num: head.num,
    version_count: list.length,
    versions: list.map((v) => {
      const e = texts.get(v.id);
      return {
        ...shapeVersion(v, date),
        url: legifranceUrl(v.id),
        ...(includeText ? { text: e?.text ?? null, ...(e ? {} : { text_note: 'text not held for this version' }) } : {}),
      };
    }),
    ...(includeText && list.length > 20 ? { text_note: 'text is included for the 20 most recent versions' } : {}),
  }, codes);
}

// ───────────────────────── tool defs ─────────────────────────

const CODE_ARG = {
  type: 'string',
  description: 'The code: its title ("Code civil", "Code du travail", "Code général des impôts"), a short form ("civil", "travail", "CGI", "CPP", "CSP"), or its Légifrance cid (LEGITEXT000006070721).',
};

const tools: McpToolExport['tools'] = [
  {
    name: 'fr_code_article',
    description:
      'Read an article of an official French code — Code civil, Code pénal, Code du travail, Code de commerce, Code général des impôts, Code de la santé publique and the other codes in force — by code and article number, from DILA\'s consolidated LEGI base (the text Légifrance publishes). Returns the text in force today (or on `date`), its dates of entry into force and end, its place in the code (livre/titre/chapitre), the NOTA, and every version of the article with dates. Use for "what does article 1240 of the Code civil say", "Code du travail L1221-1", "article 121-3 du Code pénal".',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: CODE_ARG,
        article: { type: 'string', description: 'Article number as cited: "1240", "L1221-1", "L. 1221-1", "R214-117", "121-3".' },
        date: { type: 'string', description: 'Optional YYYY-MM-DD: return the version in force on that date instead of today.' },
      },
      required: ['code', 'article'],
    },
  },
  {
    name: 'fr_legi_search',
    description:
      'Full-text search across the articles in force of the French codes (DILA LEGI consolidated text) — find which article of French law deals with a subject, in French: "responsabilité du fait des choses", "licenciement pour motif économique", "abus de biens sociaux". Optional `code` restricts to one code. Returns ranked articles with code, number, section path and an excerpt; quote a phrase for an exact phrase match.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Words or a "quoted phrase", in French. Accents optional.' },
        code: { ...CODE_ARG, description: `Optional — restrict to one code. ${CODE_ARG.description}` },
        date: { type: 'string', description: 'Optional YYYY-MM-DD: only articles in force on that date (default today).' },
        limit: { type: 'number', description: 'Results to return, 1-25 (default 10).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fr_code_toc',
    description:
      'Table of contents of a French code in force (parties, livres, titres, chapitres, sections) with the article numbers under each heading, from DILA\'s LEGI consolidated base. `depth` controls how many levels come back; pass a `section_id` from a previous answer to expand one branch. Use to browse the structure of the Code civil, Code du travail, Code de commerce, etc., or to list the articles of a chapter.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: CODE_ARG,
        section_id: { type: 'string', description: 'Optional LEGISCTA id of a section to expand (from a previous fr_code_toc answer).' },
        depth: { type: 'number', description: 'Levels to return below the starting point, 1-8 (default 2).' },
      },
      required: ['code'],
    },
  },
  {
    name: 'fr_article_versions',
    description:
      'Version history of an article of a French code: every consolidated version with its dates of entry into force and end, its status (VIGUEUR, MODIFIE, ABROGE…) and its text, from DILA\'s LEGI base. Pass a LEGIARTI `id`, or `code` + `article`. Use for "how has article L1237-19 of the Code du travail changed", "what did article 1382 of the Code civil say before 2016".',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'A LEGIARTI id, e.g. LEGIARTI000032041571 (any version of the article).' },
        code: { ...CODE_ARG, description: `With article, instead of id. ${CODE_ARG.description}` },
        article: { type: 'string', description: 'With code, instead of id: the article number, e.g. "1240".' },
        include_text: { type: 'boolean', description: 'Include each version\'s text (default true; the 20 most recent versions).' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'fr_code_article': return frCodeArticle(args);
    case 'fr_legi_search': return frLegiSearch(args);
    case 'fr_code_toc': return frCodeToc(args);
    case 'fr_article_versions': return frArticleVersions(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
