interface AtmosphericBleedProps {
  bannerUrl: string;
  blur?: string;
  opacity?: number;
  sharp?: boolean;
}

export function AtmosphericBleed({ bannerUrl, blur = "40px", opacity = 0.25, sharp = false }: AtmosphericBleedProps) {
  if (!bannerUrl) return null;
  const common: React.CSSProperties = {
    position: "fixed",
    pointerEvents: "none",
    backgroundImage: `url(${bannerUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    zIndex: 0,
  };

  const filterBlur = sharp ? "saturate(1.3)" : `blur(${blur}) saturate(1.3)`;
  const filterBlurWeak = sharp ? "saturate(1.2)" : `blur(${blur}) saturate(1.2)`;
  const filterBlurSubtle = sharp ? "saturate(1.1)" : `blur(${blur}) saturate(1.1)`;
  const maskFade = sharp ? "50%" : "70%";

  return (
    <>
      {/* Bottom-right main fragment */}
      <div
        style={{
          ...common,
          bottom: 0,
          right: 0,
          width: "60%",
          height: "55%",
          filter: filterBlur,
          opacity: sharp ? Math.min(opacity * 2, 0.55) : opacity,
          maskImage: `radial-gradient(ellipse at bottom right, black 0%, transparent ${maskFade})`,
          WebkitMaskImage: `radial-gradient(ellipse at bottom right, black 0%, transparent ${maskFade})`,
        }}
      />
      {/* Bottom-right sharp overlay */}
      {sharp && (
        <div
          style={{
            ...common,
            bottom: 0,
            right: 0,
            width: "100%",
            height: "40%",
            opacity: opacity * 0.6,
            maskImage: "linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 100%)",
          }}
        />
      )}
      {/* Bottom-left secondary */}
      <div
        style={{
          ...common,
          bottom: 0,
          left: 0,
          width: "45%",
          height: "40%",
          filter: filterBlurWeak,
          opacity: sharp ? Math.min(opacity * 1.5, 0.45) : opacity * 0.6,
          maskImage: `radial-gradient(ellipse at bottom left, black 0%, transparent ${maskFade})`,
          WebkitMaskImage: `radial-gradient(ellipse at bottom left, black 0%, transparent ${maskFade})`,
        }}
      />
      {/* Top-left subtle */}
      <div
        style={{
          ...common,
          top: 0,
          left: 0,
          width: "35%",
          height: "30%",
          filter: filterBlurSubtle,
          opacity: opacity * 0.3,
          maskImage: `radial-gradient(ellipse at top left, black 0%, transparent ${maskFade})`,
          WebkitMaskImage: `radial-gradient(ellipse at top left, black 0%, transparent ${maskFade})`,
        }}
      />
    </>
  );
}
