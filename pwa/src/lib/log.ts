// Structured logging client (DESIGN §4): same JSON shape the Minion writes to Cloud
// Logging. No third-party telemetry sink in v1. Emitted to the console; Cloud Logging
// ingests stdout/stderr for the hosted surface.
type Level = "info" | "warn" | "error";

interface LogFields {
  event: string;
  runId?: string;
  [key: string]: unknown;
}

export function log(level: Level, fields: LogFields): void {
  const line = JSON.stringify({ level, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
