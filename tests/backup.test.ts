import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArticleBackup} from '../src/lib/article-backup.ts';
test('backup preserves unsaved over-limit text, metadata and the full document',()=>{
  const body='a'.repeat(100001);
  const doc={type:'doc',content:Array.from({length:5001},(_,index)=>({type:'paragraph',content:[{type:'text',text:String(index)}]}))};
  const article={version:1,doc,summary:'s'.repeat(321),tags:['tag'.repeat(30)],cover:null};
  const saved=JSON.parse(createArticleBackup({title:'Unsaved article',body,article,images:[]}));
  assert.equal(saved.body.length,100001);assert.equal(saved.article.doc.content.at(-1).content[0].text,'5000');assert.equal(saved.article.summary.length,321);assert.equal(saved.saved,false);
});
