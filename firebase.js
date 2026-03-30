// Import the functions you need from the Firebase JS v9+ CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBXnPBavtJ6Ng7Fhcanz3cDgma7R7M3RQw",
  authDomain: "nurselink-3752d.firebaseapp.com",
  projectId: "nurselink-3752d",
  storageBucket: "nurselink-3752d.firebasestorage.app",
  messagingSenderId: "212609769985",
  appId: "1:212609769985:web:495ac1d4e5a556a37c1600",
  measurementId: "G-2VNGLRJLMP"
};  

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: true
});

// Expose Firebase globally for non-module code
window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;

console.log('Firebase initialized');