# Raghav Baghla — creative portfolio

Next.js App Router, TypeScript, Tailwind CSS, Tiptap, Supabase PostgreSQL/Auth/Storage. Designed for the existing Vercel deployment with GoDaddy registration and Cloudflare DNS.

## Local preview

Run `npm install` then `npm run dev` and open http://localhost:3000.

The homepage includes clearly labelled illustrative concepts until Supabase is configured. `/studio` opens a local editor; text drafts can be saved to this browser and previewed. Local drafts are not published, shared across devices, or backed up. Media uploads and live engagement require the backend. Once Supabase is configured, the site shows only your actual published posts, including an empty state before your first publication.

## Connect Supabase

1. Create a Supabase project in a region close to your audience.
2. Run `supabase/schema.sql`, then `supabase/002-guest-interactions.sql` and `supabase/003-free-media-storage.sql`, once each in that new project's SQL Editor. Keep these migrations in Git; add new files for future changes rather than rerunning them.
3. In Authentication > Users, create your owner account with an email/password. Use a confirmed email. Copy that user's UUID, then run the `insert into public.admins` statement at the end of the schema with your UUID. Only this membership grants publishing permissions; signing up alone does not.
4. Enable email/password login for the owner. Disable public signups after creating the owner account. Visitors need no accounts or login. Set Site URL to `https://raghavbaghla.com`.
5. Configure SMTP if you need owner password recovery emails. Guest comments are limited to five per visitor/IP fingerprint per hour and always require approval; all guest mutations are limited to sixty per IP fingerprint per hour.
6. Copy `.env.example` to `.env.local`. Fill in the project URL, publishable key, and server-only `SUPABASE_SECRET_KEY`. This secret key is used only by the validated guest-interaction API. Never put it in any `NEXT_PUBLIC_` variable or commit it. Add the same values to Vercel's environment settings and redeploy.

Supabase RLS enforces private drafts and owner-only publishing/moderation. Guest database mutations are accessible only to the server role through controlled API routes with validation, same-origin checks, signed HTTP-only visitor cookies, and database rate limiting. IP fingerprints are hashed and rate-limit events expire after one day. Clearing cookies can allow another like; this is a portfolio reaction feature, not an election-grade vote system. Visitor names and approved comments are public; visitor IDs and fingerprints are not.

## Free media storage

Run `supabase/003-free-media-storage.sql` to create the `portfolio-media` bucket. Only the owner can upload or delete files. Media URLs are public, including assets attached to private drafts; upload only material you intend to make public.

Files travel directly from your browser to Supabase Storage, avoiding Vercel function upload limits. Supported formats: JPG, PNG, WebP, PDF, DOCX and TXT, up to 20 MB each. Images are resized to at most 1800 px and converted to WebP when smaller. Long browser cache lifetimes reduce repeat downloads; no paid image transformation service is used.

Stay on Supabase Free: currently 1 GB file storage and separate 5 GB cached / 5 GB uncached monthly egress allowances. Exceeding free quotas can restrict service; the Free plan does not automatically bill for overages. Provider plans can change, so this cannot guarantee free hosting forever. See [Supabase cost controls](https://supabase.com/docs/guides/platform/cost-control) and [storage pricing](https://supabase.com/docs/guides/storage/pricing). Cloudflare remains your DNS provider; no R2 subscription or media subdomain is needed.

Removing an attachment or deleting a post leaves its files in storage. Delete unused files in the Supabase dashboard, and keep originals backed up elsewhere.

## Daily publishing

- Go to `/studio`, sign in, create a new idea, and add title, excerpt, category, and content.
- Add a cover, inline images, and optional attachments. Use only content you have permission to publish; anonymizing a brand does not by itself grant permission.
- Preview, save a private draft, or publish. Published posts have individual shareable URLs and Open Graph metadata. Changing a published slug changes its URL; keep slugs stable to preserve shared links.
- A published post's "Save & unpublish" button intentionally removes it from public view. Use "Update post" to save while keeping it published.
- Visitors can view, like, share, and submit comments without registering or signing in. Review pending comments in the studio. Only the portfolio owner needs a login.

Set `NEXT_PUBLIC_CONTACT_EMAIL` only after confirming the mailbox exists. Recommended: `hello@raghavbaghla.com`. Your supplied LinkedIn URL is included.

## Long-term operation

Back up PostgreSQL and media files separately and test restoration. Supabase database backups do not include the actual media files. Monitor free-plan limits and inactivity pausing before relying on the free plan for a permanent live site. Keep project ownership, domain, Vercel, Supabase, and Cloudflare accounts under your control. Content is stored as Tiptap JSON plus ordinary PostgreSQL records; media files use Supabase Storage.

## Checks and deployment

Run `npx tsc --noEmit` and `npm run build`.

Push to the branch linked to your existing Vercel project after configuring environments. The domain and nameservers need no changes for the website itself; Supabase Storage needs the bucket migration. No credentials, commits, pushes, or production deployment are created automatically by the local preview.
