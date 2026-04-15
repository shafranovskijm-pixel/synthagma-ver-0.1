import { cn } from "@/lib/utils";

interface SigmaSpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  xs: "w-3 h-3 text-[8px]",
  sm: "w-4 h-4 text-[10px]",
  md: "w-6 h-6 text-sm",
  lg: "w-8 h-8 text-lg",
  xl: "w-12 h-12 text-2xl",
};

export function SigmaSpinner({ size = "md", className }: SigmaSpinnerProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-primary animate-spin",
        sizeMap[size],
        className
      )}
    >
      <span className="text-primary-foreground font-display font-bold leading-none">
        Σ
      </span>
    </div>
  );
}
