import type { Fiche } from "@veilleur/shared/fiche";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

import { db } from "@/firebase";

const FICHES = "fiches";

/** The fiche for `slug` (Firestore `fiches/{slug}`), or null if absent. */
export async function getFiche(slug: string, store: Firestore = db): Promise<Fiche | null> {
  const snap = await getDoc(doc(store, FICHES, slug));
  return snap.exists() ? (snap.data() as Fiche) : null;
}

/** Every fiche citing `date` (the article's publication date), unordered — the legacy Astro site
 * filters this client-side after rendering the full unfiltered grid; this queries Firestore
 * directly instead, so the client never downloads another article's fiches. */
export async function listFichesForArticle(date: string, store: Firestore = db): Promise<Fiche[]> {
  const q = query(collection(store, FICHES), where("used_in", "array-contains", date));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Fiche);
}
