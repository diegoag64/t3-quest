import test from 'node:test';
import assert from 'node:assert/strict';
import { main, parsePairArgs } from '../scripts/pair.mjs';

const link = 't3code://app/pair#token=synthetic-code';

test('pair command consumes positional and named desktop links with an explicit server', async () => {
  for (const args of [[link, '--server', 'http://127.0.0.1:3773'], ['--url', link, '--server', 'http://127.0.0.1:3773', '--write']]) {
    let saved = false; const logs = [];
    await main(args, {
      ask() { assert.fail('Fully specified commands must not prompt.'); },
      async exchange(url, fetcher, server, { write }) {
        assert.equal(url, link); assert.equal(server, 'http://127.0.0.1:3773'); assert.equal(write, args.includes('--write'));
        return { token: 'synthetic-session' };
      },
      async save(session) { assert.equal(session.token, 'synthetic-session'); saved = true; }, log(message) { logs.push(message); },
    });
    assert.ok(saved); assert.ok(!logs.join('').includes('synthetic'));
  }
});

test('pair prompt accepts a desktop link and asks for only its missing server', async () => {
  const prompts = []; const answers = [link, ''];
  await main([], {
    async ask(prompt) { prompts.push(prompt); return answers.shift(); },
    async exchange(url, fetcher, server) { assert.equal(url, link); assert.equal(server, 'http://127.0.0.1:3773'); return {}; },
    async save() {}, log() {},
  });
  assert.equal(prompts.length, 2);
  const urlPrompts = [];
  await main(['--server', 'http://127.0.0.1:3773'], {
    async ask(prompt) { urlPrompts.push(prompt); return link; }, async exchange() { return {}; }, async save() {}, log() {},
  });
  assert.equal(urlPrompts.length, 1);
});

test('bad arguments and failed pairing never overwrite the existing session', async () => {
  for (const args of [['--server'], ['--url'], [link, link], ['--url', link, link], ['--unknown'], ['--server', 'one', '--server', 'two']]) {
    assert.throws(() => parsePairArgs(args), error => !error.message.includes('synthetic-code'));
  }
  await assert.rejects(main([link, '--server', 'http://127.0.0.1:3773'], {
    async exchange() { throw new Error('Server unreachable'); },
    async save() { assert.fail('Failed pairing must retain the previous session.'); }, log() {},
  }), /unreachable/);
});
