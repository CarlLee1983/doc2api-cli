# doc2api v1.0 Roadmap Design

## Context

doc2api is a pipeline-based CLI that converts API documentation (PDF, HTML) to OpenAPI 3.x specs. Current version: v0.3.1. The tool is positioned as a **structural extraction engine** — semantic understanding (auth detection, pagination, enum inference) is delegated to the AI Agent layer above.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Target audience | CLI users + AI Agent developers (library) | Both personas need stable, predictable output |
| Auth/pagination extraction | Deferred post-v1.0 | Semantic analysis belongs in AI Agent layer |
| Schema-inferrer enhancement | Deferred post-v1.0 | Same rationale — faithful extraction, no guessing |
| Publish platform | npm, Bun-first | npm for discoverability, Bun as primary runtime, Node.js best-effort |

## Release Plan

### v0.4.0 — CLI Standardization

**Goal**: Standard CLI conventions.

1. **`--version` flag** — Add to `parseArgs` options, intercept before command routing, print `doc2api v0.4.0`, exit 0.
2. **`--help` flag** — Add to `parseArgs` options, route to same usage output as positional `help` command, exit 0.
3. **Exit code standardization**:
   - 0 = success
   - 1 = general error (pipeline failure, file I/O, fetch/crawl E5xxx)
   - 2 = assemble failure
   - 3 = input validation error (bad args, file path, page range)
   - 4 = OpenAPI spec validation failure
   - Audit all `process.exit()` calls to ensure consistency.
4. **Tests** — CLI tests for `--version`, `--help`, and exit code scenarios.

### v0.5.0 — Programmatic API + Publish Preparation

**Goal**: Library-usable exports and npm-ready package.json.

1. **Public API entry** — New `src/lib.ts`:
   - Core pipeline: `extractText`, `chunkPages`, `classifyChunks`, `contextRefine`
   - Streaming: `streamPipeline`, `collectStream`
   - Assembly: `buildOpenApiSpec`, `inferSchema`
   - Types: `Chunk`, `ChunkType`, `ChunkContent`, `InspectData`, `Result`, `SuccessResult`, `FailResult`
   - Helpers: `ok`, `fail`
2. **package.json updates**:
   - `exports`: `"."` → `./dist/lib.js`, `"./cli"` → `./dist/index.js`
   - `files`: `["dist/", "bridge/", "LICENSE", "README.md"]`
   - `engines`: `{ "bun": ">=1.0" }`
   - `repository`, `bugs`, `homepage` fields
   - `prepublishOnly`: `"bun run build"`
3. **Build adjustment** — Produce both `dist/index.js` (CLI) and `dist/lib.js` (library).
4. **Tests** — Import tests verifying all `src/lib.ts` exports are usable.

### v0.6.0 — Error Docs + E2E Tests + HTML Parser

**Goal**: Reliability and self-service troubleshooting.

1. **Error code reference** — README.md section listing all E1xxx~E5xxx codes with type, description, and suggestion. Derived from scanning `fail()` calls in source.
2. **E2E tests** — `tests/e2e/` directory:
   - PDF → inspect → build AssembleInput → assemble → validate → valid OpenAPI spec
   - HTML URL → inspect → assemble → validate (fixture or mock server)
   - Edge cases: empty PDF, no endpoints, oversized chunk auto-split
3. **HTML generic-parser improvements**:
   - Heading recognition (`<h1>`~`<h6>` nesting)
   - Table extraction (`<table>` → structured headers/rows)
   - Code block recognition (`<pre><code>` → response example candidates)
   - No framework-specific parsers (Swagger UI, ReDoc, Slate deferred to post-v1.0)
4. **CI build step** — GitHub Actions adds build verification for `dist/` artifacts.

### v1.0.0 — RC Validation + CHANGELOG + npm Publish

**Goal**: Quality convergence and official release.

1. **CHANGELOG.md** — v0.1.0 through v1.0.0, Keep a Changelog format.
2. **README.md enhancements**:
   - Programmatic API usage example (full pipeline)
   - Complete workflow example (PDF → OpenAPI end-to-end)
   - Security section (SSRF protection, input validation, file size limits)
   - Updated CLI flags reference
3. **RC validation**:
   - Test with 2-3 real API documents (PDF + HTML)
   - Full test suite pass (unit + E2E)
   - `npm pack` verification (correct `files` field, no tests/fixtures leaked)
   - `bun run build && bun dist/index.js help` and `--version` working
4. **npm publish** — `npm publish --access public`, git tag `v1.0.0`.

## Post-v1.0 Backlog

- Authentication scheme extraction (Bearer, API Key, OAuth, JWT)
- Pagination pattern detection (limit/offset/cursor)
- Rate limit documentation extraction
- Schema-inferrer: enum inference, format detection, polymorphism
- Framework-specific HTML parsers (Swagger UI, ReDoc, Slate)
- Deprecated endpoint tracking
- Webhook/AsyncAPI detection
- SDK generation hooks
