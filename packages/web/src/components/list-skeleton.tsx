import { Skeleton } from "@/components/ui/skeleton";

interface ListSkeletonProps {
  /** Name of what's loading, for screen readers. */
  label: string;
  rows?: number;
}

/** Placeholder rows for a list that's loading: an avatar, a title, and a detail line. */
export function ListSkeleton({ label, rows = 4 }: ListSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="flex flex-col"
      role="status"
    >
      {Array.from({ length: rows }, (_, row) => (
        <div
          className="flex items-center gap-3 border-b py-3 last:border-b-0"
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={row}
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
