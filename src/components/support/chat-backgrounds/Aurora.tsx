import { forwardRef } from "react";

export const AuroraBackground = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    >
      <div
        className="absolute -inset-1/4 rounded-full opacity-50 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, hsl(var(--chat-accent) / 0.6), transparent 60%)",
          animation: "aurora-drift-1 14s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -inset-1/4 rounded-full opacity-40 blur-3xl"
        style={{
          background: "radial-gradient(circle at 70% 60%, hsl(var(--chat-accent-dark) / 0.7), transparent 65%)",
          animation: "aurora-drift-2 18s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0 opacity-30 blur-2xl"
        style={{
          background: "radial-gradient(circle at 50% 80%, hsl(0 0% 100% / 0.25), transparent 55%)",
          animation: "aurora-drift-3 22s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes aurora-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(15%, 10%) scale(1.15); }
        }
        @keyframes aurora-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1.1); }
          50% { transform: translate(-12%, -8%) scale(0.95); }
        }
        @keyframes aurora-drift-3 {
          0%, 100% { transform: translate(0, 0); opacity: 0.3; }
          50% { transform: translate(8%, -10%); opacity: 0.45; }
        }
      `}</style>
    </div>
  );
});
AuroraBackground.displayName = "AuroraBackground";
