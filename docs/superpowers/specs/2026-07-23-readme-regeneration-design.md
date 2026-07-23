# README Regeneration Design

**Date:** 2026-07-23

## Audience and Goal

Regenerate `README.md` as a self-contained Chinese developer guide. A new developer should be able to understand the product, configure the backend, import the mini-program, run tests, and troubleshoot common failures without reading historical implementation plans.

## Source of Truth

README content must be derived from current repository behavior:

- `miniprogram/app.json` for pages and runtime configuration;
- `miniprogram/config/server.ts` for backend settings;
- domain and service files for storage keys, limits, authentication, API paths, image handling, date normalization, and synchronization;
- `package.json` for commands and dependency versions;
- `project.config.json` for WeChat Developer Tools settings;
- current tests for stable behavior contracts.

Historical design and plan documents may provide context but must not override current code.

## Document Structure

1. Project title and concise positioning.
2. Current feature overview.
3. User-facing workflow.
4. Mermaid architecture and data-flow diagram.
5. Technology stack and runtime requirements.
6. Current project structure.
7. Installation and WeChat Developer Tools import.
8. Backend configuration for local and production environments.
9. Authentication and Session Cookie behavior.
10. Main backend API table.
11. Recognition queue, image constraints, and confidence review.
12. Purchase-order and standalone inspection synchronization.
13. Local storage, migration, history merging, and retry behavior.
14. JSON export behavior.
15. Test and typecheck commands.
16. Common troubleshooting cases.
17. Production release and security checklist.

## Configuration Guidance

Document both environments:

- Local development: `http://localhost:7875`.
- Production example: `https://www.binictools.cn:7876`.

Explain that the active value is configured in `miniprogram/config/server.ts`. Do not claim that the current working-tree-only localhost value is the committed repository default.

## Architecture Content

The diagram will show:

```text
WeChat Mini Program
  -> session-authenticated shared backend
     -> recognition proxy / model service
     -> customer-orders quality inspection APIs
     -> database
  -> local storage and saved image files
```

The README must make clear that the mini-program does not store a model API token and does not call the model gateway directly.

## Required Corrections to the Existing README

Remove or replace these obsolete claims:

- single-image-only recognition;
- direct calls to port `8865`;
- client-side `llmApiToken` configuration;
- `inspectionHistory:v1` as the active storage key;
- server upload and cross-device synchronization being unimplemented;
- only two main pages or the previous simplified directory structure.

Add current behavior:

- account login and Session Cookie reuse;
- continuous recognition queue with a maximum of 10 unfinished items;
- JPEG/PNG validation and 600 KB upload limit;
- confidence-based danger/warning review hints;
- purchase pending-task workflow;
- standalone and purchase-order report synchronization;
- server/local history merging and retry;
- date normalization before database synchronization;
- `inspectionHistory:v2` with v1 migration and a 30-record local limit.

## Testing Strategy

Add a source-level README contract test that verifies the regenerated document includes stable current concepts and excludes obsolete configuration instructions. The test should avoid brittle full-text snapshots.

Required positive checks include:

- local and production backend examples;
- Session Cookie authentication;
- recognition queue size 10;
- `inspectionHistory:v2` and 30 records;
- the recognition proxy and standalone inspection endpoint;
- `npm test` and `npm run typecheck`.

Required negative checks include:

- `wx.setStorageSync('llmApiToken'`;
- direct `8865/api/llm/v1/chat/completions` usage;
- statements that synchronization is not implemented.

## Non-goals

- Documenting or modifying the separate backend repository’s installation process.
- Adding screenshots or generated image assets.
- Publishing credentials, real passwords, session values, or model API keys.
- Changing application code, package metadata, or runtime configuration.
- Adding speculative roadmap items.
