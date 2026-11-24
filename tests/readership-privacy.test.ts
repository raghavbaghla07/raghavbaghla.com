import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceLabels, browserOptOut, campaignLabels, linkDestination, measurementHost, optedOut } from '../src/lib/readership.ts';

test('both browser and HTTP privacy signals suppress measurement', () => {
  assert.equal(browserOptOut({ doNotTrack:null, globalPrivacyControl:true }),true);
  assert.equal(browserOptOut({ doNotTrack:'1' }),true);
  assert.equal(browserOptOut({ doNotTrack:'0' }),false);
  for (const key of ['DNT','Sec-GPC']) assert.equal(optedOut(new Headers({[key]:'1'})),true);
  assert.equal(optedOut(new Headers()),false);
});

test('analytics accepts coarse labels and publisher-approved campaigns', () => {
  const headers=new Headers({'User-Agent':'Mozilla/5.0 (iPhone) Version/18 Mobile Safari/604','x-vercel-ip-country':'in','x-forwarded-for':'192.0.2.1'});
  assert.deepEqual(audienceLabels(headers),{country:'IN',device:'Mobile',browser:'Safari'});
  assert.deepEqual(audienceLabels(new Headers()),{country:null,device:null,browser:null});
  assert.deepEqual(campaignLabels('spring','Email','summer,spring'),{campaign:'spring',medium:'newsletter'});
  assert.deepEqual(campaignLabels('private-id','someone@example.org'),{campaign:null,medium:null});
  assert.equal(linkDestination('https://me:secret@example.org/people/alice?token=abc#frag'),'https://example.org');
  assert.equal(linkDestination('mailto:someone@example.org'),'mailto:');
  assert.equal(linkDestination('https://192.0.2.1/foo'),null);
  assert.equal(measurementHost('name@example.org'),null);
});
