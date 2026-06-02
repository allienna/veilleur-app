import assert from "node:assert/strict";
import { test } from "node:test";

import { ALLOWED_OPERATOR_EMAIL, assertAllowed } from "./auth.js";
import { ForbiddenError } from "./ports.js";

test("assertAllowed passes for the allowed, verified operator", () => {
  assert.doesNotThrow(() =>
    assertAllowed({ email: ALLOWED_OPERATOR_EMAIL, emailVerified: true }),
  );
});

test("assertAllowed rejects a non-allowed email", () => {
  assert.throws(
    () => assertAllowed({ email: "someone@else.com", emailVerified: true }),
    ForbiddenError,
  );
});

test("assertAllowed rejects an unverified allowed email", () => {
  assert.throws(
    () =>
      assertAllowed({ email: ALLOWED_OPERATOR_EMAIL, emailVerified: false }),
    ForbiddenError,
  );
});
