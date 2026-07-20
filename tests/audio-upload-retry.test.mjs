import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audioChunkExtension,
  selectRecordingMimeType,
  uploadAsyncAudio,
  uploadAudioChunk
} from '../client/src/lib/audioUpload.js';

test('recorder selects MP4 on phones without WebM support', () => {
  const MobileMediaRecorder = {
    isTypeSupported: (mimeType) => mimeType === 'audio/mp4'
  };
  assert.equal(selectRecordingMimeType(MobileMediaRecorder), 'audio/mp4');
  assert.equal(audioChunkExtension('audio/mp4;codecs=mp4a.40.2'), 'm4a');
});

test('recorder lets the browser choose when no advertised format is supported', () => {
  const UnknownMediaRecorder = { isTypeSupported: () => false };
  assert.equal(selectRecordingMimeType(UnknownMediaRecorder), null);
});

test('audio upload retries transient failures with one stable idempotency key', async () => {
  const chunkIds = [];
  const delays = [];
  let calls = 0;

  const result = await uploadAudioChunk({
    blob: new Blob(['audio'], { type: 'audio/webm' }),
    sessionCode: 'ABC123',
    groupNumber: 2,
    accessToken: 'student-token',
    chunkId: 'stable-audio-chunk-id',
    delay: async (milliseconds) => delays.push(milliseconds),
    fetchImpl: async (_url, options) => {
      calls += 1;
      chunkIds.push(options.body.get('chunkId'));
      if (calls === 1) throw new TypeError('temporary network failure');
      if (calls === 2) return { ok: false, status: 503, json: async () => ({ error: 'provider unavailable' }) };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
  });

  assert.equal(result.attempts, 3);
  assert.deepEqual(chunkIds, ['stable-audio-chunk-id', 'stable-audio-chunk-id', 'stable-audio-chunk-id']);
  assert.deepEqual(delays, [300, 600]);
});

test('audio upload does not retry authentication failures', async () => {
  let calls = 0;
  await assert.rejects(
    () => uploadAudioChunk({
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      sessionCode: 'ABC123',
      groupNumber: 2,
      accessToken: 'bad-token',
      chunkId: 'non-retryable-chunk-id',
      delay: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return { ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) };
      }
    }),
    /forbidden/i
  );
  assert.equal(calls, 1);
});

test('asynchronous audio uses the negotiated extension and a stable retry key', async () => {
  const files = [];
  let calls = 0;
  const result = await uploadAsyncAudio({
    blob: new Blob(['mobile audio'], { type: 'audio/mp4' }),
    shareId: 'share/id',
    groupNumber: 3,
    chunkId: 'async-stable-chunk-id',
    delay: async () => {},
    fetchImpl: async (url, options) => {
      calls += 1;
      files.push({ url, file: options.body.get('file'), chunkId: options.body.get('chunkId') });
      if (calls === 1) throw new TypeError('network interruption');
      return { ok: true, status: 200, json: async () => ({ success: true, transcript: 'done' }) };
    }
  });

  assert.equal(result.attempts, 2);
  assert.equal(files[0].url, '/api/async/join/share%2Fid/upload');
  assert.equal(files[0].file.name, 'async_async-stable-chunk-id.m4a');
  assert.deepEqual(files.map((entry) => entry.chunkId), ['async-stable-chunk-id', 'async-stable-chunk-id']);
});
