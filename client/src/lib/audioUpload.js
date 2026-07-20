const RETRYABLE_UPLOAD_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus'
];

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createAudioChunkId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function selectRecordingMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
  if (typeof MediaRecorderClass?.isTypeSupported !== 'function') {
    return null;
  }
  return AUDIO_MIME_CANDIDATES.find((mimeType) => MediaRecorderClass.isTypeSupported(mimeType)) || null;
}

export function audioChunkExtension(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg') || normalized.includes('opus')) return 'ogg';
  if (normalized.includes('wav')) return 'wav';
  return 'webm';
}

export async function uploadAudioChunk({
  blob,
  sessionCode,
  groupNumber,
  accessToken,
  chunkId = createAudioChunkId(),
  fetchImpl = globalThis.fetch,
  delay = wait,
  maxAttempts = 3
}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const formData = new FormData();
    formData.append('file', blob, `chunk_${chunkId}.${audioChunkExtension(blob.type)}`);
    formData.append('sessionCode', sessionCode);
    formData.append('groupNumber', String(groupNumber));
    formData.append('chunkId', chunkId);

    try {
      const response = await fetchImpl('/api/transcribe-chunk', {
        method: 'POST',
        headers: {
          'x-session-code': sessionCode,
          'x-group-number': String(groupNumber),
          Authorization: `Bearer ${accessToken || ''}`
        },
        body: formData
      });

      const payload = await response.json().catch(() => null);
      if (response.ok) {
        return { payload, attempts: attempt, chunkId };
      }

      const error = new Error(payload?.error || `Upload failed: ${response.status}`);
      error.status = response.status;
      throw error;
    } catch (error) {
      lastError = error;
      const retryable = !error?.status || RETRYABLE_UPLOAD_STATUSES.has(error.status);
      if (!retryable || attempt === maxAttempts) {
        break;
      }
      await delay(300 * (2 ** (attempt - 1)));
    }
  }

  throw lastError || new Error('Upload failed');
}

export async function uploadAsyncAudio({
  blob,
  shareId,
  groupNumber,
  displayName = '',
  chunkId = createAudioChunkId(),
  fetchImpl = globalThis.fetch,
  delay = wait,
  maxAttempts = 3
}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const formData = new FormData();
    formData.append('file', blob, `async_${chunkId}.${audioChunkExtension(blob.type)}`);
    formData.append('groupNumber', String(groupNumber));
    formData.append('displayName', displayName);
    formData.append('chunkId', chunkId);

    try {
      const response = await fetchImpl(`/api/async/join/${encodeURIComponent(shareId)}/upload`, {
        method: 'POST',
        body: formData
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) return { payload, attempts: attempt, chunkId };

      const error = new Error(payload?.error || `Upload failed (${response.status})`);
      error.status = response.status;
      throw error;
    } catch (error) {
      lastError = error;
      const retryable = !error?.status || RETRYABLE_UPLOAD_STATUSES.has(error.status);
      if (!retryable || attempt === maxAttempts) break;
      await delay(300 * (2 ** (attempt - 1)));
    }
  }

  throw lastError || new Error('Upload failed');
}
