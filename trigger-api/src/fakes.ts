// Hermetic test doubles for the ports (F-008 plan AD-8). No Firebase / GCP / network.

import {
  JobRunError,
  UnauthenticatedError,
  type JobRunner,
  type TokenClaims,
  type TokenVerifier,
} from "./ports.js";

export class FakeTokenVerifier implements TokenVerifier {
  /** Scripted result: claims to return, or set `reject` to simulate an invalid token. */
  constructor(
    private readonly claims: TokenClaims | null,
    private readonly reject = false,
  ) {}

  verifyToken(_idToken: string): Promise<TokenClaims> {
    if (this.reject || this.claims === null) {
      return Promise.reject(new UnauthenticatedError("invalid token"));
    }
    return Promise.resolve(this.claims);
  }
}

export class FakeJobRunner implements JobRunner {
  readonly calls: Array<string | undefined> = [];

  constructor(
    private readonly execution = "exec-fake-1",
    private readonly fail = false,
  ) {}

  runJob(date?: string): Promise<{ execution: string }> {
    this.calls.push(date);
    if (this.fail) return Promise.reject(new JobRunError("invoke failed"));
    return Promise.resolve({ execution: this.execution });
  }
}
