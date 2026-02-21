// For Firebase JS SDK v7.20.0 and later, measurementId is optional
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA-PYkjHUdlhOv4S6jNVQjqePKjUH51Z3U",
  authDomain: "planli-schedule.firebaseapp.com",
  projectId: "planli-schedule",
  storageBucket: "planli-schedule.firebasestorage.app",
  messagingSenderId: "544271238980",
  appId: "1:544271238980:web:2abb2aa362ea7440597911",
  measurementId: "G-J4J8QCGVSJ"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);