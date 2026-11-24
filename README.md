# raghavbaghla.com

The personal website of Raghav Baghla.

Built with Astro, TypeScript, Supabase, and plain CSS on the existing Vercel project.
The opening page is static HTML with CSS animation. A small request loads up to
three published articles for the homepage reveal. Montserrat Regular is
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
   Redeploy: public variables are bundled at build time. Studio uses the public credentials. Legacy `NEXT_PUBLIC_SUPABASE_*` public settings are accepted.
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
  post URLs. Drafts and demo posts stay private.
- The Open studio link appears at the bottom of the homepage. Database owner
  membership controls editing and publishing.
- To enable **Delete article** for saved drafts and published articles, apply
  `supabase/migrations/202611220002_delete_article.sql` after the reader interaction
  migration. Deletion removes the draft, public page, likes, and comments. Uploaded
  images remain in private storage.
- Published articles use a responsive journal layout and show “Written by Raghav
  Baghla” below the title. Cover images also appear in the writing index.

## Reader interactions

Run `supabase/migrations/202611220001_article_engagement.sql` once after the editor
migrations, before deploying the reader interaction controls. It adds separate
`rb_post_likes` and `rb_comments` tables and bounded RPC functions, without changing
the existing editor permissions or legacy `posts`, `comments`, or `likes` tables.

- Visitors can like/unlike and submit a name and comment without signing in.
  Likes are unique per browser identifier, stored only after an interaction in
  `localStorage` as `rb-reader-id`; this is not a verified person count. Blocking or
  clearing browser storage resets that identity. No visitor identifiers are public.
- Comments start pending. In the studio, open a published article and use
  **Article comments** below the editor: **Approve** publishes a comment; **Hide**
  makes it private again. Reviews load 100 at a time with previous/next controls
  and prioritize pending comments.
  Public comments load 20 at a time and render names and bodies as plain text.
- Comments have 60-character names, 2,000-character bodies, a one-minute cooldown,
  at most five pending comments and ten submissions per hour per browser identifier.
  These limits and moderation reduce casual spam, but a determined visitor can
  rotate identifiers; a challenge service would be needed for stronger bot control.
- Unpublishing hides likes/comments and blocks new interactions, preserving their
  history for republishing. Deleting a draft in trusted database administration
  also deletes its interactions.
- Sharing includes WhatsApp, Facebook, Telegram, LinkedIn, X, email, Copy link,
  and the device share menu when supported. Instagram sharing uses Copy link or
  an available device share target; the website does not post to social accounts.
  Shared previews include the article title, summary, author, and optional cover.
- For isolated browser QA, run `node tests/fixtures/supabase.ts`, then
  `node tests/fixtures/seed-engagement.ts`. Start Astro on port 4323 with process-only
  `PUBLIC_SUPABASE_URL=http://127.0.0.1:4322` and
  `PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-test-only`, and run
  `node tests/fixtures/proxy.ts`. Visit port 4322. Never deploy fixture settings.

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

## The Afterthoughts and Studio analytics

Apply `supabase/migrations/202611230001_readership.sql` after the existing migrations, then deploy the Astro app using its existing Vercel configuration. The migration uses the existing Studio owner allowlist and public Supabase credentials.

Readers can choose **Follow The Afterthoughts** on the writing archive or a post in that topic. They enter an email address after opening the follow control, confirm it, and receive a notification when a new post is published in The Afterthoughts. Each notification includes an unfollow link. Studio shows the total number of confirmed followers.

To enable email delivery:

1. Apply the SQL migrations in filename order through `202611240004_afterthoughts_topic_follow.sql`. Studio publishes to The Afterthoughts, the site's current writing topic.
2. Verify your sending domain in [Resend](https://resend.com/docs/dashboard/domains/introduction) and create a sending API key.
3. Set the production Vercel environment variables SUPABASE_SECRET_KEY, RESEND_API_KEY, NEWSLETTER_FROM (an address on the verified domain), and CRON_SECRET (a long random value). Keep these out of client bundles and Git.
4. Deploy. Subscribe with an inbox you control, confirm the link, and verify that Studio counts it. To verify article delivery before going live, publish a test article in a separate environment with a separate database and mailing list.

The first publication queues a message for readers who already confirmed a follow for the post's topic. Studio starts sending after publication, and the daily Vercel cron processes remaining deliveries and retries failures. Existing posts, edits, and repeat publications do not start another send. Unpublishing cancels pending notifications. The queue attempts a delivery up to seven times. Check Vercel logs and Resend delivery activity when investigating failures.

### Studio analytics dashboard

Open **Studio → Analytics** after signing in as an allowlisted owner. The five sections share a UTC reporting period. Use the 7-, 30-, or 90-day presets, or apply a custom range of up to 365 days. Overview compares with the preceding equal number of calendar days. A range ending today includes the partial current day. Week and month charts include only the selected portion of each calendar bucket. Each table has a CSV export. The article export includes every page of the current search in its selected order.

| Section | Reports |
| --- | --- |
| Overview | Views, unique browsers, average active time, good-read rate, confirmations, likes received and comments submitted. Day, week and month trends. Pending comments open the existing article moderator. The five-minute active-browser count refreshes every 45 seconds while Overview is visible. |
| Content | Search and sort articles, including published articles with zero visits. Compare the percentage reaching 25/50/75/90/100% and attributed confirmations. Rank the top 12 pages by total or average active time. |
| Audience | Country, device and browser show page views. New and returning count distinct browsers. A returning browser had a recorded visit before the period began. |
| Sources | Direct, search, social, newsletter and other traffic. Referring hosts and configured campaigns show the top 50. Outbound and all-article-link rankings show the top 100. Link position distinguishes multiple links to one host within an article. |
| Notifications | Follow measured article visits through follow requests and confirmations, with conversions from the previous stage and from the article view. Inspect provider-accepted notifications, queued messages, exhausted attempts and confirmed followers. |

### Measurement and privacy

- Views count loads of the homepage, writing archive and public articles. A random browser-local ID estimates unique visitors. Each bucket and the full period count distinct IDs independently. Clearing storage or using another browser can create another ID.
- Active time pauses on blur, while hidden, or after one minute without interaction. Each visit records up to four hours. Good-read rate uses article views as its denominator and requires 90% article scroll plus 30 active seconds. Drop-off reflects the furthest measured position, including short articles that fit on screen.
- Global Privacy Control and Do Not Track suppress browser analytics and signup attribution. The measurement endpoint also checks the corresponding HTTP headers. Subscribing, liking and commenting remain available. Operational totals can include those deliberate actions.
- The server reads the country code supplied by Vercel and reduces the user agent to a device class and browser family. Analytics stores neither raw IP addresses nor user-agent strings. Missing information appears as **Unknown**. The existing signup abuse limit uses a separate keyed hash of the sender address. The private email system retains the addresses it needs to send requested messages.
- Referrers use DNS hostnames. Destinations use a host or a generic email-link label, plus link position for newly measured clicks. Paths, queries, fragments, literal IPs and email-link recipients are excluded. The upgrade also reduces existing stored destinations to this format. Back up the database before applying it if you need the original records.
- Use `utm_medium=newsletter` and `utm_campaign=afterthoughts` for article newsletter links. Outgoing article emails add both automatically. For another campaign, set the optional server-side Vercel variable `ANALYTICS_CAMPAIGNS` to a comma-separated list of approved lowercase labels, for example `winter-reading,book-club`. Use 1–48 characters, beginning with a letter, with letters, digits, underscores or hyphens thereafter. Unrecognized campaign names are discarded. Recognized media select the channel even when a mail app supplies no referrer.
- A new subscriber is counted on confirmation day. Article attribution uses the originating article visit if the signup request arrives within 24 hours of its start. A private pending subscription temporarily references the visit and releases that reference on confirmation. Each visit counts once at each funnel stage. A later confirmation can update an earlier visit cohort. Unattributed confirmations count toward the overall subscriber metric.
- Historical depths, reading times and visits support retrospective reporting. New audience labels, campaigns, active presence and funnel attribution start at rollout. Historical likes, confirmations and sends can be reconstructed only from rows still present at migration time. Daily counts preserve new likes received, confirmations and accepted sends across subsequent unlikes or unsubscribes. Comments count submissions across moderation states. Inbox delivery receipts are unavailable.

### Apply and deploy on the existing project

1. Back up the target Supabase database. In its SQL Editor, confirm that the editor, engagement, deletion, readership and email migrations through `202611240001_email_subscriptions.sql` have already been applied. For a new database, apply the files in `supabase/migrations/` once each in ascending filename order.
2. For an existing installation at the email migration, run `supabase/migrations/202611240002_studio_analytics.sql`, then `supabase/migrations/202611240003_article_link_report.sql`, once each. Both are transactional. Run `supabase/tests/analytics-access.sql` in a separate SQL Editor query. It checks anonymous, non-owner and owner reads and rolls back its fixtures.
3. In Vercel's **raghavbaghla-com → Settings → Environment Variables**, verify `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the **server-only** `SUPABASE_SECRET_KEY` for Production. Full measurements use the existing server credential. A deployment with only the public key retains basic readership tracking. Keep the existing email and cron settings. Add `ANALYTICS_CAMPAIGNS` if needed.
4. With Node 24, run `npm ci`, `npm run check`, `npm test`, and `npm run build`. Merge the integrated dashboard feature branch into `main` and push `main` to trigger the existing Vercel Git deployment. Keep the repository's Astro adapter, project output settings, domains and cron configuration.
5. After deployment, open a public article in a browser with tracking enabled. Then sign in at `/studio/`, open Analytics and check today's views and active browsers. Use an opted-out browser to verify that it sends no readership requests. Run signup and send tests against a separate mailing list and database.

### Preview with sample data

The sample runs entirely on loopback and uses an in-memory database. It creates four published articles, 75 days of readership, engagement, email counts and a pending comment. Restarting the fixture resets it. Run these commands from the repository in three separate PowerShell windows.

1. Start the seeded Supabase fixture.

   ```powershell
   node tests/fixtures/supabase.ts --analytics
   ```

2. Start Astro with process-local fixture settings.

   ```powershell
   $env:PUBLIC_SUPABASE_URL='http://127.0.0.1:4322'
   $env:PUBLIC_SUPABASE_PUBLISHABLE_KEY='local-test-only'
   $env:SUPABASE_SECRET_KEY='fixture-server-only'
   $env:RESEND_API_KEY='fixture-disabled'
   $env:NEWSLETTER_FROM=''
   npm.cmd run dev -- --port 4323 --ignore-lock
   ```

3. Run `node tests/fixtures/proxy.ts`. Visit `http://127.0.0.1:4322/studio/`, sign in with `owner@example.invalid` and `qa-only`, and open Analytics. The narrow-layout preview is at `http://127.0.0.1:4322/qa/mobile`. Stop each process with Ctrl+C.

### Implementation files

| Area | File paths |
| --- | --- |
| Schema, aggregate queries and grants | `supabase/migrations/202611240002_studio_analytics.sql`, `supabase/migrations/202611240003_article_link_report.sql` |
| Collection and privacy | `src/scripts/readership.ts`, `src/pages/api/readership.ts`, `src/lib/readership.ts` |
| Newsletter attribution | `src/pages/api/subscribe.ts`, `src/pages/subscription.astro`, `src/lib/email-subscriptions.ts` |
| Studio shell and presentation | `src/pages/studio.astro`, `src/components/StudioAnalytics.astro`, `src/styles/analytics.css`, `src/styles/studio.css` |
| Reports and moderation navigation | `src/scripts/studio-analytics.ts`, `src/scripts/analytics-charts.ts`, `src/scripts/analytics-content.ts`, `src/lib/analytics-report.ts`, `src/scripts/studio.ts` |
| Tests and access checks | `tests/analytics-database.test.ts`, `tests/readership-privacy.test.ts`, `tests/analytics-report.test.ts`, `supabase/tests/analytics-access.sql` |
| Local preview | `tests/fixtures/seed-analytics.sql`, `tests/fixtures/analytics-db.ts`, `tests/fixtures/supabase.ts`, `tests/fixtures/proxy.ts` |

Possible follow-ups include comparing subscription conversion by campaign, adding delivery and bounce counts from authenticated provider webhooks, or sending the owner a weekly readership summary.
