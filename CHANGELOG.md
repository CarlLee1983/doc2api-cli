# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] — 2026-03-28

### Added
- Programmatic API usage examples in README
- Security documentation in README (SSRF protection, input validation, file size limits)
- Complete workflow example in README (PDF → OpenAPI end-to-end)
- CHANGELOG.md

## [0.6.0] — 2026-03-28

### Added
- Error code reference in README (E1xxx–E5xxx with descriptions)
- E2E tests for PDF pipeline and assemble → validate flow
- CI build verification step (dist/index.js + dist/lib.js)

### Changed
- HTML generic parser: heading-based page splitting, thead-less table support, code block preservation

## [0.5.0] — 2026-03-28

### Added
- Library entry point (`src/lib.ts`) with all public API exports
- `exports` field in package.json for dual CLI/library usage
- `files` field to control npm package contents
- `engines` field requiring Bun >= 1.0
- `prepublishOnly` script ensuring build before publish
- `repository`, `bugs`, `homepage` npm metadata

## [0.4.0] — 2026-03-28

### Added
- `--version` flag
- `--help` flag (in addition to `help` command)
- CLI flag and exit code tests

### Fixed
- Exit code consistency: validate command now uses exit 1 for errors, exit 4 only for spec validation failure

## [0.3.1] — 2026-03-28

### Added
- Streaming async generator pipeline for memory-efficient processing
- Crawler retry mechanism with exponential backoff
- robots.txt support for crawling
- Checkpoint/resume for interrupted crawls
- Improved SKILL.md with expanded triggers and output examples

### Fixed
- Security hardening and OOM protection

## [0.3.0] — 2026-03

### Added
- Structured `ChunkContent` extraction (endpoint, parameter, response, auth, error_codes)
- Context-aware classification (`contextRefine`) with 3-element sliding window
- Watch mode (`doc2api watch`) with debounced rebuild
- Language detection (CJK/English)

## [0.2.0] — 2026-03

### Added
- HTML source support (single URL, URL list, crawling with depth/page limits)
- Playwright browser fetcher for SPAs (optional dependency)
- SPA detection
- Framework detection and parser system (generic + Readme.com)
- SSRF protection via url-guard (blocks private/internal IPs including CGN)
- HTTP fetcher with 10MB response limit and 30s timeout

### Changed
- Renamed `pdf2api` → `doc2api`

## [0.1.0] — 2026-03

### Added
- PDF text extraction via unpdf
- Table extraction via pdfplumber Python bridge
- Chunk pipeline (heading-based splitting, auto-split at 8000 chars)
- Classify pipeline (rule-based, 6 chunk types with confidence scoring)
- Assemble command (JSON → OpenAPI 3.0.3)
- Validate command (OpenAPI spec validation via @readme/openapi-parser)
- Doctor command (environment dependency check)
- Schema inferrer (JSON values → JSON Schema, depth-limited to 10)
- Structured error codes (E1xxx–E5xxx) with Result<T> pattern
- Input validation (path traversal, flag injection, page range)
- AI Agent skills for Claude Code, Gemini CLI, Cursor, Codex
