import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
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
  // Seed an article + a run and one step child with rules disabled (simulates the Minion's
  // privileged writes).
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "articles", "2026-06-01"), { date: "2026-06-01" });
    await setDoc(doc(ctx.firestore(), "fiches", "some-source"), {
      slug: "some-source",
      used_in: ["2026-06-01"],
    });
    await setDoc(doc(ctx.firestore(), "runs", "2026-06-01"), {
      runId: "01J0",
      date: "2026-06-01",
      status: "running",
    });
    await setDoc(doc(ctx.firestore(), "runs", "2026-06-01", "steps", "gmail"), {
      name: "gmail",
      status: "success",
    });
    // F-012: seed a subscription owned by the allowed operator and one owned by someone else,
    // so the ownership-scoped read/delete rules can be exercised.
    await setDoc(doc(ctx.firestore(), "pushSubscriptions", "own"), {
      endpoint: "https://push.example/own",
      keys: { p256dh: "p", auth: "a" },
      operatorEmail: ALLOWED_OPERATOR_EMAIL,
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    await setDoc(doc(ctx.firestore(), "pushSubscriptions", "other"), {
      endpoint: "https://push.example/other",
      keys: { p256dh: "p", auth: "a" },
      operatorEmail: "intruder@example.com",
      createdAt: "2026-06-01T00:00:00.000Z",
    });
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
    await assertFails(getDoc(doc(db, "locks", "minion")));
  });
});

// F-016: `fiches/{slug}` is readable by the allowed, verified operator (the reader surface behind
// an article's "Consulter toutes les analyses de cet article" CTA) and never client-writable.
describe("firestore.rules — fiches", () => {
  it("allows the allowed, verified operator to read", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertSucceeds(getDoc(doc(db, "fiches", "some-source")));
  });

  it("denies a non-allowed email", async () => {
    const db = ctxFor("intruder@example.com", true).firestore();
    await assertFails(getDoc(doc(db, "fiches", "some-source")));
  });

  it("denies client writes even for the allowed operator", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertFails(setDoc(doc(db, "fiches", "another-source"), { slug: "another-source" }));
  });
});

// F-011 FR-D1/FR-D2/FR-F1: `runs/{date}` and its `steps/{step}` subcollection are readable by the
// allowed, verified operator (the supervision listener) and never client-writable.
describe("firestore.rules — runs", () => {
  it("allows the allowed, verified operator to read a run", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertSucceeds(getDoc(doc(db, "runs", "2026-06-01")));
  });

  it("allows the allowed, verified operator to read a step child", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertSucceeds(getDoc(doc(db, "runs", "2026-06-01", "steps", "gmail")));
  });

  it("denies a non-allowed email", async () => {
    const db = ctxFor("intruder@example.com", true).firestore();
    await assertFails(getDoc(doc(db, "runs", "2026-06-01")));
  });

  it("denies the allowed email when unverified", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, false).firestore();
    await assertFails(getDoc(doc(db, "runs", "2026-06-01")));
  });

  it("denies an unauthenticated reader", async () => {
    const db = ctxFor(null, false).firestore();
    await assertFails(getDoc(doc(db, "runs", "2026-06-01")));
  });

  it("denies client writes to a run even for the allowed operator", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertFails(setDoc(doc(db, "runs", "2026-06-02"), { date: "2026-06-02" }));
  });

  it("denies client writes to a step child even for the allowed operator", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertFails(
      setDoc(doc(db, "runs", "2026-06-01", "steps", "jina"), { name: "jina", status: "running" }),
    );
  });
});

// F-012 FR-3/AD-5: `pushSubscriptions/{id}` is the first client-writable collection. The allowed,
// verified operator may create/read/update/delete only docs whose `operatorEmail` is the allowed
// email; everyone else (and the operator on a doc claiming another owner) is denied.
describe("firestore.rules — pushSubscriptions", () => {
  const ownDoc = (over: Record<string, unknown> = {}) => ({
    endpoint: "https://push.example/new",
    keys: { p256dh: "p", auth: "a" },
    operatorEmail: ALLOWED_OPERATOR_EMAIL,
    createdAt: "2026-06-03T00:00:00.000Z",
    ...over,
  });

  it("allows the operator to create a subscription it owns", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertSucceeds(setDoc(doc(db, "pushSubscriptions", "create-own"), ownDoc()));
  });

  it("denies creating a subscription claiming another owner", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertFails(
      setDoc(doc(db, "pushSubscriptions", "create-spoof"), ownDoc({ operatorEmail: "intruder@example.com" })),
    );
  });

  it("denies a non-allowed email from creating any subscription", async () => {
    const db = ctxFor("intruder@example.com", true).firestore();
    await assertFails(
      setDoc(doc(db, "pushSubscriptions", "intruder-doc"), ownDoc({ operatorEmail: "intruder@example.com" })),
    );
  });

  it("denies the allowed email when unverified", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, false).firestore();
    await assertFails(setDoc(doc(db, "pushSubscriptions", "unverified-doc"), ownDoc()));
  });

  it("denies an unauthenticated writer", async () => {
    const db = ctxFor(null, false).firestore();
    await assertFails(setDoc(doc(db, "pushSubscriptions", "anon-doc"), ownDoc()));
  });

  it("allows the operator to read and delete a subscription it owns", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertSucceeds(getDoc(doc(db, "pushSubscriptions", "own")));
    await assertSucceeds(deleteDoc(doc(db, "pushSubscriptions", "own")));
  });

  it("denies reading or deleting a subscription owned by someone else", async () => {
    const db = ctxFor(ALLOWED_OPERATOR_EMAIL, true).firestore();
    await assertFails(getDoc(doc(db, "pushSubscriptions", "other")));
    await assertFails(deleteDoc(doc(db, "pushSubscriptions", "other")));
  });
});
