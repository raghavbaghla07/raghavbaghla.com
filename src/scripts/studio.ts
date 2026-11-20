import { createStudioClient } from '../lib/supabase';
import { validateDraft, validateImageFile, excerpt, readableError } from '../lib/studio-content';
import type { Draft, DraftInput, PostImage, PublishedPost } from '../lib/studio-content';

const client = createStudioClient();
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const authPanel = get('auth-panel');
const workspace = get('workspace');
const title = get<HTMLInputElement>('post-title');
const body = get<HTMLTextAreaElement>('post-body');
const fields = get<HTMLFieldSetElement>('composer-fields');
const notice = get('notice');
const saveStatus = get('save-status');
const preview = get<HTMLDialogElement>('preview-dialog');
const confirmation = get<HTMLDialogElement>('confirm-dialog');
const recovery = get('recovery-panel');
let ownerId = '';
let currentId: string = crypto.randomUUID();
let revision = 0;
let dirty = false;
let busy = false;
let drafts: Draft[] = [];
let published: PublishedPost[] = [];
let images: PostImage[] = [];
const imageUrls = new Map<string, { url: string; expires: number }>();
let recoveryMode = new URLSearchParams(location.search).get('recovery') === '1';

function say(message: string, error = false) {
  notice.textContent = message;
  notice.classList.toggle('error', error);
  notice.setAttribute('role', error ? 'alert' : 'status');
  notice.hidden = false;
}

function setBusy(value: boolean) {
  busy = value;
  fields.disabled = value;
  document.querySelectorAll<HTMLButtonElement>('#workspace button').forEach(button => button.disabled = value);
}

function markDirty() {
  dirty = true;
  saveStatus.textContent = 'Unsaved changes';
  get('character-count').textContent = `${Array.from(body.value).length.toLocaleString()} characters`;
}

function input(): DraftInput {
  return { title: title.value.trim(), body: body.value, images: images.map(image => ({...image})) };
}

function ask(heading: string, description: string, action: string): Promise<boolean> {
  get('confirm-title').textContent = heading;
  get('confirm-description').textContent = description;
  get('confirm-proceed').textContent = action;
  confirmation.showModal();
  return new Promise(resolve => {
    const finish = (result: boolean) => {
      confirmation.close();
      get('confirm-cancel').removeEventListener('click', cancel);
      get('confirm-proceed').removeEventListener('click', proceed);
      confirmation.removeEventListener('cancel', cancel);
      resolve(result);
    };
    const cancel = () => finish(false);
    const proceed = () => finish(true);
    get('confirm-cancel').addEventListener('click', cancel);
    get('confirm-proceed').addEventListener('click', proceed);
    confirmation.addEventListener('cancel', cancel);
  });
}

async function mayLeave() {
  return !dirty || await ask('Leave unsaved changes?', 'These changes have not been saved. Copy your text or save the draft before switching.', 'Discard changes');
}

function renderPublishedState() {
  const post = published.find(item => item.id === currentId);
  get('post-status').textContent = post ? 'Published · edits stay private until updated' : 'Private draft';
  get('publish-button').textContent = post ? 'Update post' : 'Publish';
  get('unpublish-button').hidden = !post;
  const link = get<HTMLAnchorElement>('live-post-link');
  link.hidden = !post;
  link.href = post ? `/writing/${encodeURIComponent(post.slug)}/` : '/writing/';
}

function renderList() {
  const list = get('draft-list');
  list.replaceChildren();
  if (!drafts.length) {
    const empty = document.createElement('p');
    empty.className = 'secondary small';
    empty.textContent = 'Your first thought starts here.';
    list.append(empty);
  }
  for (const draft of drafts) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'draft-item';
    button.setAttribute('aria-current', String(draft.id === currentId));
    const heading = document.createElement('strong');
    heading.textContent = draft.title || excerpt(draft.body, 45) || 'Untitled draft';
    const status = document.createElement('span');
    status.textContent = `${published.some(post => post.id === draft.id) ? 'Published' : 'Draft'} · ${new Date(draft.updated_at).toLocaleDateString(undefined, {month:'short',day:'numeric'})}`;
    button.append(heading, status);
    button.addEventListener('click', () => { void openDraft(draft); });
    list.append(button);
  }
}

async function refresh() {
  if (!client) return;
  const [draftResult, postResult] = await Promise.all([
    client.from('rb_drafts').select('*').order('updated_at', {ascending:false}),
    client.from('rb_posts').select('*').order('published_at', {ascending:false}),
  ]);
  if (draftResult.error) throw draftResult.error;
  if (postResult.error) throw postResult.error;
  drafts = draftResult.data as Draft[];
  published = postResult.data as PublishedPost[];
  renderList();
  renderPublishedState();
}

async function getImageUrl(path: string) {
  if (!client) return '';
  const cached = imageUrls.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const result = await client.storage.from('rb-studio-images').createSignedUrl(path, 3600);
  if (result.error) throw result.error;
  imageUrls.set(path, {url:result.data.signedUrl,expires:Date.now()+3500*1000});
  return result.data.signedUrl;
}

async function renderImages() {
  const renderId = currentId;
  const list = get('image-list');
  list.replaceChildren();
  for (const image of images) {
    const card = document.createElement('div');
    card.className = 'image-card';
    const img = document.createElement('img');
    img.alt = image.alt;
    const label = document.createElement('label');
    const alt = document.createElement('input');
    alt.id = `image-alt-${crypto.randomUUID()}`;
    alt.type = 'text'; alt.maxLength = 300; alt.value = image.alt;
    label.htmlFor = alt.id; label.textContent = 'Image description (alt text)';
    alt.addEventListener('input', () => { image.alt = alt.value; img.alt = alt.value; markDirty(); });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Remove image';
    remove.addEventListener('click', () => { if (busy) return; images = images.filter(item => item !== image); markDirty(); void renderImages(); });
    card.append(img, label, alt, remove);
    list.append(card);
    try {
      const url = await getImageUrl(image.path);
      if (currentId !== renderId) return;
      img.src = url;
    } catch (error) { say(readableError(error), true); }
  }
}

async function openDraft(draft?: Draft) {
  if (busy || !await mayLeave()) return;
  currentId = draft?.id ?? crypto.randomUUID();
  revision = draft?.revision ?? 0;
  title.value = draft?.title ?? '';
  body.value = draft?.body ?? '';
  images = (draft?.images ?? []).map(image => ({...image}));
  dirty = false;
  saveStatus.textContent = draft ? 'Saved privately' : 'Not saved yet';
  get('character-count').textContent = `${Array.from(body.value).length.toLocaleString()} characters`;
  notice.hidden = true;
  renderList(); renderPublishedState();
  await renderImages();
  title.focus();
}

async function save(): Promise<Draft> {
  if (!client) throw new Error('Your studio is not connected.');
  const value = input();
  const error = validateDraft(value);
  if (error) throw new Error(error);
  const result = await client.rpc('rb_save_draft', {
    p_id: currentId, p_title: value.title, p_body: value.body,
    p_images: value.images, p_expected_revision: revision,
  });
  if (result.error) throw result.error;
  const draft = (Array.isArray(result.data) ? result.data[0] : result.data) as Draft;
  revision = draft.revision;
  dirty = false;
  saveStatus.textContent = 'Saved privately';
  return draft;
}

async function run(action: () => Promise<void>) {
  if (busy) return;
  setBusy(true);
  try { await action(); } catch (error) { say(readableError(error), true); }
  finally { setBusy(false); }
}

async function restoreSession() {
  if (!client) return;
  const result = await client.auth.getUser();
  if (!result.data.user) { authPanel.hidden = false; workspace.hidden = true; return; }
  const owner = await client.rpc('rb_is_owner');
  if (owner.error) throw owner.error;
  if (owner.data !== true) {
    await client.auth.signOut();
    throw new Error('This account does not have access to your private studio.');
  }
  ownerId = result.data.user.id;
  authPanel.hidden = true;
  if (recoveryMode) { recovery.hidden = false; workspace.hidden = true; return; }
  recovery.hidden = true;
  workspace.hidden = false;
  await refresh();
}

get('post-title').addEventListener('input', markDirty);
body.addEventListener('input', markDirty);
window.addEventListener('beforeunload', event => { if (dirty || busy) event.preventDefault(); });
get('new-draft').addEventListener('click', () => { void openDraft(); });
get<HTMLFormElement>('composer-form').addEventListener('submit', event => {
  event.preventDefault();
  void run(async () => { await save(); await refresh(); say('Draft saved. Only you can read it.'); });
});
get('publish-button').addEventListener('click', () => {
  void run(async () => {
    if (!title.value.trim() || !body.value.trim()) throw new Error('Add a title and some writing before publishing.');
    if (!await ask('Ready to share?', 'This saved version and its attached images will be visible to everyone on your website.', 'Publish on website')) return;
    await save();
    const result = await client!.rpc('rb_publish_draft', {p_id:currentId,p_expected_revision:revision});
    if (result.error) throw result.error;
    await refresh();
    say('Published on your website.');
  });
});
get('unpublish-button').addEventListener('click', () => {
  void run(async () => {
    if (!await ask('Unpublish this post?', 'It will disappear from your website. Your private saved draft will remain.', 'Unpublish')) return;
    const result = await client!.rpc('rb_unpublish_post', {p_id:currentId});
    if (result.error) throw result.error;
    await refresh(); say('Post unpublished. Your saved draft is still private.');
  });
});
get('preview-button').addEventListener('click', () => {
  void run(async () => {
    get('preview-title').textContent = title.value || 'Untitled draft';
    get('preview-body').textContent = body.value;
    const list = get('preview-images'); list.replaceChildren();
    for (const image of images) { const img = document.createElement('img'); img.alt = image.alt; img.src = await getImageUrl(image.path); list.append(img); }
    preview.showModal();
  });
});
get('close-preview').addEventListener('click', () => preview.close());
get('copy-button').addEventListener('click', () => {
  void navigator.clipboard.writeText([title.value,body.value].filter(Boolean).join('\n\n'))
    .then(() => say('Text copied.'))
    .catch(() => say('Could not copy automatically. Select your text and copy it directly.',true));
});

get<HTMLInputElement>('image-upload').addEventListener('change', event => {
  const upload = event.target as HTMLInputElement;
  const files = Array.from(upload.files ?? []);
  void run(async () => {
    if (files.length + images.length > 4) throw new Error('Choose up to four images per post.');
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) throw new Error(problem);
    }
    for (const file of files) {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 50000000) throw new Error('This image is too large to process. Resize it before uploading.');
        const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not process this image.');
        context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not process this image.')), 'image/webp',.88));
        const path = `${ownerId}/${crypto.randomUUID()}.webp`;
        const result = await client!.storage.from('rb-studio-images').upload(path,blob,{contentType:'image/webp',upsert:false});
        if (result.error) throw result.error;
        images.push({path,alt:''}); markDirty();
        await renderImages();
      } finally { bitmap.close(); }
    }
    say('Images attached privately. Add a description for readers who use screen readers.');
  }).finally(() => { upload.value = ''; });
});

get<HTMLFormElement>('login-form')?.addEventListener('submit', event => {
  event.preventDefault();
  if (!client) return;
  const button = get<HTMLButtonElement>('login-button'); button.disabled = true;
  void (async () => {
    try {
      const result = await client.auth.signInWithPassword({email:get<HTMLInputElement>('email').value.trim(),password:get<HTMLInputElement>('password').value});
      if (result.error) throw result.error;
      get<HTMLInputElement>('password').value = '';
      await restoreSession(); notice.hidden = true;
    } catch(error) { say(readableError(error),true); }
    finally { button.disabled = false; }
  })();
});
get('reset-button')?.addEventListener('click', () => {
  void (async () => {
    const email = get<HTMLInputElement>('email');
    if (!email.reportValidity() || !email.value) { email.focus(); return; }
    const result = await client!.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:`${location.origin}/studio/?recovery=1`});
    if (result.error) say(readableError(result.error),true);
    else say('If this address has an account, a password reset link is on its way.');
  })().catch(error => say(readableError(error),true));
});
get<HTMLFormElement>('recovery-form').addEventListener('submit', event => {
  event.preventDefault();
  void run(async () => {
    const result = await client!.auth.updateUser({password:get<HTMLInputElement>('new-password').value});
    if (result.error) throw result.error;
    get<HTMLInputElement>('new-password').value = '';
    recoveryMode = false; history.replaceState(null,'','/studio/');
    await restoreSession(); say('Password saved. Welcome back.');
  });
});
get('sign-out').addEventListener('click', () => {
  void (async () => {
    if (!await mayLeave()) return;
    const result = await client!.auth.signOut();
    if (result.error) throw result.error;
    ownerId = ''; title.value = ''; body.value = ''; images = []; drafts = []; published = [];
    currentId = crypto.randomUUID(); revision = 0; dirty = false; imageUrls.clear();
    get('draft-list').replaceChildren(); get('image-list').replaceChildren();
    workspace.hidden = true; authPanel.hidden = false;
    say('Signed out.');
  })().catch(error => say(readableError(error),true));
});

if (client) {
  client.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryMode = true;
      recovery.hidden = false; workspace.hidden = true; authPanel.hidden = true;
    }
    if (event === 'SIGNED_OUT') {
      workspace.hidden = true; authPanel.hidden = false;
      if (dirty) say('Your session ended. Sign in again to continue with your unsaved writing.',true);
    }
  });
  void restoreSession().catch(error => say(readableError(error),true));
}
