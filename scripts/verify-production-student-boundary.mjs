import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY are required');
}

const student = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let syntheticUserId;
let unauthorizedChannel;
let probeError;
const result = {
  anonymousSignIn: false,
  protectedTableReadDenied: false,
  unauthorizedPrivateRealtimeDenied: false,
  syntheticUserDeleted: false
};

try {
  const { data, error } = await student.auth.signInAnonymously();
  if (error) throw error;
  syntheticUserId = data.user?.id;
  if (!syntheticUserId || !data.session?.access_token) {
    throw new Error('Anonymous sign-in returned an incomplete session');
  }
  result.anonymousSignIn = true;

  const { error: tableError } = await student.from('sessions').select('id').limit(1);
  if (!tableError) {
    throw new Error('Anonymous browser identity unexpectedly queried protected sessions');
  }
  result.protectedTableReadDenied = true;

  await student.realtime.setAuth(data.session.access_token);
  unauthorizedChannel = student.channel('session:UNAUTHORIZED-PROBE', {
    config: { broadcast: { self: false }, private: true }
  });
  const realtimeStatus = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('PROBE_TIMEOUT'), 10_000);
    unauthorizedChannel.subscribe((status) => {
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
  if (realtimeStatus === 'SUBSCRIBED') {
    throw new Error('Anonymous identity unexpectedly subscribed to an unauthorized private topic');
  }
  if (realtimeStatus === 'PROBE_TIMEOUT') {
    throw new Error('Private Realtime authorization probe did not return a conclusive status');
  }
  result.unauthorizedPrivateRealtimeDenied = true;
} catch (error) {
  probeError = error;
} finally {
  if (unauthorizedChannel) {
    const removal = await student.removeChannel(unauthorizedChannel);
    if (removal === 'error' && !probeError) {
      probeError = new Error('Failed to remove the private Realtime probe channel');
    }
  }
  await student.realtime.disconnect();
  if (syntheticUserId) {
    const { error } = await admin.auth.admin.deleteUser(syntheticUserId);
    if (error) {
      probeError ??= error;
    } else {
      result.syntheticUserDeleted = true;
    }
  }
}

if (probeError) throw probeError;

console.log(JSON.stringify(result, null, 2));
