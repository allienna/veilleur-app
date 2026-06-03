import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

import { ALLOWED_OPERATOR_EMAIL } from "@/config";

// AC-7: firestore.rules gates `articles` reads to the allowed, verified operator and
// denies all client writes. Runs against the Firestore emulator (pnpm test:rules).
const RULES_PATH = fileURLToPath(new URL("../../firestore.rules", import.meta.url));

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "veilleur-app-rules-test",
    firestore: { rules: readFileSync(RULES_PATH, "utf8") },
  });
  // Seed an article with rules disabled (simulates the Minion's privileged write).
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "articles", "2026-06-01"), { date: "2026-06-01" });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

function ctxFor(email: string | null, verified: boolean) {
  if (!email) return env.unauthenticatedContext();
  return env.authenticatedContext("uid-1", { email, email_verified: verified });
}

describe("firestore.rules — articles", () => {
  it("allows the allowed, verified operator to read", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertSucceeds(getDoc(doc(db, "articles", "2026-06-01")));
  });

  it("denies a non-allowed email", async () => {
    const db = ctxFor("intruder@example.com", true).firestore();
    await assertFails(getDoc(doc(db, "articles", "2026-06-01")));
  });

  it("denies the allowed email when unverified", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, false).firestore();
    await assertFails(getDoc(doc(db, "articles", "2026-06-01")));
  });

  it("denies an unauthenticated reader", async () => {
    const db = ctxFor(null, false).firestore();
    await assertFails(getDoc(doc(db, "articles", "2026-06-01")));
  });

  it("denies client writes even for the allowed operator", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertFails(setDoc(doc(db, "articles", "2026-06-02"), { date: "2026-06-02" }));
  });

  it("denies reads on other collections (deny-by-default)", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertFails(getDoc(doc(db, "runs", "2026-06-01")));
  });
});
