import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

import { FIREBASE_CONFIG } from "@/config";

// Single Firebase app + Auth + Firestore handles (F-009 AD-3). browserLocalPersistence
// keeps the operator signed in across reloads (sign in once, FR-2).
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

export const auth = getAuth(app);
void setPersistence(auth, browserLocalPersistence);

// IndexedDB-backed Firestore cache so the last-known article survives a reload and an
// offline cold open serves cached content (AC-10). Workbox cannot cache Firestore's
// WebChannel/RPC traffic, so this — not the service worker — is the offline-reads boundary.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
