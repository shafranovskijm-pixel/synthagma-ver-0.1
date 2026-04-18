/**
 * Mini SVG diagrams that visually show WHERE each branding asset (avatar, org icon,
 * logo, cover) appears in the organization dashboard. Pure SVG — no extra assets.
 */

interface HintProps {
  className?: string;
}

const baseProps = {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1,
  strokeLinejoin: "round" as const,
};

/** Where the avatar appears: top-right of header */
export function AvatarLocationHint({ className }: HintProps) {
  return (
    <svg viewBox="0 0 120 70" className={className} {...baseProps}>
      <rect x="2" y="2" width="116" height="66" rx="6" className="text-border" />
      <rect x="2" y="2" width="20" height="66" className="text-border/50" />
      <rect x="22" y="2" width="96" height="14" className="text-border/70" />
      {/* Avatar slot highlighted */}
      <circle cx="108" cy="9" r="4.5" fill="hsl(var(--primary))" stroke="none" />
      <circle cx="108" cy="9" r="4.5" className="text-primary" />
    </svg>
  );
}

/** Where the org icon appears: top of left sidebar */
export function OrgIconLocationHint({ className }: HintProps) {
  return (
    <svg viewBox="0 0 120 70" className={className} {...baseProps}>
      <rect x="2" y="2" width="116" height="66" rx="6" className="text-border" />
      <rect x="2" y="2" width="20" height="66" className="text-border/50" />
      {/* Icon slot highlighted at top of sidebar */}
      <rect x="6" y="6" width="12" height="12" rx="2" fill="hsl(var(--primary))" stroke="none" />
      <rect x="6" y="6" width="12" height="12" rx="2" className="text-primary" />
      <line x1="6" y1="22" x2="18" y2="22" className="text-border" />
      <line x1="6" y1="28" x2="16" y2="28" className="text-border" />
      <line x1="6" y1="34" x2="18" y2="34" className="text-border" />
    </svg>
  );
}

/** Where the logo appears: top-left of header + on cover */
export function LogoLocationHint({ className }: HintProps) {
  return (
    <svg viewBox="0 0 120 70" className={className} {...baseProps}>
      <rect x="2" y="2" width="116" height="66" rx="6" className="text-border" />
      <rect x="2" y="2" width="20" height="66" className="text-border/50" />
      <rect x="22" y="2" width="96" height="14" className="text-border/70" />
      {/* Logo slot in header */}
      <rect x="26" y="5" width="8" height="8" rx="1.5" fill="hsl(var(--primary))" stroke="none" />
      <rect x="26" y="5" width="8" height="8" rx="1.5" className="text-primary" />
      {/* Logo on cover */}
      <rect x="22" y="16" width="96" height="22" className="text-border/40" fill="hsl(var(--muted))" />
      <rect x="26" y="29" width="7" height="7" rx="1" fill="hsl(var(--primary))" stroke="none" />
      <rect x="26" y="29" width="7" height="7" rx="1" className="text-primary" />
    </svg>
  );
}

/** Where the cover appears: large hero banner at top */
export function CoverLocationHint({ className }: HintProps) {
  return (
    <svg viewBox="0 0 120 70" className={className} {...baseProps}>
      <rect x="2" y="2" width="116" height="66" rx="6" className="text-border" />
      <rect x="2" y="2" width="20" height="66" className="text-border/50" />
      <rect x="22" y="2" width="96" height="14" className="text-border/70" />
      {/* Cover banner highlighted */}
      <rect x="22" y="16" width="96" height="22" fill="hsl(var(--primary) / 0.18)" stroke="none" />
      <rect x="22" y="16" width="96" height="22" className="text-primary" />
      <rect x="26" y="44" width="60" height="3" rx="1" className="text-border" />
      <rect x="26" y="50" width="40" height="3" rx="1" className="text-border" />
    </svg>
  );
}

interface HintBlockProps {
  diagram: React.ReactNode;
  text: string;
}

/** Container that pairs an SVG diagram with hint text. */
export function HintBlock({ diagram, text }: HintBlockProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/60">
      <div className="w-24 shrink-0 text-muted-foreground">{diagram}</div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{text}</p>
    </div>
  );
}
