import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, validateImageFile, excerpt, readableError } from '../src/lib/studio-content.ts';

test('draft validation permits unfinished drafts but rejects empty and oversized content', () => {
  assert.equal(validateDraft({title:'',body:'A thought',images:[]}), null);
  assert.match(validateDraft({title:' ',body:'',images:[]})!, /something/i);
  assert.match(validateDraft({title:'a'.repeat(161),body:'ok',images:[]})!, /160/);
  assert.match(validateDraft({title:'ok',body:'a'.repeat(30001),images:[]})!, /30,000/);
  assert.match(validateDraft({title:'ok',body:'ok',images:Array.from({length:5},()=>({path:'a/b.webp',alt:''}))})!, /four/i);
});

test('image validation rejects active content and oversize images', () => {
  assert.equal(validateImageFile({type:'image/png',size:1024}), null);
  assert.match(validateImageFile({type:'image/svg+xml',size:1024})!, /JPEG/);
  assert.match(validateImageFile({type:'image/webp',size:8*1024*1024+1})!, /8 MB/);
  assert.match(validateImageFile({type:'image/png',size:0})!, /empty/i);
});

test('excerpt collapses whitespace and truncates without accepting markup as HTML', () => {
  assert.equal(excerpt('  Hello\n\nworld  '), 'Hello world');
  assert.equal(excerpt('123456789', 6), '12345…');
  assert.equal(excerpt('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
});

test('save conflicts and expired sessions have actionable messages', () => {
  assert.match(readableError({message:'revision conflict'}), /another tab/i);
  assert.match(readableError({message:'JWT expired'}), /sign in/i);
  assert.match(readableError({message:'something broke'}), /something broke/);
});
