import { io, Socket } from 'socket.io-client';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import { BASE_URL } from './client';
import { storage, STORAGE_KEYS } from '../utils/storage';

let socket: Socket | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

const shouldKeepSocketConnected = (appState: AppStateStatus) => appState === 'active';

const connectSocketIfEligible = () => {
  if (socket && !socket.connected && shouldKeepSocketConnected(AppState.currentState)) {
    console.log('[Socket] Connecting socket for active app state');
    socket.connect();
  }
};

const disconnectSocketForBackground = () => {
  if (socket?.connected) {
    console.log('[Socket] Disconnecting socket for background app state');
    socket.disconnect();
  }
};

export const getSocket = async () => {
  // If socket exists, return it even if it's currently disconnected
  if (socket) {
    connectSocketIfEligible();
    return socket;
  }

  const token = await storage.getItem(STORAGE_KEYS.USER_TOKEN);

  if (!token) {
    return null;
  }

  socket = io(BASE_URL, {
    auth: {
      token,
    },
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', reason => {
    console.log('Socket disconnected:', reason);
    // If reason is 'io server disconnect', we might need to manually reconnect
    if (reason === 'io server disconnect' && shouldKeepSocketConnected(AppState.currentState)) {
      socket?.connect();
    }
  });

  socket.on('reconnect_attempt', attempt => {
    console.log(`Socket reconnection attempt: ${attempt}`);
  });

  socket.on('reconnect', attempt => {
    console.log(`Socket reconnected after ${attempt} attempts`);
  });

  socket.on('connect_error', err => {
    console.error('Socket connection error:', err);
  });

  // Setup AppState listener to handle app background/foreground transitions
  if (!appStateSubscription) {
    let previousState: AppStateStatus = AppState.currentState;

    appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (previousState === 'background' && nextAppState === 'active') {
        connectSocketIfEligible();
      } else if (previousState === 'active' && nextAppState === 'background') {
        disconnectSocketForBackground();
      }

      previousState = nextAppState;
    });
  }

  connectSocketIfEligible();

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
