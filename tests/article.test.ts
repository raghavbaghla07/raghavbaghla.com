import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyToDoc, articleText, normalizeArticle, renderArticle, safeLink, articleStats } from '../src/lib/article.ts';

const images = [{ path: 'owner/photo.webp', alt: 'A photo' }];
test('legacy text preserves literal markup and paragraphs', () => {
  const doc = legacyToDoc('Hello <script>\nworld\n\nNext');
  assert.equal(articleText(doc), 'Hello <script>\nworld\n\nNext');
  const html = renderArticle(normalizeArticle(null, 'Hello <script>\nworld\n\nNext', []), [], () => '');
  assert.match(html, /Hello &lt;script&gt;<br>world/);
  assert.equal(articleStats('one two\nthree').words, 3);
  assert.equal(articleStats('').minutes, 0);
});
test('known structures and marks round trip with allowlisted attributes', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2, onclick: 'bad' }, content: [{ type: 'text', text: 'Title', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com/?a="b"' } }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
    { type: 'codeBlock', attrs: { language: 'js" onclick="bad' }, content: [{ type: 'text', text: '<script>alert(1)</script>' }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }] }] }] },
    { type: 'articleImage', attrs: { path: images[0].path, alt: '" onerror="x', caption: '<caption>' } },
  ] };
  const article = normalizeArticle({ version: 1, doc, summary: ' Summary ', tags: ['One', 'One', 'Two'], cover: images[0].path }, '', images);
  const html = renderArticle(article, images, path => '/media/' + path);
  assert.match(html, /<h2>/);
  assert.match(html, /<strong>/);
  assert.match(html, /<ul><li><p>item/);
  assert.match(html, /<table>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /alt="&quot; onerror=&quot;x"/);
  assert.match(html, /<figcaption>&lt;caption&gt;<\/figcaption>/);
  assert.equal(article.summary, 'Summary');
  assert.deepEqual(article.tags, ['One', 'Two']);
  assert.equal(JSON.stringify(article).includes('onclick'), false);
});
test('unsafe links, external images, raw HTML and hostile objects fail safely', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'java\nscript:x', 'file:///etc/passwd', '/relative']) assert.equal(safeLink(url), null);
  assert.equal(safeLink('mailto:hello@example.com'), 'mailto:hello@example.com');
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '<b>safe</b>', marks: [{ type: 'link', attrs: { href: 'javascript:x' } }, { type: 'rawHTML', attrs: { html: '<script>' } }] }] },
    { type: 'rawHTML', attrs: { html: '<script>bad</script>' } },
    { type: 'articleImage', attrs: { path: 'private/other.webp' } },
  ] };
  const article = normalizeArticle({ version: 1, doc, cover: 'private/other.webp' }, '', images);
  const html = renderArticle(article, images, () => 'javascript:x');
  assert.equal(html, '<p>&lt;b&gt;safe&lt;/b&gt;</p>');
  assert.equal(article.cover, null);
  assert.equal(renderArticle(normalizeArticle({ version: 1, doc: { type: 'doc', content: [{ type: 'articleImage', attrs: { path: images[0].path } }] } }, '', images), images, () => 'javascript:x'), '');
});
test('normalization caps metadata, nesting, content size and malformed documents', () => {
  assert.equal(articleText(normalizeArticle('{broken', 'fallback', []).doc), 'fallback');
  assert.equal(articleText(normalizeArticle({ version: 7, doc: { type: 'doc' } }, 'fallback', []).doc), 'fallback');
  const article = normalizeArticle({ version: 1, doc: legacyToDoc('x'), summary: 's'.repeat(500), tags: Array.from({ length: 12 }, (_, i) => String(i).repeat(50)) }, '', []);
  assert.equal(article.summary.length, 320);
  assert.equal(article.tags.length, 8);
  assert.ok(article.tags.every(tag => tag.length <= 40));
  const deep: any = { type: 'doc', content: [] }; let child = deep;
  for (let i = 0; i < 200; i++) { const next = { type: 'blockquote', content: [] }; child.content.push(next); child = next; }
  assert.doesNotThrow(() => renderArticle(normalizeArticle({ version: 1, doc: deep }, '', []), [], () => ''));
  const huge = normalizeArticle({ version: 1, doc: legacyToDoc('x'.repeat(110000)) }, '', []);
  assert.ok(articleText(huge.doc).length <= 100000);
  const cycle: any = { type: 'doc', content: [] }; cycle.content.push(cycle);
  assert.equal(articleText(normalizeArticle({ version: 1, doc: cycle }, 'fallback', []).doc), 'fallback');
});
