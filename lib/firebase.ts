import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, enableNetwork, disableNetwork, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// Initialize Firestore
// Temporarily disable persistent cache to debug connectivity issues
// TODO: Re-enable cache once connectivity is stable
let db: Firestore;
if (typeof window !== 'undefined') {
  // Browser: try persistent cache, fallback to default if it fails
  try {
    // Check if we're on Vercel (might have cache issues)
    const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    
    if (!isVercel) {
      // Use persistent cache on localhost
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      });
      console.log('Firestore initialized with persistent cache');
    } else {
      // On Vercel, use default Firestore (no persistent cache) to avoid connectivity issues
      db = getFirestore(app);
      console.log('Firestore initialized without persistent cache (Vercel)');
      
      // Force enable network connection on Vercel
      enableNetwork(db).then(() => {
        console.log('✅ Firestore network enabled');
        
        // Test connection immediately
        setTimeout(async () => {
          try {
            const testRef = doc(db, '_test', 'connection');
            await getDoc(testRef);
            console.log('✅ Firestore connection test passed');
          } catch (error: any) {
            console.error('❌ Firestore connection test failed:', error?.code, error?.message);
          }
        }, 500);
      }).catch((error) => {
        console.warn('⚠️ Could not enable Firestore network:', error);
      });
    }
  } catch (error) {
    // Fallback to regular Firestore if initialization fails
    console.warn('Failed to initialize Firestore with cache, using default:', error);
    db = getFirestore(app);
  }
} else {
  // Server-side: use regular Firestore
  db = getFirestore(app);
}

export { db };

export default app;


