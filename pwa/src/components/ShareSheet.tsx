import { Copy, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { copyText, saveImage } from "@/lib/share";

type Status = "idle" | "copying" | "saving";

export interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ready-to-post LinkedIn text (`article.linkedin`). */
  linkedin: string;
  /** Public hero URL (`heroUrl(article.image)`). */
  imageUrl: string;
  /** Hero filename used for the saved file (`article.image`). */
  imageFilename: string;
}

// `ShareSheet` — two-tap LinkedIn share (DESIGN §3; FR-1). One tap copies the post, a second
// saves the hero image to Photos. Pure UI over `lib/share` browser helpers; no data access.
export function ShareSheet({
  open,
  onOpenChange,
  linkedin,
  imageUrl,
  imageFilename,
}: ShareSheetProps): JSX.Element {
  const [status, setStatus] = useState<Status>("idle");
  const busy = status !== "idle";

  async function onCopy(): Promise<void> {
    setStatus("copying");
    const result = await copyText(linkedin);
    setStatus("idle");
    // FR-2: no confirmation dialog — a transient toast confirms (DESIGN §interactions).
    if (result.ok) toast.success("Post copié");
    else toast.error("Échec de la copie"); // sheet stays open so the operator can retry.
  }

  async function onSave(): Promise<void> {
    setStatus("saving");
    const result = await saveImage(imageUrl, imageFilename);
    setStatus("idle");
    if (result.ok) {
      // On iOS the native share sheet replaces the toast (DESIGN §interactions, line 230);
      // only the <a download> fallback needs an explicit confirmation.
      if (result.via === "download") toast.success("Image enregistrée");
    } else if (result.reason === "error") {
      toast.error("Image indisponible");
    } // `cancelled` (user dismissed the OS sheet) is a no-op.
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Partager sur LinkedIn">
      <div className="space-y-sm">
        <Button
          variant="secondary"
          className="w-full justify-start"
          disabled={busy || !linkedin}
          onClick={onCopy}
        >
          {status === "copying" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Copy className="h-5 w-5" aria-hidden="true" />
          )}
          Copier le post
        </Button>
        <Button
          variant="secondary"
          className="w-full justify-start"
          disabled={busy || !imageUrl || !imageFilename}
          onClick={onSave}
        >
          {status === "saving" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-5 w-5" aria-hidden="true" />
          )}
          Enregistrer l'image
        </Button>
      </div>
    </Sheet>
  );
}
