import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { FIREBASE_CONFIG } from "@/config";

// Single Firebase app + Auth + Firestore handles (F-009 AD-3). browserLocalPersistence
// keeps the operator signed in across reloads (sign in once, FR-2).
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

export const auth = getAuth(app);
void setPersistence(auth, browserLocalPersistence);

export const db = getFirestore(app);
