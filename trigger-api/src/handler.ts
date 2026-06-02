// Pure request handler (F-008 plan AD-1/AD-4). All logic lives here so it unit-tests with fakes;
// index.ts is the thin node:http server that calls this with the real ports.

import { assertAllowed } from "./auth.js";
import { ForbiddenError, type JobRunner, type TokenVerifier } from "./ports.js";

export interface HandlerRequest {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  body: string;
}

export interface HandlerDeps {
  verifyToken: TokenVerifier["verifyToken"];
  runJob: JobRunner["runJob"];
  now: () => Date;
}

export interface HandlerResponse {
  status: number;
  body: unknown;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD in Europe/Paris (matches the Minion's date key, F-003). */
function parisDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function bearer(headers: HandlerRequest["headers"]): string {
  const header = headers["authorization"] ?? headers["Authorization"];
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/** Parse an optional `{ date }` body. Returns the validated date, `undefined`, or `"INVALID"`. */
function parseDate(body: string): string | undefined | "INVALID" {
  if (!body.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "INVALID";
  }
  const date = (parsed as { date?: unknown }).date;
  if (date === undefined) return undefined;
  return typeof date === "string" && DATE_RE.test(date) ? date : "INVALID";
}

export async function handleRequest(
  req: HandlerRequest,
  deps: HandlerDeps,
): Promise<HandlerResponse> {
  const path = req.url.split("?")[0];

  if (req.method === "GET" && path === "/healthz")
    return { status: 200, body: { ok: true } };
  if (path !== "/trigger") return { status: 404, body: { error: "not_found" } };
  if (req.method !== "POST")
    return { status: 405, body: { error: "method_not_allowed" } };

  const token = bearer(req.headers);
  if (!token) return { status: 401, body: { error: "unauthenticated" } };

  let claims;
  try {
    claims = await deps.verifyToken(token);
  } catch {
    return { status: 401, body: { error: "unauthenticated" } };
  }

  try {
    assertAllowed(claims);
  } catch (err) {
    if (err instanceof ForbiddenError)
      return { status: 403, body: { error: "forbidden" } };
    throw err;
  }

  const date = parseDate(req.body);
  if (date === "INVALID")
    return { status: 400, body: { error: "bad_request" } };

  const targetDate = date ?? parisDate(deps.now());
  try {
    const { execution } = await deps.runJob(date);
    return { status: 202, body: { date: targetDate, execution } };
  } catch {
    return { status: 500, body: { error: "invoke_failed" } };
  }
}
