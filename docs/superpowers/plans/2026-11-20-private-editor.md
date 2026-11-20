# Private Editor Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Give Raghav an owner-only writing studio with private drafts and public posts.

**Architecture:** Astro serves a static introduction and studio shell, with dynamic
public post pages on Vercel. Supabase Auth, RLS, private Storage, and atomic database
functions enforce the owner/public boundary. Published snapshots stay separate from drafts.

**Tech Stack:** Astro, TypeScript, Montserrat, Supabase JS, Vercel adapter, PGlite tests.

**Spec:** `docs/superpowers/specs/2026-11-20-private-editor-design.md`

## Global Constraints

- Owner-only saves/uploads/publishing enforced in Postgres; no signup UI or secret browser keys.
- Preserve the opening animation and existing domain.
- New tables use rb_ prefixes and never modify legacy data.
- Save never changes the published snapshot; revision conflicts never silently overwrite.
- Private draft images must not be readable anonymously.

## Review Focus

- Anonymous/nonowner API calls must fail, including storage operations.
- Editing a published draft must preserve the old text/images publicly until republished.
- Multiple tabs must show conflicts without discarding local edits.
- Auth expiry, failed uploads/saves, and unavailable configuration must be visible and fail closed.
- User text must render escaped; unpublished or unknown URLs must return 404.

### Task 1: Database contracts and security

Files: `supabase/migrations/202611200001_private_editor.sql`, `tests/database.test.ts`.
Interfaces: rb_studio_owners(user_id); rb_drafts(id,title,body,images,revision,created_at,updated_at);
rb_posts(id,slug,title,body,images,published_at,updated_at). Images are {path,alt} arrays.
RPCs: rb_is_owner(), rb_save_draft(p_id uuid,p_title text,p_body text,p_images jsonb,
p_expected_revision int) returns rb_drafts; rb_publish_draft(p_id uuid,p_expected_revision int)
returns rb_posts; rb_unpublish_post(p_id uuid) returns void. Auth.uid identifies owner.

- [x] Write and run failing permission, snapshot-isolation, validation, and conflict tests.
- [x] Implement schema, immutable owner provisioning, guarded RPCs and private storage policies.
- [x] Run database tests and commit.

### Task 2: Owner studio and safe content helpers

Files: `src/lib/studio-content.ts`, `src/lib/supabase.ts`, `src/pages/studio.astro`,
`src/scripts/studio.ts`, `src/styles/studio.css`, `tests/content.test.ts`.
Consumes Task 1 contracts. Produces sign-in, verified owner composer, save, preview,
image upload/alt text, publish, unpublish, and private draft list. Auth stays in session
storage; no drafts stored locally. Safe rendering uses DOM textContent and Astro escaping.

- [x] Write and run validation/preview helper tests before implementation.
- [x] Install packages, implement UI/client, and fail closed without configuration.
- [x] Verify build, types and tests; commit.

### Task 3: Public writing and setup

Files: `src/pages/writing/index.astro`, `src/pages/writing/[slug].astro`,
`src/pages/media/[...path].ts`, `src/layouts/WritingLayout.astro`, Astro/Vercel config,
`.env.example`, `README.md`, and `supabase/tests/access-check.sql`.
Consumes published rb_posts only. Media route proxies downloads through anonymous RLS;
draft previews use owner-signed storage URLs. No service key.

- [x] Implement public routes, empty/error/404 states, image route, setup and backup guidance.
- [x] Run full suite, production build, type check, browser QA and independent security review.
- [ ] Deploy to existing Vercel project and verify live configuration; owner email-link handoff pending.

## Progress

- Stack and functionality approved in conversation; working in the existing checkout to preserve the running preview.
- Supabase migration applied with explicit approval; existing owner provisioned and studio redirect configured. Anonymous live API denies owner access and reveals no drafts. Public signups are disabled.
