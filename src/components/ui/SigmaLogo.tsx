import { cn } from "@/lib/utils";

interface SigmaLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  variant?: "default" | "white" | "gradient";
  onClick?: () => void;
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
  variant = "default",
  onClick,
}: SigmaLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", onClick && "cursor-pointer", className)} onClick={onClick}>
      <div
        className={cn(
          "flex items-center justify-center rounded-lg",
          variant === "white" ? "bg-background" : "bg-foreground",
          sizeClasses[size]
        )}
      >
        <span
          className={cn(
            "font-display font-medium",
            variant === "white" ? "text-foreground" : "text-background",
            size === "sm" && "text-lg",
            size === "md" && "text-xl",
            size === "lg" && "text-2xl",
            size === "xl" && "text-4xl",
          )}
        >
          Σ
        </span>
      </div>
      {showText && (
        <span className={cn(
          "font-display font-medium tracking-tight",
          textSizeClasses[size],
          variant === "white" ? "text-background" : "text-foreground"
        )}>
          СИНТАГМА
        </span>
      )}
    </div>
  );
}
