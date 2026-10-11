# Raghav Baghla — creative portfolio

Next.js App Router, TypeScript, Tailwind CSS, Tiptap, Supabase PostgreSQL/Auth, and Cloudflare R2. Designed for the existing Vercel deployment with GoDaddy registration and Cloudflare DNS.

## Local preview

Run `npm install` then `npm run dev` and open http://localhost:3000.

The homepage includes clearly labelled illustrative concepts until Supabase is configured. `/studio` opens a local editor; text drafts can be saved to this browser and previewed. Local drafts are not published, shared across devices, or backed up. Media uploads and live engagement require the backend. Once Supabase is configured, the site shows only your actual published posts, including an empty state before your first publication.

## Connect Supabase

1. Create a Supabase project in a region close to your audience.
2. Run `supabase/schema.sql`, then `supabase/002-guest-interactions.sql`, once each in that new project's SQL Editor. Keep these migrations in Git; add new files for future changes rather than rerunning them.
3. In Authentication > Users, create your owner account with an email/password. Use a confirmed email. Copy that user's UUID, then run the `insert into public.admins` statement at the end of the schema with your UUID. Only this membership grants publishing permissions; signing up alone does not.
4. Enable email/password login for the owner. Disable public signups after creating the owner account. Visitors need no accounts or login. Set Site URL to `https://raghavbaghla.com`.
5. Configure SMTP if you need owner password recovery emails. Guest comments are limited to five per visitor/IP fingerprint per hour and always require approval; all guest mutations are limited to sixty per IP fingerprint per hour.
6. Copy `.env.example` to `.env.local`. Fill in the project URL, publishable key, and server-only `SUPABASE_SECRET_KEY`. This secret key is used only by the validated guest-interaction API. Never put it in any `NEXT_PUBLIC_` variable or commit it. Add the same values to Vercel's environment settings and redeploy.

Supabase RLS enforces private drafts and owner-only publishing/moderation. Guest database mutations are accessible only to the server role through controlled API routes with validation, same-origin checks, signed HTTP-only visitor cookies, and database rate limiting. IP fingerprints are hashed and rate-limit events expire after one day. Clearing cookies can allow another like; this is a portfolio reaction feature, not an election-grade vote system. Visitor names and approved comments are public; visitor IDs and fingerprints are not.

## Connect Cloudflare R2

1. Activate R2 in Cloudflare (billing details may be required even when usage is within the free allowance). Create a bucket using Standard storage.
2. Add the custom domain `media.raghavbaghla.com` to that bucket. Published media is public; do not upload confidential files or private client assets, including while drafting. Configure a Cloudflare cache rule for this media hostname and appropriate cache eligibility for your supported public file types. Using Cloudflare for DNS alone does not configure media caching.
3. Apply `cloudflare/r2-cors.json` in the bucket's CORS settings. Add an explicit Vercel preview origin if required. Remove localhost from production CORS if no longer needed.
4. Create an R2 object read/write API token scoped to this bucket. Put its access key ID/secret, Cloudflare account ID, bucket name, and media URL into the server-only variables in `.env.local` and Vercel.
5. Restart the local server or redeploy on Vercel. Sign in at `/studio` and test a cover image, an inline image, and a file attachment.

The server authenticates the owner before issuing a two-minute upload URL. Files travel directly from the browser to R2, avoiding Vercel function body-size limits. Supported uploads: JPG, PNG, WebP, PDF, DOCX, TXT; 20 MB maximum after image processing. Images are resized to at most 1800 px and converted to WebP when that reduces size or downscaling is needed. Inline images can have their alt text edited below the editor. Keep originals outside the website. No paid image transformation service is required.

Removing an attachment/cover or deleting a post does not delete its R2 files. Delete unused objects manually in R2; a future media library can automate this. R2's free allowance is limited; monitor storage and operation usage. The site does not promise unlimited free storage.

## Daily publishing

- Go to `/studio`, sign in, create a new idea, and add title, excerpt, category, and content.
- Add a cover, inline images, and optional attachments. Use only content you have permission to publish; anonymizing a brand does not by itself grant permission.
- Preview, save a private draft, or publish. Published posts have individual shareable URLs and Open Graph metadata. Changing a published slug changes its URL; keep slugs stable to preserve shared links.
- A published post's "Save & unpublish" button intentionally removes it from public view. Use "Update post" to save while keeping it published.
- Visitors can view, like, share, and submit comments without registering or signing in. Review pending comments in the studio. Only the portfolio owner needs a login.

Set `NEXT_PUBLIC_CONTACT_EMAIL` only after confirming the mailbox exists. Recommended: `hello@raghavbaghla.com`. Your supplied LinkedIn URL is included.

## Long-term operation

Back up PostgreSQL and R2 files separately and test restoration. Supabase database backups do not include the actual media files. Monitor free-plan limits and inactivity pausing before relying on the free plan for a permanent live site. Keep project ownership, domain, Vercel, Supabase, and Cloudflare accounts under your control. Content is stored as Tiptap JSON plus ordinary PostgreSQL records; R2 uses the S3-compatible API.

## Checks and deployment

Run `npx tsc --noEmit` and `npm run build`.

Push to the branch linked to your existing Vercel project after configuring environments. The domain and nameservers need no changes for the website itself; R2's media subdomain needs its own setup. No credentials, commits, pushes, or production deployment are created automatically by the local preview.
