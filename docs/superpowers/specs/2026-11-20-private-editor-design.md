# Private website editor

User approved Astro, Supabase, and a custom LinkedIn-inspired composer with private
drafts and website publishing. Keep the Montserrat opening animation unchanged.

## Approach

Use the existing Astro/Vercel site with server-rendered published writing pages.
Supabase Auth signs in the sole owner; Postgres RLS enforces authorization, even
when callers bypass the UI. A custom composer offers title, plain-text body,
images with alt text, saved drafts, preview, publish/update, and unpublish.
Sanity was considered for its ready-made CMS and Payload for extensibility;
the user chose the custom editor and Supabase for a familiar writing experience.

## Data and access

Use new rb_ names to avoid changing any legacy Supabase tables. Private drafts
and published snapshots are separate. Saving changes to a live post never changes
the public copy. Publish copies the saved revision atomically. Revision checks
prevent one tab overwriting another. Only owner UUIDs explicitly provisioned by
SQL may write; signed-in nonowners are rejected. No signup UI and no secret keys
in the browser. Private image storage allows owner access and public access only
to files referenced by published snapshots. Public posts never expose draft fields.

## Experience

`/studio/` presents sign-in, then a draft list and focused dark composer. Saving
is explicit with an unsaved indicator, navigation warning, and export/copy backup.
No browser-local plaintext draft storage. Images: JPEG/PNG/WebP up to 8 MB each,
maximum four per post, resized before upload. Preview renders safe text and images.
`/writing/` lists published posts; `/writing/[slug]/` shows a post. Homepage gets
a quiet writing link after the introduction only once posts exist. Empty writing
page remains honest. Auth and storage fail closed when configuration is absent.

## Deployment and operations

Preserve the existing domain and Vercel project. Home and studio shell are static;
published routes render on demand, using only a publishable Supabase key with RLS.
Document migration, one-owner provisioning, disabled signups, password recovery,
environment configuration, and separate database/media backups. Live owner-login
verification requires a connected project and an owner account; never claim it
passed without those. Never overwrite or delete legacy data automatically.
