import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Skeleton } from "@/components/ui/skeleton";

export const LazyLoadFallback = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-4">
      <SigmaSpinner size="xl" />
      <div className="max-w-4xl w-full mx-auto space-y-6">
        <Skeleton className="h-10 w-48 mx-auto" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
};
