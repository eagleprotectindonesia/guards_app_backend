import 'socket.io';

export interface SocketAuth {
  id: string;
  type: 'admin' | 'employee';
  name: string;
  tokenVersion?: number; // Used for single-device enforcement for employees
  clientType?: 'mobile' | 'pwa';
}

declare module 'socket.io' {
  interface Socket {
    auth?: SocketAuth;
  }
}