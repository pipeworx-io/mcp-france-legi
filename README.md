# @pipeworx/france-legi

The official consolidated French codes — Code civil, Code pénal, Code du travail,
Code de commerce, Code général des impôts and the rest of the codes in force —
article by article and version by version, from DILA's LEGI base (the text
Légifrance publishes): an article's current text with its dates, its full version
history, a code's table of contents, and full-text search across every article in
force.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1865+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

- `fr_code_article(code, article, date?)` — the text of one article, by code and
  number ("Code civil", "1240"; "Code du travail", "L1221-1"), as in force today
  or on `date`, with `date_debut` / `date_fin`, its place in the code
  (livre / titre / chapitre), the NOTA, and the list of all its versions. An
  article that was abrogated or renumbered comes back marked `in_force: false`
  with its last version, never as a miss.
- `fr_legi_search(query, code?, date?, limit?)` — ranked articles in force whose
  text or section headings match the words ("responsabilité du fait des choses",
  "licenciement pour motif économique"); a quoted phrase matches as a phrase;
  `code` restricts to one code. Each hit carries code, number, path and an
  excerpt.
- `fr_code_toc(code, section_id?, depth?)` — a code's structure in force (parties,
  livres, titres, chapitres, sections) with the article numbers under each
  heading; pass a `section_id` from one answer to expand that branch.
- `fr_article_versions(id | code + article, include_text?)` — every consolidated
  version of an article with its status (VIGUEUR, MODIFIE, ABROGE…), dates and
  text.

`code` accepts the official title, a short form ("civil", "travail", "CGI",
"CPP", "CSP", "CCH"…) or the Légifrance cid (`LEGITEXT000006070721`). Every
response carries `data_as_of` (the timestamp of the last DILA daily archive
applied), `source`, and the Licence Ouverte attribution.

## Auth

Keyless. The tools answer through the Pipeworx gateway, which supplies the
article store and the search index; a standalone install has no data to read
and says so with an error rather than an empty result.

## Data sources

- DILA (Direction de l'information légale et administrative), LEGI open-data
  archive — "LEGI : Codes, lois et règlements consolidés" (Premier ministre /
  DILA), the consolidated text Légifrance publishes. Pipeworx applies DILA's
  global stock and every daily update in order, so `data_as_of` is the
  timestamp of the last daily update applied.
- Each article in a response links to its page on Légifrance, the official
  publication, so a caller can cite and read the text there.

### Reuse terms (quoted)

LEGI is published under the **Licence Ouverte / Open Licence 2.0** (Etalab,
data.gouv.fr licence id `fr-lo`), which permits redistribution and commercial
reuse:

> Le « Concédant » concède au « Réutilisateur » un droit non exclusif et gratuit
> de libre « Réutilisation » de l'« Information » objet de la présente licence, à
> des fins commerciales ou non, dans le monde entier et pour une durée illimitée
> […] Le « Réutilisateur » est libre de réutiliser l'« Information » : de la
> reproduire, la copier, […] de la communiquer, la diffuser, la redistribuer, la
> publier et la transmettre, de l'exploiter à titre commercial […] Sous réserve
> de : mentionner la paternité de l'« Information » : sa source (au moins le nom
> du « Concédant ») et la date de dernière mise à jour de l'« Information »
> réutilisée.

— <https://www.etalab.gouv.fr/licence-ouverte-open-licence/>. Every response
therefore carries `attribution` ("DILA — base LEGI (Légifrance), Licence Ouverte
2.0, mise à jour du <date>"), `license` (`etalab-2.0`) and `data_as_of`. The
attribution confers no official character on the reuse.

### Coverage and what is not here

- **Codes in force only** — LEGI's codes in force: 77 codes (DILA's
  catalogue counts 73 official codes; LEGI also carries the four CGI
  annexes and a few legacy codes kept in force for some articles), 509,651
  article versions, 165,383 articles in force at the 2026-10-10 load. The
  other half of LEGI — non-codified laws, ordonnances, décrets and selected
  arrêtés and the 29 abrogated codes — is not loaded;
  `fr_article_versions` says so for an id from those texts.
- Search covers article versions in force or scheduled to enter into force when
  the index was last updated, and results are filtered to the `date` asked about.
  Ranking is BM25 over the article text and its section headings; words are
  matched with accents folded ("responsabilite" finds "responsabilité").
- LEGI keeps an abrogated or renumbered article under its old number. For a
  number with no version in force on the date asked, `fr_code_article` returns
  its last version with `in_force: false` rather than a miss, and
  `fr_legi_search` with a phrase from the text finds the new number. Numbers
  are also reused: the 1804 tort article 1382 of the Code civil became 1240 on
  2016-10-01, and 1382 now holds an unrelated rule of evidence —
  `fr_article_versions` on 1382 returns both texts with their dates.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "france-legi": {
      "url": "https://gateway.pipeworx.io/france-legi/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/france-legi/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1865+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/fr_code_article \
  -H 'Content-Type: application/json' \
  -d '{"code":"Code civil","article":"1240"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/fr_code_article`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-france-legi` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/france-legi/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "france-legi": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-france-legi"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about France Legi data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
