import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDiTZZADrop7FP46Y0eU6a1z9hpHdl2kEY",
  authDomain: "ambrosia-pickle-reservation.firebaseapp.com",
  projectId: "ambrosia-pickle-reservation",
  storageBucket: "ambrosia-pickle-reservation.firebasestorage.app",
  messagingSenderId: "42758142672",
  appId: "1:42758142672:web:0606248cc1eb2621c4fcd5",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

import { collection, addDoc } from "firebase/firestore";

// TEST - delete after confirming
addDoc(collection(db, "test"), { hello: "world", ts: new Date().toISOString() })
  .then(() => console.log("✅ Firebase write SUCCESS"))
  .catch((e) => console.error("❌ Firebase write FAILED:", e));