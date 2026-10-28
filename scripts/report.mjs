import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function summarize(events) {
  const start = events.findLastIndex(event => event.type === 'session.start');
  const session = start < 0 ? events : events.slice(start);
  const samples = session.filter(event => event.type === 'mic.sample');
  const background = samples.filter(event => event.panelFocused === false);
  return {
    sessionFound: start >= 0,
    serviceStopped: session.some(event => event.type === 'session.stop'),
    sampleSeconds: samples.length,
    withoutPanelFocusSeconds: background.length,
    backgroundSamplesWithSignal: background.filter(event => event.rmsDb > -60).length,
    backgroundSamplesSilencedByOS: background.filter(event => event.message.includes('OS silenced=true')).length,
    notificationPosts: session.filter(event => event.type === 'notification.posted').length,
    toneRequests: session.filter(event => event.type === 'tone.requested').length,
    speechRequests: session.filter(event => event.type === 'speech.requested').length,
    errors: session.filter(event => event.type.endsWith('.error') || event.type === 'speech.skipped').map(event => event.message),
    observations: Object.fromEntries(session.filter(event => event.type.startsWith('observation.')).map(event => [event.type.slice(12), event.message])),
    interpretation: 'Audio energy can be music or noise. Replay the recording to verify your voice. Posted notifications and sound requests require manual confirmation.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] || 'captures/events.jsonl';
  try {
    const contents = await readFile(path, 'utf8');
    const events = contents.split('\n').filter(Boolean).map(line => JSON.parse(line));
    console.log(JSON.stringify(summarize(events), null, 2));
  } catch {
    console.error('Cannot read the capture. Run bash scripts/quest.sh collect first, or pass a valid events.jsonl path.');
    process.exitCode = 1;
  }
}
