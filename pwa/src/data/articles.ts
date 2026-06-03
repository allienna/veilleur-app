import type { Article } from "@veilleur/shared/article";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  type Firestore,
} from "firebase/firestore";

import { db } from "@/firebase";

export { heroUrl } from "@/lib/hero";

const ARTICLES = "articles";

/** The published article for `date` (Firestore `articles/{date}`), or null if absent. */
export async function getArticle(date: string, store: Firestore = db): Promise<Article | null> {
  const snap = await getDoc(doc(store, ARTICLES, date));
  return snap.exists() ? (snap.data() as Article) : null;
}

/** The most recent published articles, newest first (FR-3; ≥7, up to ~30). */
export async function listRecentArticles(
  max = 30,
  store: Firestore = db,
): Promise<Article[]> {
  const q = query(collection(store, ARTICLES), orderBy("date", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Article);
}
