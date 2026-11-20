import { EditorState } from '@tiptap/pm/state';
import type { ArticleNode } from './article';
/** A new article must start with fresh plugin/history state. */
export function resetArticleState(state: EditorState, doc: ArticleNode): EditorState {
  return EditorState.create({schema:state.schema,plugins:state.plugins,doc:state.schema.nodeFromJSON(doc)});
}
