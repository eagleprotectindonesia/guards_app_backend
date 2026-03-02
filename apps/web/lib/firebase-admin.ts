import * as admin from 'firebase-admin';

// Initialize the Firebase Admin App only if it hasn't been initialized yet
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT_JSON is missing. Firebase features will not work.');
    }
  } catch (error) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON or initialize Firebase Admin SDK:', error);
  }
}

export const firebaseAdmin = admin;
