import { forwardRef } from "react";

export const WavesBackground = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    >
      <svg
        className="absolute bottom-0 left-0 w-[200%] h-full"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        style={{ animation: "waves-slide-1 18s linear infinite" }}
      >
        <path
          d="M0,100 C200,160 400,40 600,100 C800,160 1000,40 1200,100 L1200,200 L0,200 Z"
          fill="hsl(0 0% 100% / 0.12)"
        />
      </svg>
      <svg
        className="absolute bottom-0 left-0 w-[200%] h-full"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        style={{ animation: "waves-slide-2 26s linear infinite" }}
      >
        <path
          d="M0,130 C200,80 400,180 600,120 C800,60 1000,170 1200,110 L1200,200 L0,200 Z"
          fill="hsl(0 0% 100% / 0.18)"
        />
      </svg>
      <svg
        className="absolute bottom-0 left-0 w-[200%] h-full"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        style={{ animation: "waves-slide-1 14s linear infinite reverse" }}
      >
        <path
          d="M0,150 C300,110 600,190 900,140 C1050,115 1150,160 1200,150 L1200,200 L0,200 Z"
          fill="hsl(0 0% 100% / 0.22)"
        />
      </svg>
      <style>{`
        @keyframes waves-slide-1 {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes waves-slide-2 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
});
WavesBackground.displayName = "WavesBackground";
