import { Shield } from "lucide-react";

const AVATAR_COLORS = [
  "hsl(340 75% 55%)",  // pink
  "hsl(270 60% 55%)",  // purple
  "hsl(220 70% 55%)",  // blue
  "hsl(175 65% 42%)",  // teal
  "hsl(145 55% 45%)",  // green
  "hsl(35 80% 52%)",   // orange
  "hsl(0 65% 55%)",    // red
  "hsl(200 70% 50%)",  // sky
  "hsl(290 50% 50%)",  // violet
  "hsl(160 60% 40%)",  // emerald
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ChatAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  isAdmin?: boolean;
}

export function ChatAvatar({ name, size = "md", isAdmin }: ChatAvatarProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };

  if (isAdmin) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-primary/15 flex items-center justify-center shrink-0`}>
        <Shield className="w-1/2 h-1/2 text-primary" />
      </div>
    );
  }

  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  const initials = getInitials(name);

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center shrink-0 font-semibold text-white`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}
