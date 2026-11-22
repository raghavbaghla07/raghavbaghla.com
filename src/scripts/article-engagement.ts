import { createPublicClient } from '../lib/supabase';

interface ReaderComment { id:string; display_name:string; body:string; created_at:string }
const root = document.querySelector<HTMLElement>('[data-article-engagement]');
if (root) initialize(root);

function initialize(root:HTMLElement) {
  const client = createPublicClient();
  const get = <T extends HTMLElement>(selector:string) => root.querySelector<T>(selector)!;
  const like = get<HTMLButtonElement>('[data-like]');
  const form = get<HTMLFormElement>('[data-comment-form]');
  const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
  const status = get('[data-engagement-status]');
  const commentStatus = get('[data-comment-status]');
  const list = get('[data-comment-list]');
  const more = get<HTMLButtonElement>('[data-more-comments]');
  const postId = root.dataset.postId!;
  const shareUrl = root.dataset.shareUrl!;
  let visitor:string|null = null;
  let liked = false;
  let offset = 0;
  const seen = new Set<string>();
  try {
    const stored = localStorage.getItem('rb-reader-id');
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) visitor = stored;
  } catch { /* Interactions still work for this page when storage is blocked. */ }
  function visitorId() {
    if (!visitor) { visitor = crypto.randomUUID(); try { localStorage.setItem('rb-reader-id', visitor); } catch { /* Page-local identifier. */ } }
    return visitor;
  }
  function message(target:HTMLElement, text:string, error = false) {
    target.textContent = text; target.dataset.error = String(error);
  }
  async function loadStats() {
    const result = await client!.rpc('rb_post_engagement', {p_post_id:postId,p_visitor_id:visitor});
    if (result.error) throw result.error;
    const stats = result.data?.[0];
    if (!stats) throw new Error('Article no longer available.');
    liked = stats.liked;
    like.setAttribute('aria-pressed', String(liked));
    get('[data-like-label]').textContent = liked ? 'Liked' : 'Like this article';
    get('[data-like-count]').textContent = String(stats.likes);
    get('[data-comment-count]').textContent = `${stats.comments} ${stats.comments === 1 ? 'comment' : 'comments'}`;
    like.disabled = false;
  }
  async function loadComments() {
    const result = await client!.rpc('rb_list_comments', {p_post_id:postId,p_offset:offset});
    if (result.error) throw result.error;
    const comments = result.data as ReaderComment[];
    if (offset === 0) list.replaceChildren();
    for (const comment of comments) {
      if (seen.has(comment.id)) continue;
      seen.add(comment.id);
      const item = document.createElement('article'); item.className = 'reader-comment';
      const heading = document.createElement('div'); heading.className = 'reader-comment-header';
      const name = document.createElement('strong'); name.textContent = comment.display_name;
      const date = document.createElement('time'); date.dateTime = comment.created_at;
      date.textContent = new Date(comment.created_at).toLocaleDateString(undefined, {day:'numeric',month:'short',year:'numeric'});
      const body = document.createElement('p'); body.className = 'reader-comment-body'; body.textContent = comment.body;
      heading.append(name,date); item.append(heading,body); list.append(item);
    }
    if (offset === 0 && !comments.length) { const empty = document.createElement('p'); empty.className = 'comments-state'; empty.textContent = 'No comments yet. You could start the conversation.'; list.append(empty); }
    offset += comments.length;
    more.hidden = comments.length < 20 || offset > 10000;
  }
  like.addEventListener('click', async () => {
    if (!client) return;
    const desired = !liked;
    like.disabled = true; message(status,'');
    try {
      const result = await client.rpc('rb_set_post_like', {p_post_id:postId,p_visitor_id:visitorId(),p_liked:desired});
      if (result.error) throw result.error;
      // The mutation succeeded even if the following count refresh fails.
      liked = desired; like.setAttribute('aria-pressed',String(liked));
      get('[data-like-label]').textContent = liked ? 'Liked' : 'Like this article';
      await loadStats();
      message(status, liked ? 'Thank you for reading.' : 'Like removed.');
    } catch { message(status,'Couldn’t refresh your like. Please try again.',true); }
    finally { like.disabled = false; }
  });
  more.addEventListener('click', async () => {
    more.disabled = true;
    try { await loadComments(); } catch { message(status,'Couldn’t load more comments. Please try again.',true); }
    finally { more.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client || !form.reportValidity()) return;
    const data = new FormData(form);
    if (String(data.get('website') || '')) return;
    const name = String(data.get('display_name') || '').trim();
    const body = String(data.get('body') || '').trim();
    if (!name || !body) { message(commentStatus,'Please add your name and a comment.',true); return; }
    submit.disabled = true; submit.textContent = 'Sending…'; message(commentStatus,'');
    try {
      const result = await client.rpc('rb_submit_comment', {p_post_id:postId,p_visitor_id:visitorId(),p_display_name:name,p_body:body});
      if (result.error) throw result.error;
      get<HTMLTextAreaElement>('#comment-body').value = '';
      message(commentStatus,'Thank you! Your comment has been sent to Raghav for approval.');
    } catch (error) {
      const reason = String((error as {message?:string})?.message || '');
      message(commentStatus,/wait/i.test(reason) ? 'Please wait a little before sending another comment.' : 'Couldn’t send your comment. Your text is still here; please try again.',true);
    } finally { submit.disabled = false; submit.textContent = 'Send comment'; }
  });
  get('[data-copy-link]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl); message(status,'Link copied. Paste it into any app.'); }
    catch { message(status,`Copy this link: ${shareUrl}`); }
  });
  const nativeShare = get<HTMLButtonElement>('[data-native-share]');
  if (typeof navigator.share === 'function') {
    nativeShare.hidden = false;
    nativeShare.addEventListener('click', async () => {
      try { await navigator.share({title:root.dataset.shareTitle!,url:shareUrl}); }
      catch (error) { if ((error as Error).name !== 'AbortError') message(status,'Use a sharing link or Copy link instead.',true); }
    });
  }
  if (!client) { message(status,'Likes and comments are temporarily unavailable.',true); list.textContent = 'Comments are temporarily unavailable.'; return; }
  // Independent reads: comments remain usable if only the like count fails.
  void loadStats().catch(() => message(status,'Likes are temporarily unavailable. Please refresh to try again.',true));
  void loadComments().then(() => { submit.disabled = false; }).catch(() => {
    list.textContent = 'Comments are temporarily unavailable. Please refresh to try again.';
    submit.disabled = false;
  });
}

