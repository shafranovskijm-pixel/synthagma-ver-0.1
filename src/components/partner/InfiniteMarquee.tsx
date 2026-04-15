import { ReactNode } from "react";

interface InfiniteMarqueeProps {
  children: ReactNode;
  direction?: "left" | "right";
  speed?: number; // seconds for one full cycle
  className?: string;
}

export const InfiniteMarquee = ({
  children,
  direction = "left",
  speed = 40,
  className = "",
}: InfiniteMarqueeProps) => {
  const animDir = direction === "left" ? "normal" : "reverse";

  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        className="flex w-max gap-6"
        style={{
          animation: `marquee-scroll ${speed}s linear infinite`,
          animationDirection: animDir,
        }}
      >
        {/* Original */}
        <div className="flex gap-6 shrink-0">{children}</div>
        {/* Duplicate for seamless loop */}
        <div className="flex gap-6 shrink-0" aria-hidden>{children}</div>
      </div>

      <style>{`
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};
