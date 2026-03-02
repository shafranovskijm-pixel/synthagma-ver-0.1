import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from "react";

export const LazyLoadFallback = () => {
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    const t1 = setTimeout(() => setProgress(40), 200);
    const t2 = setTimeout(() => setProgress(70), 600);
    const t3 = setTimeout(() => setProgress(90), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Progress value={progress} className="h-1 mb-6 max-w-md mx-auto" />
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
};
