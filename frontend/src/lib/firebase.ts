import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBw46lWRH-PZz7mmDlDMEM554aiXESqh4s",
  authDomain: "arbs-d76ae.firebaseapp.com",
  databaseURL: "https://arbs-d76ae-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "arbs-d76ae",
  storageBucket: "arbs-d76ae.firebasestorage.app",
  messagingSenderId: "115711408673",
  appId: "1:115711408673:web:c64114c90ea618da7a4160"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);