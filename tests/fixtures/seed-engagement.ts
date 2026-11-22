/** Disposable local fixture only. Never points at the production database. */
export {};
const origin = 'http://127.0.0.1:54555';
const auth = await fetch(`${origin}/auth/v1/token?grant_type=password`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.invalid',password:'qa-only'})}).then(response=>response.json());
const rpc = async (name:string, body:unknown, owner = true) => {
  const response = await fetch(`${origin}/rest/v1/rpc/${name}`, {method:'POST',headers:{'Content-Type':'application/json',apikey:'local-test-only',...(owner ? {Authorization:`Bearer ${auth.access_token}`} : {})},body:JSON.stringify(body)});
  const value = await response.json(); if (!response.ok) throw new Error(JSON.stringify(value)); return value;
};
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const text = (value:string) => ({type:'text',text:value});
const paragraph = (value:string) => ({type:'paragraph',content:[text(value)]});
await rpc('rb_save_article', {p_id:id,p_title:'Small notes, better days.',p_body:'Some of the best ideas begin as small observations. Reading is only the beginning. Make a little room for learning every day.',p_images:[],p_expected_revision:0,p_article:{version:1,summary:'On noticing the everyday, learning a little, and making room for the ideas worth keeping.',tags:['Learning','Book notes'],cover:null,doc:{type:'doc',content:[
  paragraph('Some of the best ideas begin as small observations: a sentence from a book, a conversation, or something we notice during an ordinary day. Writing them down gives us a chance to return to them.'),
  {type:'heading',attrs:{level:2},content:[text('A thought worth keeping')]},
  paragraph('Reading is only the beginning. The useful part comes when an idea meets your own experience. A few honest sentences can tell you more than a page of copied highlights.'),
  {type:'blockquote',content:[paragraph('Make a little room for learning every day.')]},
  {type:'heading',attrs:{level:2},content:[text('Today’s small practice')]},
  {type:'bulletList',content:['Read a few pages without rushing.','Notice one idea that stays with you.','Write a short note in your own words.'].map(value=>({type:'listItem',content:[paragraph(value)]}))},
  paragraph('You do not have to capture everything. Start with one thing that feels worth remembering, and let tomorrow bring the next.')
]}}});
const post=await rpc('rb_publish_draft',{p_id:id,p_expected_revision:1});
console.log(`Local sample: http://127.0.0.1:4321/writing/${post.slug}/`);
