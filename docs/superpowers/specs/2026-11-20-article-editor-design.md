# Article editor upgrade

## Intent

Raghav wants the existing private studio to support writing and publishing full
articles, with a visual formatting toolbar and a substantially better UI. He chose
a visual editor over Markdown. Keep the existing website, Montserrat, Supabase
owner identity, private drafts, and explicit publish/update/unpublish workflow.

## Approaches

- **Visual editor (chosen):** Tiptap with structured document data. Formatting is
  visible while writing; requires a safe renderer and a backward-compatible data update.
- **Markdown:** simpler text storage and source editing, but requires formatting
  syntax and was not chosen.

Using Tiptap and the details below are implementation recommendations, not prior
user decisions. No paid editor service or new hosting provider is needed.

## Writing and formatting

- Paragraphs, H2/H3/H4 headings (article title remains the single H1), bold,
  italic, underline, strikethrough, highlight, inline code, and clear formatting.
- Bullet, numbered, and nested lists; blockquotes; horizontal dividers;
  fenced code blocks with language labels; and editable tables with header,
  row/column insertion/removal, and table removal.
- Safe links with insert/edit/remove controls; only HTTP(S) and mailto URLs.
- Undo/redo, familiar keyboard shortcuts, selected/disabled toolbar states, and
  plain-text and formatted paste. No arbitrary HTML, scripts, or external embeds.
- Uploaded images can be inserted between paragraphs, described with alt text,
  captioned, removed, and chosen as the cover. Up to 20 images per article,
  retaining the existing 8 MB upload and 2000px WebP processing limits.
- Title, optional short summary for previews/search metadata, optional tags,
  word/character counts, estimated reading time, and downloadable article backup.

## UI

- A compact header and sticky save/preview/publish actions, a collapsible draft
  sidebar with search and Draft/Published filters, and a centered article canvas.
- Sticky grouped formatting controls with clear labels/tooltips and keyboard focus.
- A readable article font size, generous paragraph spacing, restrained dark
  surfaces, and responsive controls that work on narrow screens.
- Secondary article details and image management in collapsible panels, leaving
  writing space clear. Focus mode hides secondary panels.
- Save state, errors, and publishing status stay visible. Existing confirmations
  and unsaved-navigation warnings remain. Publishing stays an explicit action.

## Persistence, compatibility, and safety

- Add nullable structured article data to drafts and published snapshots and
  retain the plain body as searchable/exportable fallback. Store summary/tags/cover
  in the versioned article document, avoiding duplicate metadata sources.
- Existing plain-text drafts/posts remain readable and convert to paragraphs when
  edited. Opening a draft alone does not migrate or publish it.
- Add an owner-only article-save RPC with revision checking. The publish RPC
  copies the saved structured document atomically alongside the existing body/images.
  Legacy plain-text saves clear structured data so old clients cannot publish stale
  formatting. Preserve existing post URLs and original publication dates.
- The additive SQL migration changes no owner membership or existing content and
  retains all existing RLS/storage boundaries. Increase the attachment cap to 20;
  cap article plain text at 100,000 characters and document JSON at 1 MB.
- Autosave only to Supabase after a pause, serialized with manual saves. It never
  publishes, does not run before owner verification, and stops on a revision conflict.
  Preserve local work on failure; do not store private draft text in browser storage.
- Render only an explicit document schema. Escape text, validate URLs and image
  references, reject unknown nodes/attributes, and resolve images through existing
  private preview/public media access. No raw saved HTML rendering.
- Preview and public article rendering share the same document normalization and
  styling. Public summaries and metadata contain readable text rather than JSON.

## Verification and release

Test document round trips, legacy conversion, unsafe links/markup, images, tables,
limits, revision conflicts, autosave, and draft/public snapshot isolation. Run
database permissions tests, type checks, production build, browser formatting/paste/
preview checks, and desktop/mobile layout checks. Use disposable local fixtures.

Keep short commits. Apply the prepared additive migration to the existing Supabase
project after the required action-time approval, then deploy to the existing Vercel
project and verify live routes. Never publish a sample article to the real website.

## Boundaries and builder decisions

This upgrade covers solo article authoring and publishing. Scheduling, collaboration,
AI writing, newsletters, comments, paid memberships, and arbitrary embeds are separate
features. The builder chooses extension packages, icons, layout measurements,
autosave timing, and component boundaries within this design.
