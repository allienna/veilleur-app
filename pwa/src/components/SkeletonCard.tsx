import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// `SkeletonCard` — article placeholder during Firestore fetch (DESIGN §4 Loading,
// ≥300ms floor enforced by the caller; never a spinner).
export function SkeletonCard(): JSX.Element {
  return (
    <Card>
      <Skeleton className="aspect-video w-full rounded-b-none rounded-t-lg" />
      <CardContent className="space-y-sm">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
      </CardContent>
    </Card>
  );
}
