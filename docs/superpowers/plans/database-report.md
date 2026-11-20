# Database implementation report

Implemented Task 1 contracts in the transactional migration, plus a rollback-only
Supabase SQL editor access check. No legacy tables or policies are removed.

Verification: `node --test tests/database.test.ts` passed; the current complete
suite `node --test tests/*.test.ts` passed 5/5. `npm test -- --run` could not run
because the project had no test script at the time; the explicit Node command ran
all existing test files instead. The database test also executes access-check.sql.

The test first failed because the migration did not exist. Once implemented,
the hostile legacy permissive Storage policy fixture produced a real failed
permission assertion. Adding restrictive bucket policies made that regression
pass. Assertions cover real PostgreSQL role grants/RLS, owner provisioning,
anonymous/nonowner RPC refusal, private drafts and private images, public snapshot
text/images, revision conflicts, invalid/oversized image and content inputs,
stable slugs/first publication timestamps on updates, direct-table write refusal,
Storage prefix enforcement, overwrite refusal and unpublishing visibility.

Security assumptions and limitations:

- Deployment must provision owners only via trusted SQL administration. There is
  no API grant to change membership; table owners/superusers remain trusted.
- Supabase Auth supplies a verified JWT subject. Tests simulate auth.uid() through
  request.jwt.claim.sub and switch to real anon/authenticated PostgreSQL roles.
- Storage enforces the private bucket's 8 MB MIME configuration in its service;
  PGlite checks configuration and object RLS, not binary MIME sniffing or HTTP.
- Restrictive guards protect this bucket even when existing permissive policies
  allow all objects; policies for unrelated buckets are left unchanged.
- RPCs use SECURITY DEFINER with empty search_path, qualified app objects and
  explicit owner guards. Advisory transaction locks serialize first-insert races;
  row locks and revision checks protect saved snapshots. PGlite's single local
  connection does not simulate concurrent network clients.
- Saving images validates shape, owner UUID paths, extensions, length and duplicate
  paths; physical object existence is deliberately not required. Deleting a
  published image as owner can break that public image and remains owner authority.
- Public readers receive only rb_posts snapshots. Anonymous storage reads require
  a published image path; the media server must use the anonymous key, not a service
  role. Cached responses already delivered cannot be recalled by unpublishing.
- No connected production Supabase project, actual owner account or HTTP Storage
  upload/download has been tested in this task.

Ruling: run the shared test suite directly with Node because no npm test script
existed during verification. Root owns package scripts and commits.
