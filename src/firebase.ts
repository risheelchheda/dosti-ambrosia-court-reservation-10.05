import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDiTZZADrop7FP46Y0eU6a1z9hpHdl2kEY",
  authDomain: "ambrosia-pickle-reservation.firebaseapp.com",
  projectId: "ambrosia-pickle-reservation",
  storageBucket: "ambrosia-pickle-reservation.firebasestorage.app",
  messagingSenderId: "42758142672",
  appId: "1:42758142672:web:0606248cc1eb2621c4fcd5",
  measurementId: "G-DVQ7T20H85"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);