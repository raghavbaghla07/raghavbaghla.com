import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { studioAuthOptions, requestSignInLink } from '../src/lib/studio-auth.ts';

test('recovery email request does not require a verifier from the original browser tab', async () => {
  let requestBody: Record<string,unknown> = {};
  const server = createServer(async (request,response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requestBody = JSON.parse(raw);
    response.writeHead(200,{'Content-Type':'application/json'}); response.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const values = new Map<string,string>();
    const auth = studioAuthOptions({getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}});
    const client = createClient(`http://127.0.0.1:${address.port}`,'publishable-test-key',{auth});
    const result = await client.auth.resetPasswordForEmail('owner@example.invalid',{redirectTo:'https://example.invalid/studio/?recovery=1'});
    assert.equal(result.error,null);
    assert.equal(requestBody.email,'owner@example.invalid');
    assert.ok(!requestBody.code_challenge,'Recovery must work without original-tab verifier');
    const linkResult = await requestSignInLink(client,' owner@example.invalid ','https://example.invalid');
    assert.equal(linkResult.error,null);
    assert.equal(requestBody.email,'owner@example.invalid');
    assert.equal(requestBody.create_user,false,'Studio sign-in must never register a new account');
    assert.ok(!requestBody.code_challenge,'Sign-in link must work without original-tab verifier');
    client.auth.stopAutoRefresh();
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
