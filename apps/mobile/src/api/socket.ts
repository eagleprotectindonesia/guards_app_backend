import { io, Socket } from 'socket.io-client';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import { BASE_URL } from './client';
import { storage, STORAGE_KEYS } from '../utils/storage';

let socket: Socket | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

export const getSocket = async () => {
  // If socket exists, return it even if it's currently disconnected 
  // (socket.io handles reconnection automatically)
  if (socket) {
    return socket;
  }

  const token = await storage.getItem(STORAGE_KEYS.TOKEN);

  if (!token) {
    return null;
  }

  socket = io(BASE_URL, {
    auth: {
      token,
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    // If reason is 'io server disconnect', we might need to manually reconnect
    if (reason === 'io server disconnect') {
      socket?.connect();
    }
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`Socket reconnection attempt: ${attempt}`);
  });

  socket.on('reconnect', (attempt) => {
    console.log(`Socket reconnected after ${attempt} attempts`);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
  });

  // Setup AppState listener to handle app background/foreground transitions
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {

      if (nextAppState === 'active') {
        // App has come to the foreground
        if (socket && !socket.connected) {
          socket.connect();
        }
      } else if (nextAppState === 'background') {
        // App has gone to the background
        // Socket.io will handle reconnection automatically when app resumes
        // We don't disconnect here to allow background message reception
      }
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  // Clean up AppState listener
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
};
