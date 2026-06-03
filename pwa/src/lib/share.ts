// Browser side-effects for the two-tap LinkedIn share (F-010), isolated behind a thin,
// unit-testable boundary. Capability detection only — never UA sniffing (plan AD-5).

/** Discriminated result the ShareSheet maps to toasts / sheet state. */
export type ShareResult =
  | { ok: true; via: "clipboard" | "share" | "download" }
  | { ok: false; reason: "cancelled" | "error" };

/** Copy text to the clipboard (FR-2 — no confirmation dialog). */
export async function copyText(text: string): Promise<ShareResult> {
  try {
    if (!navigator.clipboard?.writeText) return { ok: false, reason: "error" };
    await navigator.clipboard.writeText(text);
    return { ok: true, via: "clipboard" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Deliver the hero image to the OS (FR-3). Prefers the Web Share API with a `File` so iOS
 * offers "Save Image"; falls back to a programmatic `<a download>` click. A user-cancelled
 * native share is reported as `cancelled` (no error toast). Returns `via` so the caller can
 * suppress its toast when iOS shows its own OS sheet (DESIGN §interactions).
 */
export async function saveImage(url: string, filename: string): Promise<ShareResult> {
  let file: File;
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, reason: "error" };
    const blob = await res.blob();
    file = new File([blob], filename, { type: blob.type || "image/webp" });
  } catch {
    return { ok: false, reason: "error" };
  }

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file] });
      return { ok: true, via: "share" };
    } catch (err) {
      if (isAbortError(err)) return { ok: false, reason: "cancelled" };
      return { ok: false, reason: "error" };
    }
  }

  try {
    downloadBlob(file, filename);
    return { ok: true, via: "download" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

function canShareFile(file: File): boolean {
  return (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
