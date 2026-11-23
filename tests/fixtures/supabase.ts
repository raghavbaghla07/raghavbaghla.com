/** LOCAL TEST ONLY. Fake authentication for browser QA. Never deploy this server. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const owner='11111111-1111-4111-8111-111111111111';
const user={id:owner,aud:'authenticated',role:'authenticated',email:'owner@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:owner,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+86400})}.local-test-only`;
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth,storage to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;`);
await db.exec(await readFile(new URL('../../supabase/migrations/202611200001_private_editor.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/202611200002_article_editor.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/202611220001_article_engagement.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/202611230001_readership.sql',import.meta.url),'utf8'));
await db.query('insert into public.rb_studio_owners values($1)',[owner]);
const objects=new Map<string,{bytes:Buffer;type:string}>();
const signed=new Map<string,string>();
let queue=Promise.resolve();

createServer((req,res)=>{
  const run=async()=>{
    const origin=req.headers.origin;
    if(origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)){res.writeHead(403);res.end();return;}
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,x-upsert,cache-control,x-supabase-api-version,prefer,range');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers','content-range');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const send=(value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      const url=new URL(req.url!,'http://127.0.0.1:54555');
      const route=decodeURIComponent(url.pathname);
      const chunks:Buffer[]=[]; for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const raw=Buffer.concat(chunks);
      const isOwner=req.headers.authorization===`Bearer ${token}`;
      const json=()=>raw.length?JSON.parse(raw.toString()):{};
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[isOwner?owner:'']);
      await db.exec(`set role ${isOwner?'authenticated':'anon'}`);
      if(route==='/auth/v1/token'){
        const body=json();
        if((body.email!=='owner@example.invalid'||body.password!=='qa-only') && !(url.searchParams.get('grant_type')==='refresh_token'&&body.refresh_token==='local-qa-refresh'))return send({message:'Invalid local QA credentials'},400);
        return send({access_token:token,refresh_token:'local-qa-refresh',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,token_type:'bearer',user});
      }
      if(route==='/auth/v1/user')return isOwner?send(user):send({message:'No local QA session'},401);
      if(route==='/auth/v1/logout'||route==='/auth/v1/recover')return send({});
      if(route.startsWith('/rest/v1/rpc/')){
        const args=json(); let sql:string; let values:unknown[];
        switch(route.split('/').pop()){
          case 'rb_post_engagement':return send((await db.query('select * from public.rb_post_engagement($1,$2)',[args.p_post_id,args.p_visitor_id])).rows);
          case 'rb_set_post_like':await db.query('select public.rb_set_post_like($1,$2,$3)',[args.p_post_id,args.p_visitor_id,args.p_liked]);return send(null);
          case 'rb_submit_comment':return send((await db.query<{id:string}>('select public.rb_submit_comment($1,$2,$3,$4) as id',[args.p_post_id,args.p_visitor_id,args.p_display_name,args.p_body])).rows[0].id);
          case 'rb_list_comments':return send((await db.query('select * from public.rb_list_comments($1,$2)',[args.p_post_id,args.p_offset])).rows);
          case 'rb_review_comments':return send((await db.query('select * from public.rb_review_comments($1,$2)',[args.p_post_id,args.p_offset ?? 0])).rows);
          case 'rb_moderate_comment':await db.query('select public.rb_moderate_comment($1,$2)',[args.p_comment_id,args.p_status]);return send(null);
          case 'rb_feed':return send((await db.query<{ok:boolean}>('select public.rb_feed($1,$2) as ok',[args.p_token,args.p_action])).rows[0].ok);
          case 'rb_visit':await db.query('select public.rb_visit($1,$2,$3,$4,$5,$6,$7,$8,$9)',[args.p_id,args.p_visitor,args.p_page,args.p_post,args.p_seconds,args.p_depth,args.p_source,args.p_click,args.p_destination]);return send(null);
          case 'rb_readership':return send((await db.query<{report:unknown}>('select public.rb_readership($1) as report',[args.p_days])).rows[0].report);
          case 'rb_is_owner':return send((await db.query<{value:boolean}>('select public.rb_is_owner() as value')).rows[0].value);
          case 'rb_save_draft':sql='select * from public.rb_save_draft($1,$2,$3,$4,$5)';values=[args.p_id,args.p_title,args.p_body,JSON.stringify(args.p_images),args.p_expected_revision];break;
          case 'rb_save_article':sql='select * from public.rb_save_article($1,$2,$3,$4,$5,$6)';values=[args.p_id,args.p_title,args.p_body,JSON.stringify(args.p_images),JSON.stringify(args.p_article),args.p_expected_revision];break;
          case 'rb_publish_draft':sql='select * from public.rb_publish_draft($1,$2)';values=[args.p_id,args.p_expected_revision];break;
          case 'rb_unpublish_post':await db.query('select public.rb_unpublish_post($1)',[args.p_id]);return send(null);
          default:return send({message:'Unknown RPC'},404);
        }
        return send((await db.query(sql,values)).rows[0]);
      }
      if(route==='/rest/v1/rb_drafts'||route==='/rest/v1/rb_posts'){
        const table=route.endsWith('rb_posts')?'rb_posts':'rb_drafts';
        let sql=`select * from public.${table}`;const values:unknown[]=[];
        const slug=url.searchParams.get('slug');if(slug?.startsWith('eq.')&&table==='rb_posts'){sql+=' where slug=$1';values.push(slug.slice(3));}
        const order=url.searchParams.get('order');if(order==='updated_at.desc'||order==='published_at.desc')sql+=` order by ${order.split('.')[0]} desc`;
        const result=await db.query(sql,values);res.setHeader('Content-Range',`0-${Math.max(0,result.rows.length-1)}/${result.rows.length}`);return send(result.rows);
      }
      const storage=route.match(/^\/storage\/v1\/object\/(sign\/|authenticated\/)?rb-studio-images\/(.+)$/);
      if(storage){
        const [,kind,path]=storage;
        if(req.method==='POST'&&kind==='sign/'){
          const result=await db.query('select 1 from storage.objects where bucket_id=$1 and name=$2',['rb-studio-images',path]);
          if(!result.rows.length)return send({message:'Object not found'},404);
          const key=randomUUID();signed.set(key,path);return send({signedURL:`/object/sign/rb-studio-images/${path}?token=${key}`});
        }
        if(req.method==='POST'&&!kind){
          let bytes=raw;let type=req.headers['content-type']??'application/octet-stream';
          if(type.startsWith('multipart/form-data')){
            const request=new Request('http://127.0.0.1',{method:'POST',headers:{'Content-Type':type},body:raw});
            const form=await request.formData();const file=Array.from(form.values()).find(value=>typeof value!=='string') as File|undefined;
            if(!file)throw new Error('Missing file');bytes=Buffer.from(await file.arrayBuffer());type=file.type;
          }
          if(bytes.length>8388608||!['image/jpeg','image/png','image/webp'].includes(type))throw new Error('Invalid image limits');
          await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['rb-studio-images',path]);objects.set(path,{bytes,type});return send({Key:`rb-studio-images/${path}`,Id:randomUUID()});
        }
        if(req.method==='GET'){
          const signature=url.searchParams.get('token');const signedAccess=kind==='sign/'&&!!signature&&signed.get(signature)===path;
          const visible=signedAccess||(await db.query('select 1 from storage.objects where bucket_id=$1 and name=$2',['rb-studio-images',path])).rows.length>0;
          const object=objects.get(path);if(!visible||!object)return send({message:'Object not found'},404);
          res.writeHead(200,{'Content-Type':object.type});res.end(object.bytes);return;
        }
      }
      send({message:'Unknown local QA endpoint'},404);
    }catch(error){send({message:error instanceof Error?error.message:String(error)},400);}
  };
  queue=queue.then(run,run).catch(error=>{console.error(error);if(!res.headersSent)res.writeHead(500);res.end();});
}).listen(54555,'127.0.0.1',()=>console.log('LOCAL TEST ONLY Supabase fixture: http://127.0.0.1:54555 — owner@example.invalid / qa-only'));
