import assert from "node:assert/strict";
import { test } from "node:test";

import { ALLOWED_OPERATOR_EMAIL } from "./auth.js";
import { FakeJobRunner, FakeTokenVerifier } from "./fakes.js";
import {
  handleRequest,
  type HandlerDeps,
  type HandlerRequest,
} from "./handler.js";

const T0 = new Date("2026-06-01T05:00:00Z"); // 07:00 Europe/Paris → date 2026-06-01

function deps(
  over: Partial<HandlerDeps> = {},
): HandlerDeps & { runner: FakeJobRunner } {
  const runner = new FakeJobRunner();
  const verifier = new FakeTokenVerifier({
    email: ALLOWED_OPERATOR_EMAIL,
    emailVerified: true,
  });
  return {
    verifyToken: verifier.verifyToken.bind(verifier),
    runJob: runner.runJob.bind(runner),
    now: () => T0,
    runner,
    ...over,
  };
}

function req(over: Partial<HandlerRequest> = {}): HandlerRequest {
  return {
    method: "POST",
    url: "/trigger",
    headers: { authorization: "Bearer good-token" },
    body: "",
    ...over,
  };
}

test("AC-1: allowed verified token invokes the job and returns 202 { date, execution }", async () => {
  const d = deps();
  const res = await handleRequest(req(), d);
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { date: "2026-06-01", execution: "exec-fake-1" });
  assert.deepEqual(d.runner.calls, [undefined]); // no date → run today
});

test("AC-1: optional valid date is passed through to runJob and echoed", async () => {
  const d = deps();
  const res = await handleRequest(
    req({ body: JSON.stringify({ date: "2026-05-20" }) }),
    d,
  );
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { date: "2026-05-20", execution: "exec-fake-1" });
  assert.deepEqual(d.runner.calls, ["2026-05-20"]);
});

test("AC-2: missing bearer token → 401, no invocation", async () => {
  const d = deps();
  const res = await handleRequest(req({ headers: {} }), d);
  assert.equal(res.status, 401);
  assert.deepEqual(d.runner.calls, []);
});

test("AC-2: invalid token (verifier throws) → 401, no invocation", async () => {
  const runner = new FakeJobRunner();
  const verifier = new FakeTokenVerifier(null, true);
  const res = await handleRequest(req(), {
    verifyToken: verifier.verifyToken.bind(verifier),
    runJob: runner.runJob.bind(runner),
    now: () => T0,
  });
  assert.equal(res.status, 401);
  assert.deepEqual(runner.calls, []);
});

test("AC-3: valid token, wrong email → 403, no invocation", async () => {
  const runner = new FakeJobRunner();
  const verifier = new FakeTokenVerifier({
    email: "intruder@x.com",
    emailVerified: true,
  });
  const res = await handleRequest(req(), {
    verifyToken: verifier.verifyToken.bind(verifier),
    runJob: runner.runJob.bind(runner),
    now: () => T0,
  });
  assert.equal(res.status, 403);
  assert.deepEqual(runner.calls, []);
});

test("AC-3: allowed email but unverified → 403, no invocation", async () => {
  const runner = new FakeJobRunner();
  const verifier = new FakeTokenVerifier({
    email: ALLOWED_OPERATOR_EMAIL,
    emailVerified: false,
  });
  const res = await handleRequest(req(), {
    verifyToken: verifier.verifyToken.bind(verifier),
    runJob: runner.runJob.bind(runner),
    now: () => T0,
  });
  assert.equal(res.status, 403);
  assert.deepEqual(runner.calls, []);
});

test("AC-4: unknown path → 404", async () => {
  const res = await handleRequest(req({ url: "/nope" }), deps());
  assert.equal(res.status, 404);
});

test("AC-4: wrong method on /trigger → 405", async () => {
  const res = await handleRequest(req({ method: "GET" }), deps());
  assert.equal(res.status, 405);
});

test("AC-5: runJob failure → 500, no internal detail leaked", async () => {
  const runner = new FakeJobRunner("x", true);
  const verifier = new FakeTokenVerifier({
    email: ALLOWED_OPERATOR_EMAIL,
    emailVerified: true,
  });
  const res = await handleRequest(req(), {
    verifyToken: verifier.verifyToken.bind(verifier),
    runJob: runner.runJob.bind(runner),
    now: () => T0,
  });
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: "invoke_failed" });
});

test("bad JSON / bad date → 400, no invocation", async () => {
  const d = deps();
  const res = await handleRequest(
    req({ body: JSON.stringify({ date: "20-05-2026" }) }),
    d,
  );
  assert.equal(res.status, 400);
  assert.deepEqual(d.runner.calls, []);
});

test("GET /healthz → 200", async () => {
  const res = await handleRequest(
    req({ method: "GET", url: "/healthz", headers: {} }),
    deps(),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});
