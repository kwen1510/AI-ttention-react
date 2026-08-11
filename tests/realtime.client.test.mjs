import test from 'node:test';
import assert from 'node:assert/strict';

import { subscribeToRealtimeTopics } from '../client/src/lib/realtimeClient.js';

test('Realtime subscriptions recover after a transient channel error', async () => {
  const channels = [];
  const removed = [];
  const statuses = [];
  const client = {
    realtime: { setAuth: async () => undefined },
    channel(topic) {
      const channel = {
        topic,
        callback: null,
        on() { return channel; },
        subscribe(callback) {
          channel.callback = callback;
          channels.push(channel);
          return channel;
        }
      };
      return channel;
    },
    async removeChannel(channel) {
      removed.push(channel);
    }
  };

  const unsubscribe = subscribeToRealtimeTopics({
    topics: ['classroom:test:teacher'],
    accessToken: 'test-token',
    supabaseClient: client,
    retryBaseMs: 1,
    onStatus: ({ status }) => statuses.push(status)
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(channels.length, 1);
  channels[0].callback('CHANNEL_ERROR', new Error('MissingPartition'));
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(removed.length, 1);
  assert.equal(channels.length, 2);
  channels[1].callback('SUBSCRIBED');
  assert.deepEqual(statuses, ['CHANNEL_ERROR', 'SUBSCRIBED']);

  unsubscribe();
  assert.equal(removed.length, 2);
});
