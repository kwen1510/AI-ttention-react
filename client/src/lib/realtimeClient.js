import { getSupabaseClient } from '../config/supabaseClient.js';

export const REALTIME_EVENTS = Object.freeze({
  ADMIN_UPDATE: 'admin_update',
  CHECKBOX_UPDATE: 'checkbox_update',
  CHECKLIST_STATE: 'checklist_state',
  RECORD_NOW: 'record_now',
  SESSION_ENDED: 'session_ended',
  STOP_RECORDING: 'stop_recording',
  STUDENT_JOINED: 'student_joined',
  STUDENT_LEFT: 'student_left',
  SUMMARY_STATE: 'summary_state',
  TRANSCRIPTION_AND_SUMMARY: 'transcription_and_summary',
  UPLOAD_ERROR: 'upload_error',
  UPLOAD_STATUS: 'upload_status'
});

export function normalizeSessionCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function normalizeGroupNumber(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 99 ? parsed : null;
}

export function buildSessionRealtimeTopic(sessionCode) {
  const serverTopic = String(sessionCode || '').trim();
  if (!serverTopic.startsWith('classroom:')) {
    throw new Error('A server-issued realtime topic is required');
  }
  return serverTopic;
}

export function buildGroupRealtimeTopic(sessionCode, groupNumber) {
  const parsedGroup = normalizeGroupNumber(groupNumber);
  if (!parsedGroup) {
    throw new Error('Group number is required');
  }

  return `${buildSessionRealtimeTopic(sessionCode)}:group:${parsedGroup}`;
}

export function unwrapRealtimePayload(message) {
  const envelope = message?.payload && typeof message.payload === 'object'
    ? message.payload
    : message;

  return {
    type: envelope?.type || message?.event,
    sessionCode: envelope?.sessionCode,
    groupNumber: envelope?.groupNumber,
    timestamp: envelope?.timestamp,
    payload: envelope?.payload ?? message?.payload ?? {}
  };
}

let realtimeIdentityPromise = null;

export async function getRealtimeIdentitySession() {
  const supabase = getSupabaseClient();
  const existing = await supabase.auth.getSession();
  if (existing.data?.session?.access_token) return existing.data.session;

  if (!realtimeIdentityPromise) {
    realtimeIdentityPromise = supabase.auth.signInAnonymously()
      .then(({ data, error }) => {
        if (error || !data?.session?.access_token) {
          throw error || new Error('Supabase anonymous Auth did not return a session');
        }
        return data.session;
      })
      .finally(() => {
        realtimeIdentityPromise = null;
      });
  }
  return realtimeIdentityPromise;
}

export function subscribeToRealtimeTopics({ topics, accessToken, onEvent, onStatus }) {
  const supabase = getSupabaseClient();
  const uniqueTopics = [...new Set((topics || []).filter(Boolean))];
  const channels = [];
  let disposed = false;

  void (async () => {
    if (!accessToken) throw new Error('A server-issued Realtime access token is required');
    await supabase.realtime.setAuth(accessToken);
    if (disposed) return;

    uniqueTopics.forEach((topic) => {
      const channel = supabase
        .channel(topic, {
          config: {
            broadcast: { self: false },
            private: true
          }
        })
        .on('broadcast', { event: '*' }, (message) => {
          onEvent?.(unwrapRealtimePayload(message), topic);
        });

      channel.subscribe((status, error) => {
        onStatus?.({ topic, status, error });
      });
      channels.push(channel);
    });
  })().catch((error) => {
    onStatus?.({ topic: null, status: 'CHANNEL_ERROR', error });
  });

  return () => {
    disposed = true;
    channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
  };
}
