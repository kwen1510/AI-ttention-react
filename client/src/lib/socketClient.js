import { io } from 'socket.io-client';

export function createAppSocket(options = {}) {
  return io({
    transports: ['websocket'],
    upgrade: false,
    timeout: 10000,
    reconnection: true,
    ...options
  });
}
