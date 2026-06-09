import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyChaWymkd5XlX5pvTWSigwUof11SXM5DWs",
  authDomain: "lift-app-13917.firebaseapp.com",
  projectId: "lift-app-13917",
  storageBucket: "lift-app-13917.firebasestorage.app",
  messagingSenderId: "1051687728666",
  appId: "1:1051687728666:web:2d456ef05ff19b9d0f03a3",
  measurementId: "G-553FQ36W0V"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);