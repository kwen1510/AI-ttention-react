import { io } from 'socket.io-client';

export function createAppSocket(options = {}) {
  return io({
    transports: ['websocket', 'polling'],
    upgrade: true,
    timeout: 15000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    ...options
  });
}
