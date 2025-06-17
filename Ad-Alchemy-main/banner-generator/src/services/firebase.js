// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCDx6KL-GZgJ4w-cxi0k2ynSNJlNf44Vww",
  authDomain: "ai-content-generator-179e8.firebaseapp.com",
  projectId: "ai-content-generator-179e8",
  storageBucket: "ai-content-generator-179e8.appspot.com",
  messagingSenderId: "392976380108",
  appId: "1:392976380108:web:5af3ab78fc2bee37281269",
  measurementId: "G-271QCQJVQG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, analytics, auth, db, storage };