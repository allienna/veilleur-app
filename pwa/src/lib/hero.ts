import { ASTRO_IMAGES_BASE } from "@/config";

/** Resolve a hero image filename to its public Astro URL (F-009 Q5). Firebase-free so
 *  presentational components can import it without pulling in the Firestore SDK. */
export function heroUrl(image: string): string {
  return `${ASTRO_IMAGES_BASE}/${image}`;
}
