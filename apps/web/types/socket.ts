import { Socket } from 'socket.io';

export interface SocketAuth {
  id: string;
  type: 'admin' | 'guard';
  name: string;
}

declare module 'socket.io' {
  interface Socket {
    auth?: SocketAuth;
  }
}
