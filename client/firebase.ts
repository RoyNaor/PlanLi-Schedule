// For Firebase JS SDK v7.20.0 and later, measurementId is optional
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "REMOVED_FIREBASE_API_KEY",
  authDomain: "planli-schedule.firebaseapp.com",
  projectId: "planli-schedule",
  storageBucket: "planli-schedule.firebasestorage.app",
  messagingSenderId: "REMOVED_SENDER_ID",
  appId: "1:REMOVED_SENDER_ID:web:2abb2aa362ea7440597911",
  measurementId: "REMOVED_MEASUREMENT_ID"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);