import { describe, expect, it } from "vitest";

import { deriveStatus } from "@/auth/authStatus";
import { ALLOWED_OPERATOR_EMAIL } from "@/config";

// AC-4: the soft gate maps identities to the right status (F-009 AD-3).
describe("deriveStatus", () => {
  it("signed-out when no user", () => {
    expect(deriveStatus(null)).toBe("signed-out");
  });

  it("ready for the allowed, verified operator", () => {
    expect(deriveStatus({ email: ALLOWED_OPERATOR_EMAIL, emailVerified: true })).toBe("ready");
  });

  it("unauthorized for a non-allowed email", () => {
    expect(deriveStatus({ email: "someone@else.com", emailVerified: true })).toBe("unauthorized");
  });

  it("unauthorized when the allowed email is unverified", () => {
    expect(deriveStatus({ email: ALLOWED_OPERATOR_EMAIL, emailVerified: false })).toBe(
      "unauthorized",
    );
  });
});
