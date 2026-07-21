const RETRYABLE_UPLOAD_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus'
];
export const MAX_PENDING_AUDIO_CHUNKS = 3;
export const TARGET_AUDIO_BITRATE = 64_000;

export function initialChunkStaggerMs(groupNumber) {
  const parsed = Number(groupNumber);
  return Number.isInteger(parsed) && parsed > 0 ? (parsed * 797) % 5_000 : 0;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createAudioChunkId(cryptoImpl = globalThis.crypto) {
  if (cryptoImpl?.randomUUID) {
    return cryptoImpl.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

export function hasAudibleSignal(samples, threshold = 0.0015) {
  if (!samples?.length) return false;
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  return Math.sqrt(energy / samples.length) >= threshold;
}

export async function createAudioActivityMonitor(stream) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass || !stream) return null;

  let context;
  try {
    context = new AudioContextClass();
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let audibleSamples = 0;
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      if (hasAudibleSignal(samples)) audibleSamples += 1;
    }, 100);

    return {
      hasSpeech: () => audibleSamples >= 2,
      reset: () => { audibleSamples = 0; },
      close: () => {
        clearInterval(timer);
        source.disconnect();
        return context.close().catch(() => {});
      }
    };
  } catch {
    await context?.close().catch(() => {});
    return null;
  }
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
