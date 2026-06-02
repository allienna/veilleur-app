// Production `JobRunner` over the Cloud Run Admin REST API (F-008 plan AD-3). Mints an access
// token via ADC (the service's runtime SA, which holds run.invoker on the Job) and POSTs the
// jobs:run endpoint — mirroring F-007's Scheduler call. A target date is passed as a container-args
// override (`run --date YYYY-MM-DD`); the minion CLI already accepts it.

import { GoogleAuth } from "google-auth-library";

import { JobRunError } from "./ports.js";

const PROJECT_ID = process.env.PROJECT_ID ?? "veilleur-app";
const REGION = process.env.REGION ?? "europe-west1";
const JOB = process.env.JOB ?? "minion";
const RUN_URL = `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB}:run`;

const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

interface RunOperation {
  name?: string;
  metadata?: { name?: string };
}

export async function runJob(date?: string): Promise<{ execution: string }> {
  const data = date
    ? { overrides: { containerOverrides: [{ args: ["run", "--date", date] }] } }
    : {};
  try {
    const client = await auth.getClient();
    const res = await client.request<RunOperation>({
      url: RUN_URL,
      method: "POST",
      data,
    });
    // jobs:run returns an Operation; the execution name is in metadata.name.
    const execution = res.data.metadata?.name ?? res.data.name ?? "unknown";
    return { execution };
  } catch (err) {
    throw new JobRunError(
      `jobs:run failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
}
