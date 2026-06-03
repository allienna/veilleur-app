import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// `SignInScreen` — Google sign-in landing that gates the PWA (DESIGN §2).
export function SignInScreen({
  onSignIn,
  error,
}: {
  onSignIn: () => void;
  error?: string;
}): JSX.Element {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-md">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-lg text-center">
          <span aria-hidden className="size-16 rounded-full border-2 border-primary" />
          <div className="space-y-xs">
            <h1 className="text-h1 font-display text-fg">Le Veilleur</h1>
            <p className="text-body text-fg-muted">Votre veille tech quotidienne.</p>
          </div>
          <Button onClick={onSignIn} className="w-full">
            Se connecter avec Google
          </Button>
          {error ? <p className="text-caption text-error">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
