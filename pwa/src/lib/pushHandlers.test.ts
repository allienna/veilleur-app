import { describe, expect, it, vi } from "vitest";

import {
  clickTarget,
  notificationOptions,
  parsePayload,
  showPush,
  type PushMessageDataLike,
} from "@/lib/pushHandlers";

const dataOf = (obj: unknown): PushMessageDataLike => ({
  json: () => obj,
  text: () => JSON.stringify(obj),
});

describe("parsePayload", () => {
  it("reads title/body/url from a JSON push", () => {
    expect(parsePayload(dataOf({ title: "Run OK", body: "Article prêt", url: "/runs/2026-06-03" }))).toEqual({
      title: "Run OK",
      body: "Article prêt",
      url: "/runs/2026-06-03",
    });
  });

  it("falls back to defaults when data is absent", () => {
    expect(parsePayload(null)).toEqual({ title: "Le Veilleur", body: "Mise à jour disponible." });
  });

  it("degrades non-JSON data to a text body", () => {
    const data: PushMessageDataLike = {
      json: () => {
        throw new Error("not json");
      },
      text: () => "plain text",
    };
    expect(parsePayload(data)).toEqual({ title: "Le Veilleur", body: "plain text" });
  });
});

describe("notificationOptions", () => {
  it("carries the deep-link url in data and a collapse tag", () => {
    const opts = notificationOptions({ title: "x", body: "b", url: "/runs/2026-06-03" });
    expect(opts).toMatchObject({ body: "b", data: { url: "/runs/2026-06-03" }, tag: "veilleur-run" });
  });

  it("defaults the url to '/' when none is given", () => {
    expect(notificationOptions({ title: "x", body: "b" }).data.url).toBe("/");
  });
});

describe("showPush", () => {
  it("calls registration.showNotification with the parsed title + options", async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    await showPush(dataOf({ title: "Run échoué", body: "à l'étape gmail", url: "/runs/x" }), {
      showNotification,
    });
    expect(showNotification).toHaveBeenCalledTimes(1);
    const [title, opts] = showNotification.mock.calls[0];
    expect(title).toBe("Run échoué");
    expect(opts).toMatchObject({ body: "à l'étape gmail", data: { url: "/runs/x" } });
  });
});

describe("clickTarget", () => {
  it("returns the stored url", () => {
    expect(clickTarget({ url: "/runs/2026-06-03" })).toBe("/runs/2026-06-03");
  });
  it("defaults to '/' for missing/empty/invalid data", () => {
    expect(clickTarget(undefined)).toBe("/");
    expect(clickTarget({})).toBe("/");
    expect(clickTarget({ url: "" })).toBe("/");
  });
});
