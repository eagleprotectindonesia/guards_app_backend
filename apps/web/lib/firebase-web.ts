import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { getMessaging, isSupported, Messaging } from 'firebase/messaging';

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const getFirebaseWebConfig = (): FirebaseWebConfig | null => {
  const config: FirebaseWebConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };

  if (Object.values(config).some(value => !value)) {
    return null;
  }

  return config;
};

export function getFirebaseWebApp(): FirebaseApp | null {
  const config = getFirebaseWebConfig();

  if (!config) {
    return null;
  }

  return getApps().length ? getApp() : initializeApp(config);
}

export async function getFirebaseWebMessaging(): Promise<Messaging | null> {
  const app = getFirebaseWebApp();

  if (!app) {
    return null;
  }

  const supported = await isSupported();
  if (!supported) {
    return null;
  }

  return getMessaging(app);
}

export function getFirebaseWebVapidKey() {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
}
