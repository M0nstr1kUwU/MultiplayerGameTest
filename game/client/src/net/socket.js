import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin);

export function createGameSocket() {
  return io(SERVER_URL, {
    withCredentials: true,
    transports: ['websocket']
  });
}
