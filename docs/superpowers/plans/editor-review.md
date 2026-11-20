# Private editor security and behavior review

Verdict: the reviewed changes address the identified tab-bound recovery verifier and unconditional homepage link. No additional actionable critical or important issue was identified in the scoped follow-up review. The database contracts and public routes otherwise follow the intended owner-only and published-snapshot boundaries in the code reviewed.

## Resolved in code: recovery verifier tied to initiating tab

The original implementation used PKCE with a verifier in tab-specific session storage, preventing recovery in a different tab or device. `src/lib/studio-auth.ts:3-10` now uses the implicit flow, which removes that dependency, while retaining session storage for the resulting session. The email sign-in link also sets `shouldCreateUser: false`. The new SDK request test checks that neither email request sends a PKCE challenge and that sign-in requests do not create users. This verifies request construction; an actual emailed link, redirect, session establishment, and password update still require end-to-end verification with the configured project and an owner account.

## Other observations

- The Supabase helper reads only variables named `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not service-role or secret-key fallback variables. It does not validate the value, so deployment configuration must supply a publishable key as documented.
- The RPC guards, owner policies, restrictive storage policies, and separate published rows were inspected for bypasses and snapshot leaks; no additional actionable critical or important issue was found in those paths. The public media client is configured without a persisted user session.
- Saved revision conflicts are rejected in the database and the current editor text is retained on error. Signing out on session loss hides the workspace while retaining its in-memory contents for reauthentication.
- Public dynamic routes use the anonymous client, return 404 for unknown posts, and avoid caching snapshots; the Vercel adapter is configured for server output. Production behavior still needs deployment verification.
- The homepage link now starts hidden and appears after a successful public post-existence check; the endpoint reads only published post IDs and fails closed. A browser with JavaScript disabled or a failed status request will not show the link.
- The parent reports the migration was applied to the existing project after user approval, and anonymous HTTP checks returned an empty draft list and `rb_is_owner=false`. This is limited live evidence; authenticated owner, nonowner, storage, email recovery, and deployed public routes still need end-to-end verification.

The parent reported `npm run check` (zero diagnostics), `npm test` (6/6), and `npm run build` passing after the changes. These commands were not rerun for this review.
