import type { SupabaseClient } from '@supabase/supabase-js';

interface ReviewComment { id:string; display_name:string; body:string; status:'pending'|'approved'|'rejected'; created_at:string }

export function createCommentReview(client:SupabaseClient|null, panel:HTMLElement) {
  const list = panel.querySelector<HTMLElement>('[data-review-list]')!;
  const status = panel.querySelector<HTMLElement>('[data-review-status]')!;
  const refresh = panel.querySelector<HTMLButtonElement>('[data-review-refresh]')!;
  const previous = panel.querySelector<HTMLButtonElement>('[data-review-previous]')!;
  const next = panel.querySelector<HTMLButtonElement>('[data-review-next]')!;
  let offset = 0;
  let postId:string|null = null;
  let request = 0;
  async function load() {
    const generation = ++request;
    const target = postId;
    if (!target || !client) return;
    refresh.disabled = true; previous.disabled = true; next.disabled = true;
    status.textContent = 'Loading comments…';
    try {
      const result = await client.rpc('rb_review_comments', {p_post_id:target,p_offset:offset});
      if (generation !== request || target !== postId) return;
      if (result.error) throw result.error;
      const comments = result.data as ReviewComment[];
      list.replaceChildren();
      const pending = comments.filter(comment => comment.status === 'pending').length;
      status.textContent = comments.length ? `${pending} awaiting approval on this page · page ${offset / 100 + 1}, pending first` : 'No comments on this page.';
      previous.disabled = offset === 0;
      next.disabled = comments.length < 100 || offset >= 1000000;
      for (const comment of comments) {
        const item = document.createElement('article'); item.className = 'review-comment';
        const heading = document.createElement('p'); heading.className = 'review-comment-heading';
        const name = document.createElement('strong'); name.textContent = comment.display_name;
        const state = document.createElement('span'); state.textContent = `${comment.status} · ${new Date(comment.created_at).toLocaleDateString()}`;
        const body = document.createElement('p'); body.className = 'review-comment-body'; body.textContent = comment.body;
        const actions = document.createElement('div'); actions.className = 'review-comment-actions';
        for (const [label, value] of [['Approve','approved'],['Hide','rejected']] as const) {
          if (value === comment.status) continue;
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.addEventListener('click', async () => {
            actions.querySelectorAll('button').forEach(control => control.disabled = true);
            status.textContent = 'Saving review…';
            try {
              const result = await client.rpc('rb_moderate_comment', {p_comment_id:comment.id,p_status:value});
              if (result.error) throw result.error;
              if (target === postId) await load();
            } catch { if (target === postId) status.textContent = 'Couldn’t save this review. Please try again.'; }
            finally { actions.querySelectorAll('button').forEach(control => control.disabled = false); }
          });
          actions.append(button);
        }
        heading.append(name,state); item.append(heading,body,actions); list.append(item);
      }
    } catch { if (generation === request) status.textContent = 'Couldn’t load comments. Please refresh to try again.'; }
    finally { if (generation === request) refresh.disabled = false; }
  }
  refresh.addEventListener('click', () => { void load(); });
  previous.addEventListener('click', () => { offset = Math.max(0,offset - 100); void load(); });
  next.addEventListener('click', () => { offset += 100; void load(); });
  return {
    show(id:string|null) {
      postId = id; offset = 0; request++; panel.hidden = !id; list.replaceChildren(); status.textContent = '';
      if (id) void load();
    },
  };
}
