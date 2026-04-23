/**
 * Декоративные SVG-элементы для страницы коммерческого предложения.
 * Все цвета через currentColor → text-accent / text-primary, что даёт идеальное соответствие
 * фирменной палитре Teal/Cyan и автоматически работает в тёмной теме.
 */

/** Фоновая «звёздная пыль» — мягкий градиентный паттерн на всю страницу. */
export function ProposalBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Большое мягкое сияние сверху-слева */}
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-accent/15 blur-3xl" />
      {/* Сияние снизу-справа */}
      <div className="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary/10 blur-3xl" />
      {/* Среднее «облако» по центру */}
      <div className="absolute left-1/2 top-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-accent/5 blur-3xl" />

      {/* Точечная сетка */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.07] text-foreground" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="kp-dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.2" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#kp-dots)" />
      </svg>
    </div>
  );
}

/** Декоративная волна — для верхушки hero-секции. */
export function ProposalHeroWave() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 120"
      preserveAspectRatio="none"
      className="absolute inset-x-0 top-0 h-20 w-full text-accent/30"
    >
      <path
        d="M0,60 C150,10 300,110 450,60 C600,10 700,80 800,40 L800,0 L0,0 Z"
        fill="currentColor"
        opacity="0.4"
      />
      <path
        d="M0,80 C200,30 400,120 600,60 C700,30 750,60 800,50 L800,0 L0,0 Z"
        fill="currentColor"
        opacity="0.25"
      />
    </svg>
  );
}

/** Угловая декорация-«квадрант» — концентрические дуги в правом верхнем углу секции. */
export function CornerArcs({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className={`pointer-events-none absolute text-accent/30 ${className}`}
    >
      {[40, 70, 100, 130, 160].map((r) => (
        <circle
          key={r}
          cx="200"
          cy="0"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity={0.6 - r / 400}
        />
      ))}
    </svg>
  );
}

/** Иллюстрация «графа знаний» — кружки и линии. Хорошо подходит для секции преимуществ. */
export function KnowledgeGraphIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 200"
      className={`pointer-events-none ${className}`}
    >
      <defs>
        <linearGradient id="kg-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.0" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.6" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {/* линии */}
      <g stroke="url(#kg-line)" strokeWidth="1" className="text-accent">
        <line x1="60" y1="40" x2="160" y2="100" />
        <line x1="160" y1="100" x2="260" y2="50" />
        <line x1="160" y1="100" x2="80" y2="160" />
        <line x1="160" y1="100" x2="240" y2="160" />
        <line x1="60" y1="40" x2="260" y2="50" />
      </g>
      {/* узлы */}
      <g className="text-accent">
        <circle cx="60" cy="40" r="6" fill="currentColor" opacity="0.7" />
        <circle cx="160" cy="100" r="10" fill="currentColor" />
        <circle cx="260" cy="50" r="6" fill="currentColor" opacity="0.7" />
        <circle cx="80" cy="160" r="5" fill="currentColor" opacity="0.6" />
        <circle cx="240" cy="160" r="5" fill="currentColor" opacity="0.6" />
      </g>
      {/* мягкие кольца вокруг центра */}
      <g className="text-accent" fill="none" stroke="currentColor">
        <circle cx="160" cy="100" r="22" opacity="0.25" />
        <circle cx="160" cy="100" r="34" opacity="0.15" />
      </g>
    </svg>
  );
}

/** Иллюстрация «диплом» — стилизованный документ для секции гарантий. */
export function CertificateIllustration({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={`pointer-events-none ${className}`}>
      <g className="text-accent">
        {/* документ */}
        <rect x="40" y="30" width="120" height="140" rx="6" fill="currentColor" opacity="0.08" />
        <rect x="40" y="30" width="120" height="140" rx="6" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
        {/* линии текста */}
        <line x1="56" y1="60" x2="120" y2="60" stroke="currentColor" strokeWidth="2" opacity="0.6" />
        <line x1="56" y1="76" x2="144" y2="76" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
        <line x1="56" y1="88" x2="130" y2="88" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
        <line x1="56" y1="100" x2="138" y2="100" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
        {/* печать */}
        <circle cx="140" cy="140" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
        <circle cx="140" cy="140" r="11" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <path d="M134 140 l4 4 l8 -8" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.8" />
        {/* лента */}
        <path d="M60 170 l8 14 l8 -10 l8 10 l8 -14" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      </g>
    </svg>
  );
}

/** Тонкий разделитель между секциями — звено цепочки точек. */
export function SectionDivider() {
  return (
    <div aria-hidden className="my-2 flex items-center justify-center gap-1.5">
      <span className="h-1 w-1 rounded-full bg-accent/30" />
      <span className="h-1 w-1 rounded-full bg-accent/50" />
      <span className="h-1 w-1 rounded-full bg-accent" />
      <span className="h-1 w-1 rounded-full bg-accent/50" />
      <span className="h-1 w-1 rounded-full bg-accent/30" />
    </div>
  );
}
