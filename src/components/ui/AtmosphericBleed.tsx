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

  return (
    <>
      {/* Bottom-right blurred fragment */}
      <div
        style={{
          ...common,
          bottom: 0,
          right: 0,
          width: "60%",
          height: "55%",
          filter: `blur(${blur}) saturate(1.3)`,
          opacity,
          maskImage: "radial-gradient(ellipse at bottom right, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at bottom right, black 0%, transparent 70%)",
        }}
      />
      {/* Bottom-right sharp layer */}
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
      {/* Bottom-left secondary bleed */}
      <div
        style={{
          ...common,
          bottom: 0,
          left: 0,
          width: "45%",
          height: "40%",
          filter: `blur(${blur}) saturate(1.2)`,
          opacity: opacity * 0.6,
          maskImage: "radial-gradient(ellipse at bottom left, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at bottom left, black 0%, transparent 70%)",
        }}
      />
      {/* Top-left subtle bleed */}
      <div
        style={{
          ...common,
          top: 0,
          left: 0,
          width: "35%",
          height: "30%",
          filter: `blur(${blur}) saturate(1.1)`,
          opacity: opacity * 0.3,
          maskImage: "radial-gradient(ellipse at top left, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at top left, black 0%, transparent 70%)",
        }}
      />
    </>
  );
}
