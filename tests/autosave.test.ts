import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Autosave } from '../src/lib/autosave.ts';

test('manual flush and changes during a save serialize without dropping the newer save', async () => {
  let release!: () => void;
  let count = 0;
  let running = 0;
  let maximum = 0;
  const queue = new Autosave(async () => {
    maximum = Math.max(maximum, ++running);
    count++;
    if (count === 1) await new Promise<void>(resolve => release = resolve);
    running--;
  }, () => {}, 10000);
  queue.schedule();
  const first = queue.flush();
  await Promise.resolve();
  queue.schedule();
  const second = queue.flush();
  release();
  await Promise.all([first, second]);
  assert.equal(count, 2);
  assert.equal(maximum, 1);
  queue.cancel();
});

test('a save conflict pauses subsequent automatic saves until a draft is reopened', async () => {
  let count = 0;
  const errors: unknown[] = [];
  const queue = new Autosave(async () => { count++; throw new Error('Revision conflict'); }, error => errors.push(error), 1);
  queue.schedule();
  await assert.rejects(queue.flush(), /conflict/);
  queue.schedule();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(count, 1);
  assert.equal(queue.paused, true);
  assert.equal(errors.length, 1);
  queue.cancel();
  assert.equal(queue.paused, false);
});

test('cancelling queued work never creates an automatic save', async () => {
  let count = 0;
  const queue = new Autosave(async () => { count++; }, () => {}, 1);
  queue.schedule(); queue.cancel();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(count, 0);
});
