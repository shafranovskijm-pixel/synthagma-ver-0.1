import { Loader2 } from "lucide-react";

export const LazyLoadFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground font-mono">Загрузка...</p>
    </div>
  </div>
);
