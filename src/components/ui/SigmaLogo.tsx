import { cn } from "@/lib/utils";

interface SigmaLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  variant?: "default" | "white" | "gradient";
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-20 h-20",
};

const textSizeClasses = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-4xl",
};

export function SigmaLogo({
  className,
  size = "md",
  showText = true,
  variant = "default"
}: SigmaLogoProps) {
  const iconColors = {
    default: "from-primary via-accent to-sigma-purple",
    white: "from-white/90 to-white",
    gradient: "from-primary via-accent to-sigma-purple",
  };

  const sigmaColors = {
    default: "from-primary via-accent to-sigma-purple",
    white: "from-primary via-accent to-sigma-purple",
    gradient: "from-primary via-accent to-sigma-purple",
  };

  const textColors = {
    default: "text-foreground",
    white: "text-white",
    gradient: "gradient-text",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl bg-gradient-to-br p-0.5",
          iconColors[variant],
          sizeClasses[size]
        )}
      >
        <div className={cn(
          "flex items-center justify-center w-full h-full rounded-[10px]",
          variant === "white" ? "bg-white" : "bg-card"
        )}>
          <span
            className={cn(
              "font-display font-bold bg-gradient-to-br bg-clip-text text-transparent",
              sigmaColors[variant],
              size === "sm" && "text-lg",
              size === "md" && "text-xl",
              size === "lg" && "text-2xl",
              size === "xl" && "text-4xl",
            )}
          >
            Σ
          </span>
        </div>
      </div>
      {showText && (
        <span className={cn(
          "font-display font-bold tracking-tight",
          textSizeClasses[size],
          textColors[variant]
        )}>
          СИНТАГМА
        </span>
      )}
    </div>
  );
}
