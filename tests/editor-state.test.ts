import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Schema} from '@tiptap/pm/model';
import {EditorState} from '@tiptap/pm/state';
import {history,undoDepth} from '@tiptap/pm/history';
import {resetArticleState} from '../src/lib/editor-state.ts';
test('opening another article resets undo so it cannot replace that article with a previous draft',()=>{
  const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*'},text:{}}});
  let state=EditorState.create({schema,plugins:[history()]});
  state=state.apply(state.tr.insertText('Draft A'));
  assert.equal(undoDepth(state),1);
  const loaded=resetArticleState(state,{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Draft B'}]}]});
  assert.equal(loaded.doc.textContent,'Draft B');assert.equal(undoDepth(loaded),0);
});
