import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.LIVE_APP_ORIGIN || 'https://ai-ttention.rafflesian.org';
const COOKIE_FILE = process.env.LIVE_TEACHER_COOKIE_FILE || '/tmp/aittention-prod-cookie.txt';
const SPEECH_FILE = process.env.LIVE_SPEECH_FILE || '/tmp/aittention-provider-speech.webm';
const SILENCE_FILE = process.env.LIVE_SILENCE_FILE || '/tmp/aittention-provider-silence.wav';
const CHECKBOX_FILE = process.env.LIVE_CHECKBOX_FILE || '/tmp/aittention-real-checklist.wav';
const EXPECTED_COMMIT = process.env.LIVE_EXPECTED_COMMIT;

if (process.env.LIVE_PRODUCTION_E2E !== 'true') {
  throw new Error('Set LIVE_PRODUCTION_E2E=true to run the destructive temporary-session test');
}
if (!/^[0-9a-f]{7,40}$/.test(EXPECTED_COMMIT || '')) {
  throw new Error('LIVE_EXPECTED_COMMIT is required');
}
for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const cookieLines = (await readFile(COOKIE_FILE, 'utf8'))
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#') || line.startsWith('#HttpOnly_'));
const cookieFields = cookieLines
  .map((line) => line.replace(/^#HttpOnly_/, '').split('\t'))
  .find((fields) => fields[5] === 'ai_tt_teacher') || [];
assert.equal(cookieFields.length >= 7, true, 'Teacher cookie jar is invalid');
const teacherCookie = `${cookieFields[5]}=${cookieFields[6]}`;

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const students = [];
const openClassrooms = new Set();
const openAsync = new Map();

async function requestJson(pathname, options = {}, expected = 200) {
  const response = await fetch(`${APP}${pathname}`, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  assert.equal(response.status, expected, `${pathname}: expected ${expected}, received ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

function teacherJson(pathname, options = {}, expected = 200) {
  return requestJson(pathname, {
    ...options,
    headers: {
      Origin: APP,
      Cookie: teacherCookie,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  }, expected);
}

async function createStudent() {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  assert.ok(data.user?.id && data.session?.access_token);
  students.push({ client, id: data.user.id, token: data.session.access_token });
  return students.at(-1);
}

async function subscribeStatus(client, topic) {
  const channel = client.channel(topic, { config: { private: true, broadcast: { self: false } } });
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('PROBE_TIMEOUT'), 10_000);
    channel.subscribe((next) => {
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(next)) {
        clearTimeout(timer);
        resolve(next);
      }
    });
  });
  await client.removeChannel(channel);
  return status;
}

async function createClassroom(mode) {
  const result = await teacherJson(`/api/new-session?mode=${mode}`, { method: 'POST' });
  assert.match(result.code, /^[A-Z0-9]{6}$/);
  assert.equal(result.pending, true);
  assert.ok(new Date(result.expiresAt).getTime() - Date.now() > 55 * 60_000);
  openClassrooms.add(result.code);
  const join = await teacherJson(`/api/session/${result.code}/join-token`, { method: 'POST' });
  return { ...result, joinToken: join.token };
}

async function joinStudent(session, group) {
  const student = await createStudent();
  const joined = await requestJson(`/api/session/${session.code}/student-join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student.token}`, Origin: APP },
    body: JSON.stringify({ group, token: session.joinToken })
  });
  await student.client.realtime.setAuth(student.token);
  return { ...student, group, joined };
}

async function startClassroom(session, mode) {
  const started = await teacherJson(`/api/session/${session.code}/start`, {
    method: 'POST',
    body: JSON.stringify({ interval: 5000, mode })
  });
  assert.ok(new Date(started.expiresAt).getTime() - Date.now() > 3.9 * 60 * 60_000);
}

function mimeFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.m4a' || extension === '.mp4') return 'audio/mp4';
  if (extension === '.ogg') return 'audio/ogg';
  return 'audio/webm';
}

async function upload(session, student, file, chunkId) {
  const form = new FormData();
  form.append('file', new Blob([await readFile(file)], { type: mimeFor(file) }), path.basename(file));
  form.append('joinToken', session.joinToken);
  form.append('sessionCode', session.code);
  form.append('groupNumber', String(student.group));
  form.append('chunkId', chunkId);
  return requestJson('/api/transcribe-chunk', {
    method: 'POST',
    headers: { Authorization: `Bearer ${student.token}`, Origin: APP },
    body: form
  });
}

async function stopClassroom(code) {
  const result = await teacherJson(`/api/session/${code}/stop`, { method: 'POST' });
  openClassrooms.delete(code);
  return result;
}

async function runSummary() {
  const session = await createClassroom('summary');
  const first = await joinStudent(session, 1);
  const second = await joinStudent(session, 2);
  assert.equal(await subscribeStatus(first.client, first.joined.realtime.groupTopic), 'SUBSCRIBED');
  assert.notEqual(await subscribeStatus(first.client, second.joined.realtime.groupTopic), 'SUBSCRIBED');
  assert.notEqual(
    await subscribeStatus(first.client, first.joined.realtime.studentTopic.replace(/:students$/, ':teacher')),
    'SUBSCRIBED'
  );
  await startClassroom(session, 'summary');
  const silence = await upload(session, second, SILENCE_FILE, `summarysilence${Date.now()}`);
  assert.equal(silence.skipped, true);
  assert.equal(silence.reason, 'No speech detected');
  const speech = await upload(session, first, SPEECH_FILE, `summaryspeech${Date.now()}`);
  assert.equal(speech.success, true);
  assert.ok(speech.transcript?.trim());
  assert.ok(speech.summary?.trim());
  assert.notEqual(speech.summary, 'Summarization failed');

  const forged = new FormData();
  forged.append('file', new Blob([await readFile(SPEECH_FILE)], { type: mimeFor(SPEECH_FILE) }), path.basename(SPEECH_FILE));
  forged.append('joinToken', session.joinToken);
  forged.append('sessionCode', session.code);
  forged.append('groupNumber', '1');
  forged.append('chunkId', `forgedgroup${Date.now()}`);
  await requestJson('/api/transcribe-chunk', {
    method: 'POST', headers: { Authorization: `Bearer ${second.token}`, Origin: APP }, body: forged
  }, 403);

  await stopClassroom(session.code);
  const postStop = await requestJson(`/api/session/${session.code}/student-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.token}`, Origin: APP },
    body: JSON.stringify({ event: 'recording', group: 1, token: session.joinToken })
  }, 404);
  assert.ok(postStop.error);
  assert.notEqual(await subscribeStatus(first.client, first.joined.realtime.groupTopic), 'SUBSCRIBED');
  const history = await teacherJson(`/api/history/sessions/${session.code}`);
  assert.ok(JSON.stringify(history).includes(speech.transcript.slice(0, 20)));
  return { code: session.code, speechWords: speech.transcript.trim().split(/\s+/).length, silenceSkipped: true };
}

async function runCheckbox() {
  const session = await createClassroom('checkbox');
  await teacherJson('/api/checkbox/session', {
    method: 'POST',
    body: JSON.stringify({
      sessionCode: session.code,
      interval: 5000,
      strictness: 2,
      scenario: 'Students explain when back titration is useful.',
      criteria: [
        { description: 'Explains why back titration is used', rubric: 'Mentions insoluble calcium carbonate or an unreliable direct reaction.' },
        { description: 'Links the method to an experimental decision', rubric: 'Gives a reason for choosing the method.' }
      ]
    })
  });
  const student = await joinStudent(session, 3);
  await startClassroom(session, 'checkbox');
  const result = await upload(session, student, CHECKBOX_FILE, `checkboxspeech${Date.now()}`);
  assert.equal(result.success, true);
  assert.equal(result.mode, 'checkbox');
  assert.ok(result.transcript?.trim());
  assert.ok(result.matches >= 1);
  const state = await teacherJson(`/api/checkbox/${session.code}`);
  assert.equal(state.criteriaWithProgress.length, 2);
  assert.equal(
    state.criteriaWithProgress.some((criterion) => criterion.groupProgress?.['3']?.status === 'green'),
    true
  );
  await stopClassroom(session.code);
  const history = await teacherJson(`/api/history/sessions/${session.code}`);
  assert.ok(JSON.stringify(history).includes(result.transcript.slice(0, 20)));
  return { code: session.code, speechWords: result.transcript.trim().split(/\s+/).length, matches: result.matches };
}

async function runAsync() {
  const created = await teacherJson('/api/async/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Production verification discussion',
      instructions: 'Explain the reasoning and decision.',
      feedbackPrompt: 'Give concise feedback on the reasoning.',
      maxGroupNumber: 4
    })
  }, 201);
  const session = created.session;
  openAsync.set(session.id, session.shareId);
  await requestJson(`/api/async/join/${session.shareId}/groups`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: APP },
    body: JSON.stringify({ groupNumber: 1, displayName: 'Production test group' })
  });
  const form = new FormData();
  form.append('file', new Blob([await readFile(SPEECH_FILE)], { type: mimeFor(SPEECH_FILE) }), path.basename(SPEECH_FILE));
  form.append('groupNumber', '1');
  form.append('chunkId', `asyncspeech${Date.now()}`);
  const result = await requestJson(`/api/async/join/${session.shareId}/upload`, { method: 'POST', headers: { Origin: APP }, body: form });
  assert.equal(result.success, true);
  assert.ok(result.transcript?.trim());
  assert.ok(result.report?.summary?.trim());
  await teacherJson(`/api/async/sessions/${session.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'closed' }) });
  openAsync.delete(session.id);
  const blocked = new FormData();
  blocked.append('file', new Blob([await readFile(SPEECH_FILE)], { type: mimeFor(SPEECH_FILE) }), path.basename(SPEECH_FILE));
  blocked.append('groupNumber', '1');
  await requestJson(`/api/async/join/${session.shareId}/upload`, { method: 'POST', headers: { Origin: APP }, body: blocked }, 403);
  return { id: session.id, speechWords: result.transcript.trim().split(/\s+/).length, closed: true };
}

async function runAbandoned() {
  const session = await createClassroom('summary');
  const stopped = await stopClassroom(session.code);
  assert.equal(stopped.discarded, true);
  await teacherJson(`/api/history/sessions/${session.code}`, {}, 404);
  return { code: session.code, discarded: true };
}

let failure;
let cleanupFailure;
try {
  const version = await requestJson('/version.json');
  assert.equal(version.shortCommit, EXPECTED_COMMIT.slice(0, 7));
  const identity = await teacherJson('/api/auth/me');
  assert.equal(identity.user?.email, 'ri.kwmachinelearning@gmail.com');
  const summary = await runSummary();
  const checkbox = await runCheckbox();
  const asynchronous = await runAsync();
  const abandoned = await runAbandoned();
  console.log(JSON.stringify({ version: version.shortCommit, summary, checkbox, asynchronous, abandoned }, null, 2));
} catch (error) {
  failure = error;
} finally {
  for (const code of openClassrooms) {
    try { await stopClassroom(code); } catch {}
  }
  for (const [id] of openAsync) {
    try {
      await teacherJson(`/api/async/sessions/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'closed' }) });
    } catch {}
  }
  for (const student of students) {
    try { await student.client.removeAllChannels(); } catch {}
    try { await student.client.realtime.disconnect(); } catch {}
    try {
      const { error } = await admin.auth.admin.deleteUser(student.id);
      if (error) throw error;
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  try { await teacherJson('/api/auth/logout', { method: 'POST' }); } catch (error) { cleanupFailure ??= error; }
}

if (failure) throw failure;
if (cleanupFailure) throw cleanupFailure;
