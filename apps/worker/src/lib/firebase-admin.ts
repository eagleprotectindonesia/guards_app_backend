import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT_JSON is missing. Shift reminder push is disabled.');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK in worker:', error);
  }
}

export const firebaseAdmin = admin;
