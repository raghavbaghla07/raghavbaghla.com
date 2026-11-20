# raghavbaghla.com

The personal website of Raghav Baghla.

Built with Astro, TypeScript, Supabase, and plain CSS on the existing Vercel project.
The opening page is static HTML with CSS animation. A small delayed request reveals
the Writing link only after a post has been published. Montserrat Regular is
self-hosted, with only its Latin subset bundled and no external font requests.
“Hii” appears once, then disappears before the smaller name introduction appears
in the same centered position. Reduced-motion preferences show the name immediately.

## Development

Use Node.js 24 LTS.

```sh
npm install
npm run dev
```

## Production

```sh
npm run build
npm run preview
```

Vercel builds the site with `@astrojs/vercel`. The introduction and `/studio/` shell
are static; `/writing/`, individual posts, and published images render on demand.
Push to `main` to deploy the existing `raghavbaghla-com` project. Do not override
the output directory to `dist`: Vercel uses the adapter's `.vercel/output` bundle.

## Connect your private studio

1. Reuse your existing Supabase project, or create one in your own account.
2. Run `supabase/migrations/202611200001_private_editor.sql` **once** in the SQL
   Editor. It creates new `rb_` tables and a private `rb-studio-images` bucket;
   it does not remove or migrate legacy content. Back up an existing project first.
   Then run `202611200002_article_editor.sql` once to add versioned article JSON
   and its owner-only save function. This upgrade preserves existing plain-text rows.
3. In Authentication > Users, create your own confirmed email/password account.
   Choose the password yourself in the Supabase dashboard. Copy its user UUID.
4. Provision only that UUID as owner through the SQL Editor:

   ```sql
   insert into public.rb_studio_owners (user_id)
   values ('YOUR_AUTH_USER_UUID');
   ```

5. Disable public user signups. Set Auth's Site URL to `https://raghavbaghla.com`
   and allowed redirect URLs to `https://raghavbaghla.com/studio/**` and
   `http://127.0.0.1:4321/studio/**` for local testing. Configure SMTP for reliable
   password-recovery email delivery. Reset emails use a cross-device recovery flow.
6. Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Vercel's
   production environment and to an ignored local `.env` (see `.env.example`).
   Redeploy: public variables are bundled at build time. No service-role or secret
   key is required. Legacy `NEXT_PUBLIC_SUPABASE_*` public settings are accepted.
7. Open `/studio/`, sign in with your existing password or request an emailed
   sign-in link, save a draft, preview it, and publish when ready. Email link login
   is restricted to existing accounts and still requires owner membership.
   Sign out and verify that drafts and their images are inaccessible publicly.
   `supabase/tests/access-check.sql` provides a rollback-only permission check.

The studio shell is publicly addressable, like any login page. Private data and
mutations are protected by Supabase Auth and database/storage row-level security,
not by hiding the URL. A signed-in account without owner membership cannot edit.
Owner membership can only be provisioned through trusted database administration.

## Writing workflow

- `/studio/`: visual article editor with headings, bold/italic/underline/strike,
  highlight, lists and nesting, quotes, links, inline code, code blocks, tables,
  dividers, undo/redo, summary/tags, word counts and reading time. Use up to twenty
  JPEG/PNG/WebP images (8 MB each before processing), alt text, inline captions,
  and a cover. Images are resized to at most 2000px and WebP.
- The article library has search and Draft/Published filters. Focus hides secondary
  panels; the formatting toolbar and publishing actions stay within reach.
- Autosave waits 1.8 seconds after edits and saves privately to Supabase. Manual
  Save draft and Ctrl/Cmd+S flush the same serialized queue. Conflicts pause
  autosave and preserve working content; reopen the draft to load the newer version.
  Unsaved changes show a warning before leaving. Draft text
  is not stored in browser storage. Sessions use session storage on that tab;
  use Copy text or Download backup before closing if you cannot save. Recovery
  JSON exports preserve unsaved content even when it exceeds save limits, and
  include image references; original image binaries require a separate download.
  Two-tab revision conflicts
  keep your local edits intact rather than overwriting a newer saved version.
  Opening another article resets undo history. Article limits are 100,000 plain
  text characters, 1 MB serialized data, 10,000 nodes and 32 levels of nesting;
  exceeding them blocks saving instead of silently shortening work.
- Saving edits to a published post leaves the public snapshot unchanged.
  **Update post** publishes the new snapshot. Its existing URL is preserved.
- **Unpublish** removes the public snapshot and retains the saved private draft.
  Attached images become private again unless another published post uses them.
  Previously delivered copies and still-valid owner preview links cannot be recalled.
- Removing an image detaches it; original uploaded files remain in private Storage.
  Back them up and remove unused files manually after checking published references.
- Legacy plain-text articles retain literal text and attachments. Editing converts
  them to document paragraphs; opening alone changes no saved or published content.
  Preview and public pages use the same bounded renderer, escaped text and safe
  link/image handling. Saved HTML is never rendered directly.
- `/writing/` lists up to the latest 100 published posts, with permanent individual
  post URLs. No drafts, demo posts, or signup pages are published.

## Verification and backups

```sh
npm run check
npm test
npm run build
```

The database suite executes the actual migration in PGlite/PostgreSQL with owner,
nonowner, and anonymous roles. It checks RLS, storage policy guards, draft/published
separation, validation, and revision conflicts. It does not replace a real Supabase
Auth/Storage smoke test after configuration.

Export the PostgreSQL database and download Storage files separately on a regular
schedule. Database backups do not include image binaries. Keep both outside the
Supabase project, retain migrations in Git, and test restoring to a separate project.
Monitor your provider's storage/traffic limits and account recovery settings.

## Website brief

- Introduce Raghav Baghla, opening with “Hii,” followed by “I am Raghav Baghla.”
- Share daily learnings and book notes.
- Showcase creative ad copy and artwork.
- Support book recommendations and affiliate links.
- Use a premium black background with white or off-white text.

The public footer includes the supplied LinkedIn, Instagram, YouTube, and contact
email links. The editor remains unavailable until Supabase is connected; no demo
login or client-side authorization bypass is provided.
