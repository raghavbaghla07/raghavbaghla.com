import { createStudioClient } from '../lib/supabase';
import { requestSignInLink } from '../lib/studio-auth';
import { validateDraft, validateImageFile, excerpt, readableError } from '../lib/studio-content';
import type { Draft, DraftInput, PostImage, PublishedPost } from '../lib/studio-content';
import { normalizeArticle, articleText, articleStats, renderArticle, safeLink, validateArticleDocument } from '../lib/article';
import type { ArticleContent, ArticleNode } from '../lib/article';
import { Autosave } from '../lib/autosave';
import { createArticleEditor } from './article-editor';
import { createArticleBackup } from '../lib/article-backup';
import { resetArticleState } from '../lib/editor-state';
import { createCommentReview } from './comment-review';
import { setupAnalytics } from './studio-analytics';
const client = createStudioClient();
const closeAnalytics = setupAnalytics(client);
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const authPanel = get('auth-panel'), workspace = get('workspace'), title = get<HTMLInputElement>('post-title');
const fields = get<HTMLFieldSetElement>('composer-fields'), notice = get('notice'), saveStatus = get('save-status');
const preview = get<HTMLDialogElement>('preview-dialog'), confirmation = get<HTMLDialogElement>('confirm-dialog'), recovery = get('recovery-panel');
const summary = get<HTMLTextAreaElement>('article-summary'), tags = get<HTMLInputElement>('article-tags');
let ownerId = '', currentId: string = crypto.randomUUID(), revision = 0, generation = 0;
let dirty = false, busy = false, blockedByConflict = false, draftFilter = 'all';
let drafts: Draft[] = [], published: PublishedPost[] = [], images: PostImage[] = [];
let cover: string | null = null;
let recoveryMode = new URLSearchParams(location.search).get('recovery') === '1';
const imageUrls = new Map<string, {
    url: string;
    expires: number;
}>();
const autosave = new Autosave(saveSnapshot, error => {
    blockedByConflict = /conflict/i.test(String((error as {
        message?: string;
    })?.message));
    saveStatus.textContent = blockedByConflict ? 'Save conflict · reopen draft' : 'Save failed · retry Save draft';
    say(readableError(error), true);
});
const editor = createArticleEditor(get('post-body'), markDirty, getImageUrl);
const commentReview = createCommentReview(client, get('comment-review'));
const actionBar = document.querySelector<HTMLElement>('.workspace-actions')!;
new ResizeObserver(() => {
    actionBar.parentElement!.style.setProperty('--actions-height', `${Math.ceil(actionBar.getBoundingClientRect().height)}px`);
}).observe(actionBar);
function say(message: string, error = false) { notice.textContent = message; notice.classList.toggle('error', error); notice.setAttribute('role', error ? 'alert' : 'status'); notice.hidden = false; }
function setBusy(value: boolean) {
    busy = value;
    fields.disabled = value;
    editor.setEditable(!value);
    document.querySelectorAll<HTMLButtonElement>('#workspace button').forEach(button => button.disabled = value);
    document.querySelectorAll<HTMLSelectElement>('#workspace select').forEach(select=>select.disabled=value);
    if (!value)
        updateToolbar();
}
function updateStats() { const stats = articleStats(editor.getText()); get('word-count').textContent = `${stats.words.toLocaleString()} words`; get('character-count').textContent = `${stats.characters.toLocaleString()} / 100,000 characters`; get('reading-time').textContent = `${Math.max(1, stats.minutes)} min read`; }
function markDirty() { dirty = true; generation++; saveStatus.textContent = autosave.paused ? 'Autosave paused · save or reopen' : 'Unsaved changes'; updateStats(); if (ownerId && !workspace.hidden)
    autosave.schedule(); }
function input(): DraftInput {
    const rawText = editor.getText({ blockSeparator: '\n\n' });
    if (Array.from(rawText).length > 100000)
        throw new Error('Keep the article within 100,000 characters. Your writing is still here; shorten it before saving.');
    const tagValues = tags.value.split(',').map(value => value.trim()).filter(Boolean);
    if (tagValues.length > 8 || tagValues.some(value => Array.from(value).length > 40))
        throw new Error('Use up to 8 tags, with up to 40 characters each.');
    const article: ArticleContent = { version: 1, doc: editor.getJSON() as ArticleNode, summary: summary.value.trim(), tags: [...new Set(tagValues)], cover };
    const documentProblem = validateArticleDocument(article.doc);
    if (documentProblem)
        throw new Error(documentProblem);
    const value = { title: title.value.trim(), body: articleText(article.doc), images: images.map(image => ({ ...image })), article };
    const problem = validateDraft(value);
    if (problem)
        throw new Error(problem);
    return value;
}
function ask(heading: string, description: string, action: string): Promise<boolean> {
    get('confirm-title').textContent = heading;
    get('confirm-description').textContent = description;
    get('confirm-proceed').textContent = action;
    confirmation.showModal();
    return new Promise(resolve => { const finish = (result: boolean) => { confirmation.close(); get('confirm-cancel').removeEventListener('click', cancel); get('confirm-proceed').removeEventListener('click', proceed); confirmation.removeEventListener('cancel', cancel); resolve(result); }; const cancel = () => finish(false), proceed = () => finish(true); get('confirm-cancel').addEventListener('click', cancel); get('confirm-proceed').addEventListener('click', proceed); confirmation.addEventListener('cancel', cancel); });
}
async function mayLeave() { return !dirty || await ask('Leave unsaved changes?', 'These changes have not been saved. Copy or download your article before switching.', 'Discard changes'); }
function renderPublishedState() { const post = published.find(item => item.id === currentId); get('post-status').textContent = post ? 'Published · edits private' : 'Private draft'; get('publish-button').textContent = post ? 'Update article ↗' : 'Publish ↗'; get('unpublish-button').hidden = !post; get('delete-article').hidden = revision === 0; const link = get<HTMLAnchorElement>('live-post-link'); link.hidden = !post; link.href = post ? `/writing/${encodeURIComponent(post.slug)}/` : '/writing/'; commentReview.show(post?.id ?? null); }
function renderList() {
    const list = get('draft-list');
    list.replaceChildren();
    const search = get<HTMLInputElement>('draft-search').value.toLocaleLowerCase();
    const filtered = drafts.filter(draft => { const isPublic = published.some(post => post.id === draft.id); return (draftFilter === 'all' || (draftFilter === 'published' ? isPublic : !isPublic)) && `${draft.title} ${draft.body}`.toLocaleLowerCase().includes(search); });
    if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'secondary small';
        empty.textContent = drafts.length ? 'No articles match this search.' : 'A blank page, a new possibility. Start your first article with +.';
        list.append(empty);
    }
    for (const draft of filtered) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'draft-item';
        button.setAttribute('aria-current', String(draft.id === currentId));
        const heading = document.createElement('strong');
        heading.textContent = draft.title || excerpt(draft.body, 45) || 'Untitled article';
        const status = document.createElement('span');
        status.textContent = `${published.some(post => post.id === draft.id) ? 'Published' : 'Draft'} · ${new Date(draft.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        button.append(heading, status);
        button.addEventListener('click', () => { void openDraft(draft); });
        list.append(button);
    }
}
async function refresh() { if (!client)
    return; const [d, p] = await Promise.all([client.from('rb_drafts').select('*').order('updated_at', { ascending: false }), client.from('rb_posts').select('*').order('published_at', { ascending: false })]); if (d.error)
    throw d.error; if (p.error)
    throw p.error; drafts = d.data as Draft[]; published = p.data as PublishedPost[]; renderList(); renderPublishedState(); }
async function getImageUrl(path: string) { if (!client)
    return ''; const cached = imageUrls.get(path); if (cached && cached.expires > Date.now())
    return cached.url; const result = await client.storage.from('rb-studio-images').createSignedUrl(path, 3600); if (result.error)
    throw result.error; imageUrls.set(path, { url: result.data.signedUrl, expires: Date.now() + 3500000 }); return result.data.signedUrl; }
function updateImageNodes(path: string, attrs: Record<string, unknown> | null) { const tr = editor.state.tr; const positions: {
    pos: number;
    size: number;
    attrs: Record<string, unknown>;
}[] = []; editor.state.doc.descendants((node, pos) => { if (node.type.name === 'articleImage' && node.attrs.path === path)
    positions.push({ pos, size: node.nodeSize, attrs: node.attrs }); }); for (const item of positions.reverse()) {
    if (attrs)
        tr.setNodeMarkup(item.pos, undefined, { ...item.attrs, ...attrs });
    else
        tr.delete(item.pos, item.pos + item.size);
} if (positions.length)
    editor.view.dispatch(tr); }
async function renderCover() { const host = get('cover-preview'), path = cover; host.replaceChildren(); host.hidden = !path; if (!path)
    return; try {
    const url = await getImageUrl(path);
    if (path !== cover)
        return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = images.find(image => image.path === path)?.alt || '';
    const label = document.createElement('p');
    label.textContent = 'COVER IMAGE';
    host.append(img, label);
}
catch (error) {
    say(readableError(error), true);
} }
async function renderImages() {
    const renderId = currentId, list = get('image-list');
    list.replaceChildren();
    get('image-count').textContent = `${images.length} / 20`;
    for (const image of images) {
        const card = document.createElement('div');
        card.className = 'image-card';
        const img = document.createElement('img');
        img.alt = image.alt;
        const label = document.createElement('label'), alt = document.createElement('input');
        alt.id = `alt-${crypto.randomUUID()}`;
        alt.maxLength = 300;
        alt.value = image.alt;
        label.htmlFor = alt.id;
        label.textContent = 'Alt text';
        const captionLabel = document.createElement('label'), caption = document.createElement('input');
        caption.id = `caption-${crypto.randomUUID()}`;
        caption.maxLength = 500;
        let savedCaption = '';
        editor.state.doc.descendants(node => { if (node.type.name === 'articleImage' && node.attrs.path === image.path)
            savedCaption = String(node.attrs.caption || ''); });
        caption.value = savedCaption;
        captionLabel.htmlFor = caption.id;
        captionLabel.textContent = 'Caption (for inserted image)';
        alt.addEventListener('input', () => { image.alt = alt.value; img.alt = alt.value; updateImageNodes(image.path, { alt: alt.value }); markDirty(); });
        caption.addEventListener('input', () => { updateImageNodes(image.path, { caption: caption.value }); markDirty(); });
        const actions = document.createElement('div');
        actions.className = 'image-actions';
        const insert = document.createElement('button');
        insert.type = 'button';
        insert.textContent = 'Insert';
        insert.addEventListener('click', () => { if (busy)
            return; editor.chain().focus().insertContent({ type: 'articleImage', attrs: { path: image.path, alt: image.alt, caption: caption.value } }).run(); });
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = cover === image.path ? 'Remove cover' : 'Use as cover';
        choose.classList.toggle('is-cover', cover === image.path);
        choose.addEventListener('click', () => { if (busy)
            return; cover = cover === image.path ? null : image.path; markDirty(); void renderCover(); void renderImages(); });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => { if (busy)
            return; images = images.filter(item => item !== image); if (cover === image.path)
            cover = null; updateImageNodes(image.path, null); markDirty(); void renderImages(); void renderCover(); });
        actions.append(insert, choose, remove);
        card.append(img, label, alt, captionLabel, caption, actions);
        list.append(card);
        try {
            const url = await getImageUrl(image.path);
            if (currentId !== renderId)
                return;
            img.src = url;
        }
        catch (error) {
            say(readableError(error), true);
        }
    }
}
async function openDraft(draft?: Draft) {
    if (busy)
        return;
    // Finish an in-flight cloud request before deciding whether to leave this draft.
    if (autosave.saving) {
        try {
            await autosave.flush();
        }
        catch { }
    }
    if (!await mayLeave())
        return;
    if (draft && client) {
        const id = draft.id;
        setBusy(true);
        try {
            await refresh();
            draft = drafts.find(item => item.id === id);
            if (!draft)
                throw new Error('This article is unavailable. Your current writing is still here.');
        }
        catch (error) {
            say(readableError(error), true);
            return;
        }
        finally {
            setBusy(false);
        }
    }
    await loadEditor(draft);
    title.focus();
}

async function loadEditor(draft?: Draft) {
    autosave.cancel();
    blockedByConflict = false;
    currentId = draft?.id ?? crypto.randomUUID();
    revision = draft?.revision ?? 0;
    generation++;
    images = (draft?.images ?? []).map(image => ({ ...image }));
    const article = normalizeArticle(draft?.article, draft?.body ?? '', images);
    cover = article.cover;
    summary.value = article.summary;
    tags.value = article.tags.join(', ');
    title.value = draft?.title ?? '';
    if (draft && !draft.article && images.length)
        article.doc.content?.push(...images.map(image => ({ type: 'articleImage', attrs: { path: image.path, alt: image.alt, caption: '' } })));
    editor.view.updateState(resetArticleState(editor.state, article.doc));
    updateToolbar();
    dirty = false;
    saveStatus.textContent = draft ? 'Saved privately' : 'Not saved yet';
    notice.hidden = true;
    renderList();
    renderPublishedState();
    updateStats();
    await Promise.all([renderImages(), renderCover()]);
}
async function saveSnapshot() {
    if (!client || !ownerId || workspace.hidden)
        throw new Error('Sign in before saving your article.');
    if (!dirty)
        return;
    const id = currentId, version = generation, value = input();
    saveStatus.textContent = 'Saving…';
    const result = await client.rpc('rb_save_article', { p_id: id, p_title: value.title, p_body: value.body, p_images: value.images, p_article: value.article, p_expected_revision: revision });
    if (result.error)
        throw result.error;
    const saved = (Array.isArray(result.data) ? result.data[0] : result.data) as Draft;
    if (id !== currentId)
        return;
    revision = saved.revision;
    dirty = generation !== version;
    saveStatus.textContent = dirty ? 'Unsaved changes' : 'Saved privately';
    const index = drafts.findIndex(item => item.id === id);
    if (index < 0)
        drafts.unshift(saved);
    else
        drafts[index] = saved;
    get('delete-article').hidden = false;
    renderList();
}
async function save() { if (autosave.paused && !blockedByConflict)
    autosave.cancel(); if (dirty)
    autosave.schedule(); await autosave.flush(); }
async function run(action: () => Promise<void>) { if (busy)
    return; setBusy(true); try {
    await action();
}
catch (error) {
    say(readableError(error), true);
}
finally {
    setBusy(false);
} }
async function restoreSession() { if (!client)
    return; const result = await client.auth.getUser(); if (!result.data.user) {
    authPanel.hidden = false;
    workspace.hidden = true;
    return;
} const owner = await client.rpc('rb_is_owner'); if (owner.error)
    throw owner.error; if (owner.data !== true) {
    await client.auth.signOut();
    throw new Error('This account does not have access to your private studio.');
} ownerId = result.data.user.id; authPanel.hidden = true; if (recoveryMode) {
    recovery.hidden = false;
    workspace.hidden = true;
    return;
} recovery.hidden = true; workspace.hidden = false; await refresh(); if (dirty && !autosave.paused)
    autosave.schedule(); }
function updateToolbar() {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-command]')) {
        const command = button.dataset.command!;
        if (['superscript', 'subscript', 'bold', 'italic', 'underline', 'strike', 'highlight', 'code', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'link'].includes(command))
            button.setAttribute('aria-pressed', String(editor.isActive(command)));
        if (command === 'heading2' || command === 'heading3')
            button.setAttribute('aria-pressed', String(editor.isActive('heading', { level: command === 'heading2' ? 2 : 3 })));
        if (!busy) {
            if (command === 'undo')
                button.disabled = !editor.can().undo();
            else if (command === 'redo')
                button.disabled = !editor.can().redo();
            else if (['addRowAfter', 'addColumnAfter', 'deleteRow', 'deleteColumn', 'deleteTable', 'toggleHeaderRow'].includes(command))
                button.disabled = !editor.isActive('table');
        }
    }
    const heading = editor.getAttributes('heading').level;
    get<HTMLSelectElement>('block-format').value = editor.isActive('heading') ? String(heading) : 'paragraph';
    const language = get<HTMLSelectElement>('code-language');
    language.hidden = !editor.isActive('codeBlock');
    language.value = editor.getAttributes('codeBlock').language || '';
}
editor.on('selectionUpdate', updateToolbar);
editor.on('transaction', updateToolbar);
get('post-title').addEventListener('input', markDirty);
summary.addEventListener('input', markDirty);
tags.addEventListener('input', markDirty);
window.addEventListener('beforeunload', event => { if (dirty || busy || autosave.saving)
    event.preventDefault(); });
window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !workspace.hidden) {
    event.preventDefault();
    void run(async () => { await save(); say('Article saved privately.'); });
} });
get('new-draft').addEventListener('click', () => { void openDraft(); });
get('draft-search').addEventListener('input', renderList);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-filter]'))
    button.addEventListener('click', () => { draftFilter = button.dataset.filter!; document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderList(); });
get('toggle-sidebar').addEventListener('click', () => { const hidden = workspace.classList.toggle('sidebar-hidden'); get('toggle-sidebar').setAttribute('aria-expanded', String(!hidden)); });
get('focus-button').addEventListener('click', () => { const focus = workspace.classList.toggle('focus-mode'); get('focus-button').setAttribute('aria-pressed', String(focus)); get('focus-button').textContent = focus ? 'Exit focus' : 'Focus'; });
get<HTMLFormElement>('composer-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => { await save(); say('Article saved. Only you can read this draft.'); }); });
get('publish-button').addEventListener('click', () => { void run(async () => { if (!title.value.trim() || !editor.getText().trim())
    throw new Error('Add a title and some writing before publishing.'); if (!await ask('Ready to share?', 'This saved article and its attached images will be visible to everyone on your website.', 'Publish on website'))
    return; await save(); const result = await client!.rpc('rb_publish_draft', { p_id: currentId, p_expected_revision: revision }); if (result.error)
    throw result.error;
    // Publication already queued delivery in the same database transaction.
    void client!.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        return fetch('/api/article-emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + data.session.access_token },
            keepalive: true,
        });
    }).catch(() => { /* The scheduled worker will process pending deliveries. */ });
    await refresh(); say('Article published on your website.'); }); });
get('unpublish-button').addEventListener('click', () => { void run(async () => { if (!await ask('Unpublish this article?', 'It will disappear from your website. Your private saved draft will remain.', 'Unpublish'))
    return; const result = await client!.rpc('rb_unpublish_post', { p_id: currentId }); if (result.error)
    throw result.error; await refresh(); say('Article unpublished. Your saved draft is still private.'); }); });
get('delete-article').addEventListener('click', async () => {
    const id = currentId;
    await run(async () => {
        const name = title.value.trim() || 'Untitled article';
        const confirmed = await ask('Delete this article?',
            `“${name}” will be permanently deleted, including its draft, any public version, likes, and comments. This cannot be undone.`,
            'Delete permanently');
        if (!confirmed) return;

        const wasPaused = autosave.paused;
        if (!wasPaused) autosave.cancel();
        try { await autosave.flush(); } catch { /* Delete the saved revision only. */ }
        const result = await client!.rpc('rb_delete_article', { p_id: id, p_expected_revision: revision });
        if (result.error) {
            if (dirty && !autosave.paused) autosave.schedule();
            throw result.error;
        }

        drafts = drafts.filter(draft => draft.id !== id);
        published = published.filter(post => post.id !== id);
        await loadEditor();
        say('Article deleted.');
    });
    if (currentId !== id) title.focus();
});
get('preview-button').addEventListener('click', () => {
    void run(async () => {
        const value = input(), article = value.article!;
        get('preview-title').textContent = value.title || 'Untitled article';
        get('preview-byline').textContent = `Raghav Baghla · ${Math.max(1, articleStats(value.body).minutes)} min read`;
        const urls = new Map(await Promise.all(images.map(async (image) => [image.path, await getImageUrl(image.path)] as const)));
        const host = get('preview-body');
        host.innerHTML = renderArticle(article, images, path => urls.get(path) || '');
        if (article.summary) {
            const p = document.createElement('p');
            p.className = 'article-summary';
            p.textContent = article.summary;
            host.prepend(p);
        }
        if (cover) {
            const img = document.createElement('img');
            img.src = urls.get(cover) || '';
            img.alt = images.find(image => image.path === cover)?.alt || '';
            host.prepend(img);
        }
        preview.showModal();
    });
});
get('close-preview').addEventListener('click', () => preview.close());
get('copy-button').addEventListener('click', () => { void navigator.clipboard.writeText([title.value, editor.getText()].filter(Boolean).join('\n\n')).then(() => say('Article text copied.')).catch(() => say('Could not copy automatically. Select your writing and copy it directly.', true)); });
get('export-button').addEventListener('click', () => { try {
    const value = { title: title.value, body: editor.getText(), article: { version: 1, doc: editor.getJSON(), summary: summary.value, tags: tags.value.split(',').map(tag => tag.trim()), cover }, images };
    const url = URL.createObjectURL(new Blob([createArticleBackup(value)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(title.value || 'article').replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    say('Article backup downloaded. Image references are included; download the original image files separately.');
}
catch (error) {
    say(readableError(error), true);
} });
get<HTMLSelectElement>('block-format').addEventListener('change', event => { const value = (event.target as HTMLSelectElement).value; if (value === 'paragraph')
    editor.chain().focus().setParagraph().run();
else
    editor.chain().focus().setHeading({ level: Number(value) as 2 | 3 | 4 }).run(); });
get<HTMLSelectElement>('code-language').addEventListener('change', event => { editor.chain().focus().updateAttributes('codeBlock', { language: (event.target as HTMLSelectElement).value || null }).run(); });
const linkDialog = get<HTMLDialogElement>('link-dialog');
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-command]'))
    button.addEventListener('click', () => {
        if (busy)
            return;
        const command = button.dataset.command!;
        if (command === 'link') {
            get<HTMLInputElement>('link-url').value = editor.getAttributes('link').href || '';
            get('link-error').hidden = true;
            linkDialog.showModal();
            return;
        }
        const chain = editor.chain().focus();
        if (command === 'indent') {
            chain.sinkListItem('listItem').run();
            return;
        }
        if (command === 'outdent') {
            chain.liftListItem('listItem').run();
            return;
        }
        switch (command) {
            case 'heading2':
            case 'heading3':
                chain.toggleHeading({ level: command === 'heading2' ? 2 : 3 }).run();
                break;
            case 'superscript':
            case 'subscript':
                chain.toggleMark(command).run();
                break;
            case 'bold':
                chain.toggleBold().run();
                break;
            case 'italic':
                chain.toggleItalic().run();
                break;
            case 'underline':
                chain.toggleUnderline().run();
                break;
            case 'strike':
                chain.toggleStrike().run();
                break;
            case 'highlight':
                chain.toggleHighlight().run();
                break;
            case 'code':
                chain.toggleCode().run();
                break;
            case 'bulletList':
                chain.toggleBulletList().run();
                break;
            case 'orderedList':
                chain.toggleOrderedList().run();
                break;
            case 'blockquote':
                chain.toggleBlockquote().run();
                break;
            case 'codeBlock':
                chain.toggleCodeBlock().run();
                break;
            case 'horizontalRule':
                chain.setHorizontalRule().run();
                break;
            case 'clear':
                chain.unsetAllMarks().clearNodes().run();
                break;
            case 'undo':
                chain.undo().run();
                break;
            case 'redo':
                chain.redo().run();
                break;
            case 'insertTable':
                chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                break;
            case 'addRowAfter':
                chain.addRowAfter().run();
                break;
            case 'addColumnAfter':
                chain.addColumnAfter().run();
                break;
            case 'toggleHeaderRow':
                chain.toggleHeaderRow().run();
                break;
            case 'deleteRow':
                chain.deleteRow().run();
                break;
            case 'deleteColumn':
                chain.deleteColumn().run();
                break;
            case 'deleteTable':
                chain.deleteTable().run();
                break;
        }
        button.closest('details')?.removeAttribute('open');
    });
get<HTMLFormElement>('link-form').addEventListener('submit', event => { event.preventDefault(); const url = safeLink(get<HTMLInputElement>('link-url').value.trim()); if (!url) {
    get('link-error').textContent = 'Enter a valid http://, https:// or mailto: link.';
    get('link-error').hidden = false;
    return;
} editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); linkDialog.close(); });
get('link-cancel').addEventListener('click', () => linkDialog.close());
get('link-remove').addEventListener('click', () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); linkDialog.close(); });
get('toolbar-image').addEventListener('click', () => { get<HTMLDetailsElement>('images-panel').open = true; get<HTMLInputElement>('image-upload').click(); });
get<HTMLInputElement>('image-upload').addEventListener('change', event => {
    const upload = event.target as HTMLInputElement, files = Array.from(upload.files ?? []);
    void run(async () => {
        if (files.length + images.length > 20)
            throw new Error('Choose up to twenty images per article.');
        for (const file of files) {
            const problem = validateImageFile(file);
            if (problem)
                throw new Error(problem);
        }
        for (const file of files) {
            const bitmap = await createImageBitmap(file);
            try {
                if (bitmap.width * bitmap.height > 50000000)
                    throw new Error('This image is too large to process. Resize it before uploading.');
                const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                const context = canvas.getContext('2d');
                if (!context)
                    throw new Error('Could not process this image.');
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not process this image.')), 'image/webp', .88));
                const path = `${ownerId}/${crypto.randomUUID()}.webp`;
                const result = await client!.storage.from('rb-studio-images').upload(path, blob, { contentType: 'image/webp', upsert: false });
                if (result.error)
                    throw result.error;
                images.push({ path, alt: '' });
                markDirty();
                await renderImages();
            }
            finally {
                bitmap.close();
            }
        }
        say('Images attached privately. Add alt text, insert images into the article, or choose a cover.');
    }).finally(() => { upload.value = ''; });
});
get<HTMLFormElement>('login-form')?.addEventListener('submit', event => {
    event.preventDefault();
    if (!client)
        return;
    const button = get<HTMLButtonElement>('login-button');
    button.disabled = true;
    void (async () => {
        try {
            const result = await client.auth.signInWithPassword({ email: get<HTMLInputElement>('email').value.trim(), password: get<HTMLInputElement>('password').value });
            if (result.error)
                throw result.error;
            get<HTMLInputElement>('password').value = '';
            await restoreSession();
            notice.hidden = true;
        }
        catch (error) {
            say(readableError(error), true);
        }
        finally {
            button.disabled = false;
        }
    })();
});
get('reset-button')?.addEventListener('click', () => {
    void (async () => {
        const email = get<HTMLInputElement>('email');
        if (!email.reportValidity() || !email.value) {
            email.focus();
            return;
        }
        const result = await client!.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: `${location.origin}/studio/?recovery=1` });
        if (result.error)
            say(readableError(result.error), true);
        else
            say('If this address has an account, a password reset link is on its way.');
    })().catch(error => say(readableError(error), true));
});
get('email-link-button')?.addEventListener('click', () => {
    void (async () => {
        const email = get<HTMLInputElement>('email');
        if (!email.reportValidity() || !email.value) {
            email.focus();
            return;
        }
        const button = get<HTMLButtonElement>('email-link-button');
        button.disabled = true;
        try {
            const result = await requestSignInLink(client!, email.value, location.origin);
            if (result.error)
                throw result.error;
            say('If this address has an account, check your inbox for a sign-in link.');
        }
        catch (error) {
            say(readableError(error), true);
        }
        finally {
            button.disabled = false;
        }
    })().catch(error => say(readableError(error), true));
});
get<HTMLFormElement>('recovery-form').addEventListener('submit', event => {
    event.preventDefault();
    void run(async () => {
        const result = await client!.auth.updateUser({ password: get<HTMLInputElement>('new-password').value });
        if (result.error)
            throw result.error;
        get<HTMLInputElement>('new-password').value = '';
        recoveryMode = false;
        history.replaceState(null, '', '/studio/');
        await restoreSession();
        say('Password saved. Welcome back.');
    });
});
get('sign-out').addEventListener('click', () => {
    void (async () => {
        if (autosave.saving) {
            try {
                await autosave.flush();
            }
            catch { }
        }
        if (!await mayLeave())
            return;
        autosave.cancel();
        const result = await client!.auth.signOut();
        if (result.error)
            throw result.error;
        ownerId = '';
        title.value = '';
        images = [];
        drafts = [];
        published = [];
        editor.view.updateState(resetArticleState(editor.state,{type:'doc',content:[{type:'paragraph'}]}));
        summary.value = '';
        tags.value = '';
        cover = null;
        currentId = crypto.randomUUID();
        revision = 0;
        dirty = false;
        imageUrls.clear();
        get('draft-list').replaceChildren();
        get('image-list').replaceChildren();
        workspace.hidden = true;
        authPanel.hidden = false;
        say('Signed out.');
    })().catch(error => say(readableError(error), true));
});
if (client) {
    client.auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY') {
            recoveryMode = true;
            recovery.hidden = false;
            workspace.hidden = true;
            authPanel.hidden = true;
        }
        if (event === 'SIGNED_OUT') {
            closeAnalytics();
            commentReview.show(null);
            autosave.cancel();
            workspace.hidden = true;
            authPanel.hidden = false;
            if (dirty)
                say('Your session ended. Sign in again to continue with your unsaved writing.', true);
        }
    });
    void restoreSession().catch(error => say(readableError(error), true));
}
