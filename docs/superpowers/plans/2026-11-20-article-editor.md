# Article Editor Implementation Plan

> Use the implementation and review skills to execute these tasks without further design questions; the user explicitly instructed implementation of the approved design.

**Goal:** Ship the approved visual article editor to the existing website.
**Architecture:** Tiptap edits versioned article JSON. Supabase retains plain text and structured snapshots, with owner-only revision-checked saves. A shared allowlist renderer serves preview and public articles.
**Tech Stack:** Existing Astro/TypeScript/Supabase/Vercel plus Tiptap core extensions.
**Spec:** docs/superpowers/specs/2026-11-20-article-editor-design.md

## Global constraints

Preserve owner access, old drafts, stable post URLs and explicit publishing. Never render arbitrary saved HTML. No private browser draft persistence. Keep short commits. Article text <=100,000 characters; JSON <=1 MB; <=20 images, 8 MB each, processed WebP <=2000px. No production demo content.

## Interfaces

`ArticleContent = {version:1,doc:ArticleNode,summary:string,tags:string[],cover:string|null}`.
`ArticleNode = {type:string,text?:string,attrs?:Record<string,unknown>,marks?:{type:string,attrs?:Record<string,unknown>}[],content?:ArticleNode[]}`.
Draft and PublishedPost gain `article?: ArticleContent|null`. Images retain `{path,alt}`.
New RPC `rb_save_article(p_id uuid,p_title text,p_body text,p_images jsonb,p_article jsonb,p_expected_revision integer)` returns rb_drafts. Existing publish signature stays unchanged and copies article. Legacy save clears article.

## Review focus

- Malformed documents, unsafe URLs, unknown markup, private image references must fail safely.
- Autosave/manual save/publish cannot race, clear edits made during a request, or overwrite a conflicting revision.
- Existing text including literal markup remains literal when converted; public pages remain compatible.
- Nested lists/tables/images survive save/reopen and render the same in preview/public.
- No owner/editor data may enter anonymous pages or production QA content.

### Task 1: Storage

Files: new migration `202611200002_article_editor.sql`, `tests/article-database.test.ts`, local test fixture.
- [ ] Write failing PostgreSQL tests for article RPC, caps, old save clears article, published snapshot, existing permissions/conflicts.
- [ ] Implement additive nullable article columns, owner-only save RPC, updated publishing and legacy limits, preserving storage policy boundaries.
- [ ] Run tests; commit only task files.

### Task 2: Safe document contract

Files: `src/lib/article.ts`, `src/styles/article.css`, `tests/article.test.ts`.
Exports: `normalizeArticle(value:unknown,body:string,images:PostImage[]):ArticleContent`, `legacyToDoc(body:string):ArticleNode`, `articleText(doc:ArticleNode):string`, `renderArticle(article:ArticleContent,images:PostImage[],resolveImage:(path:string)=>string):string`, `articleStats(text:string):{words:number,characters:number,minutes:number}`, `safeLink(value:string):string|null`.
- [ ] Write failing tests for legacy conversion, marks/nesting/tables/code/images, unsafe links/unknown nodes, limits and metadata.
- [ ] Implement bounded normalization and safe escaped rendering; image nodes use type `articleImage` attrs `{path,alt,caption}` and must reference supplied images. Marks: bold,italic,underline,strike,highlight,code,link. Standard Tiptap nodes plus articleImage.
- [ ] Add shared typography; run tests and commit task files.

### Task 3: Studio and public integration

Files: studio page/scripts/styles, content types, public post/list/layout, autosave helper and tests.
- [ ] Write autosave serialization/conflict tests, then implement controller with 1.8s debounce, explicit pause on conflict, no publishing.
- [ ] Install Tiptap; implement formatting/table/link dialogs, image node views, toolbar state and keyboard shortcuts.
- [ ] Build sticky actions/toolbar, draft search/filter, focus/sidebar toggles, metadata, counts and export.
- [ ] Integrate owner-only save RPC, legacy load, signed image preview, shared preview/public renderer, cover/summary/tags.
- [ ] Test full suite, type check/build and browser authoring on disposable local fixture, including narrow screen layout. Commit short coherent changes.

### Task 4: Review and release

- [ ] Independent whole-change review; resolve important findings and run required verification.
- [ ] Apply prepared additive production migration after required action-time confirmation.
- [ ] Merge/push existing main and verify Vercel/live routes, public privacy and owner access; no sample publish in production.

## Progress and decisions

- Design approved by user: “implement the design then”. Existing checkout preserves the user's preview; use a feature branch in place.
- Store document and metadata together in `article`; plain body remains derived readable text.
- Shared-file ownership: storage worker owns migration/tests/fixture; renderer worker owns article library/CSS/tests; primary owns UI/integration and package files. Dependencies above are fixed before workers start.
