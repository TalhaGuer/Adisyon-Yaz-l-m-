// Firebase initialization (modular SDK)
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "BURAYA_KENDI_APİ_KEYİNİ_YAZ",
  authDomain: "PROJENIN_AUTH_DOMAİNİ",
  projectId: "PROJENIN_PROJECT_IDSİ",
  storageBucket: "PROJENIN_STORAGE_BUCKETİ",
  messagingSenderId: "MESSAGİNG_SENDER_ID",
  appId: "APP_IDSİ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { app, db, auth, storage };
