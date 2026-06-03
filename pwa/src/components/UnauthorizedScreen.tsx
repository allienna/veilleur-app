import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// `UnauthorizedScreen` — terminal screen for a signed-in but non-allowed/unverified
// identity (DESIGN §2). Not a dead end: offers sign-out to retry with another account.
export function UnauthorizedScreen({ onSignOut }: { onSignOut: () => void }): JSX.Element {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-md">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-lg text-center">
          <h1 className="text-h1 font-display text-fg">Non autorisé</h1>
          <p className="text-body text-fg-muted">
            Ce compte n'est pas autorisé à accéder au Veilleur.
          </p>
          <Button variant="secondary" onClick={onSignOut} className="w-full">
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
