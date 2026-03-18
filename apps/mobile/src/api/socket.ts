import { io, Socket } from 'socket.io-client';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import { BASE_URL } from './client';
import { storage, STORAGE_KEYS } from '../utils/storage';

let socket: Socket | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let socketCreationPromise: Promise<Socket | null> | null = null;

const shouldKeepSocketConnected = (appState: AppStateStatus) => appState === 'active';

const connectSocketIfEligible = () => {
  if (socket && !socket.connected && shouldKeepSocketConnected(AppState.currentState)) {
    socket.connect();
  }
};

const disconnectSocketForBackground = () => {
  if (socket?.connected) {
    socket.disconnect();
  }
};

export const getSocket = async () => {
  // If socket exists, return it even if it's currently disconnected
  if (socket) {
    return socket;
  }

  if (socketCreationPromise) {
    return socketCreationPromise;
  }

  socketCreationPromise = (async () => {
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
      reconnection: false,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected', { socketId: socket?.id ?? null });
    });

    socket.on('disconnect', reason => {
      console.log('[Socket] Disconnected', { reason, socketId: socket?.id ?? null });
      // If reason is 'io server disconnect', we might need to manually reconnect
      if (reason === 'io server disconnect' && shouldKeepSocketConnected(AppState.currentState)) {
        socket?.connect();
      }
    });

    socket.on('connect_error', err => {
      console.error('[Socket] Connection error', {
        message: err.message,
        name: err.name,
        description: (err as Error & { description?: unknown }).description ?? null,
        context: (err as Error & { context?: unknown }).context ?? null,
        type: (err as Error & { type?: unknown }).type ?? null,
        appState: AppState.currentState,
        socketActive: !!socket,
        connected: socket?.connected ?? false,
      });
    });

    // Setup AppState listener to handle app background/foreground transitions
    if (!appStateSubscription) {
      let previousState: AppStateStatus = AppState.currentState;

      appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
        if (previousState === 'background' && nextAppState === 'active') {
          connectSocketIfEligible();
        } else if (nextAppState === 'background') {
          disconnectSocketForBackground();
        }

        previousState = nextAppState;
      });
    }

    if (shouldKeepSocketConnected(AppState.currentState)) {
      socket.connect();
    }

    return socket;
  })();

  try {
    return await socketCreationPromise;
  } finally {
    socketCreationPromise = null;
  }
};

export const disconnectSocket = () => {
  socketCreationPromise = null;
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
