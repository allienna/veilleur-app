import { Skeleton } from "@/components/ui/skeleton";

// `SkeletonCard` — article placeholder during Firestore fetch (DESIGN §4 Loading,
// ≥300ms floor enforced by the caller; never a spinner). Mirrors `ArticleCard`'s shape: a rounded
// image block with no card chrome, then a pill row, title and meta line.
export function SkeletonCard(): JSX.Element {
  return (
    <div className="flex flex-col">
      <Skeleton className="mb-5 aspect-video w-full rounded-lg" />
      <div className="mb-3 flex gap-sm">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-7 w-3/4" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}
