import 'socket.io';

export interface SocketAuth {
  id: string;
  type: 'admin' | 'employee';
  name: string;
}

declare module 'socket.io' {
  interface Socket {
    auth?: SocketAuth;
  }
}