import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket = io({
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
  socket.on('connect', () => socket?.emit('join-household'));
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
