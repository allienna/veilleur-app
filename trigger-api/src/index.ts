// Cloud Run service entrypoint (F-008). Thin node:http shim: read the request, delegate to the
// pure `handleRequest` with the real Firebase + Cloud Run ports, write the JSON response. The
// auth gate + invocation logic live in handler.ts (unit-tested). Structured logs to stdout are the
// logging boundary (Cloud Logging captures them); tokens/PII are never logged.

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { verifyToken } from "./firebase.js";
import { handleRequest, type HandlerRequest } from "./handler.js";
import { runJob } from "./jobRunner.js";

const PORT = Number(process.env.PORT ?? 8080);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function log(fields: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ level: "info", ...fields }) + "\n");
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    // Everything — including reading the body — is inside the try so a stream error (client
    // disconnect, aborted upload) becomes a controlled 500, never an unhandled rejection.
    try {
      const body = req.method === "POST" ? await readBody(req) : "";
      const headers: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        headers[key] = Array.isArray(value) ? value[0] : value;
      }
      const request: HandlerRequest = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers,
        body,
      };

      const result = await handleRequest(request, {
        verifyToken,
        runJob,
        now: () => new Date(),
      });

      log({
        method: request.method,
        path: request.url.split("?")[0],
        status: result.status,
      });
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      log({
        level: "error",
        msg: "request failed",
        err: err instanceof Error ? err.message : "?",
      });
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "internal" }));
      }
    }
  })();
});

server.listen(PORT);
