import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { makeServer, transcribe, validateWav } from '../bridge/server.mjs';
import { summarize } from '../scripts/report.mjs';

function wav() {
  const audio = Buffer.alloc(3244);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(3200, 40);
  return audio;
}

test('HTTP bridge requires its own token and refuses browser origins', async t => {
  let completions = 0;
  const server = makeServer({ token: 'test-bridge-token', state: () => ({ mode: 'demo', threads: [], events: [] }), demoComplete: () => completions++ });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); server.closeAllConnections(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/state')).status, 401);
  const headers = { Authorization: 'Bearer test-bridge-token' };
  assert.equal((await fetch(base + '/api/state', { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
  const state = await fetch(base + '/api/state', { headers });
  assert.equal(state.status, 200); assert.equal((await state.json()).mode, 'demo');
  assert.equal((await fetch(base + '/api/demo/complete', { method: 'POST', headers })).status, 200);
  assert.equal(completions, 1);
  assert.equal((await fetch(base + '/api/threads/send', { method: 'POST', headers })).status, 404);
  assert.equal((await fetch(base + '/api/transcribe', { method: 'POST', headers: { ...headers, 'Content-Type': 'audio/wav' }, body: wav() })).status, 503);
  assert.equal((await fetch(base + '/api/transcribe', { method: 'POST', headers: { ...headers, 'Content-Type': 'audio/wav' }, body: Buffer.from('not wav') })).status, 400);
});

test('transcription forwards valid WAV only when explicitly configured', async () => {
  validateWav(wav());
  const corrupt = wav(); corrupt.writeUInt32LE(12345, 40);
  assert.throws(() => validateWav(corrupt));
  await assert.rejects(transcribe(wav(), {}), /TRANSCRIPTION_URL/);
  const result = await transcribe(wav(), { transcriptionUrl: 'http://localhost:8080/v1/audio/transcriptions', transcriptionKey: 'test-key' }, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.body.get('file').size, 3244);
    assert.equal(options.body.get('model'), 'whisper-1');
    return Response.json({ text: 'The headset microphone worked.' });
  });
  assert.equal(result.text, 'The headset microphone worked.');
});

test('report distinguishes background audio energy from proof of speech and banner delivery', () => {
  const report = summarize([
    { type: 'session.start' },
    { type: 'mic.sample', panelFocused: true, rmsDb: -20, message: 'OS silenced=false' },
    { type: 'mic.sample', panelFocused: false, rmsDb: -20, message: 'OS silenced=false' },
    { type: 'mic.sample', panelFocused: false, rmsDb: -96, message: 'OS silenced=true' },
    { type: 'notification.posted' },
    { type: 'session.stop' },
    { type: 'observation.notification', message: 'No' },
  ]);
  assert.equal(report.withoutPanelFocusSeconds, 2);
  assert.equal(report.backgroundSamplesWithSignal, 1);
  assert.equal(report.backgroundSamplesSilencedByOS, 1);
  assert.equal(report.notificationPosts, 1);
  assert.equal(report.observations.notification, 'No');
  assert.equal(report.serviceStopped, true);
});
