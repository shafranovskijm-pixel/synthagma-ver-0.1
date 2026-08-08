import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildPlatformContractPagesHtml, A4_W, A4_H } from "@/lib/platform-contract";
import type { PlatformContractDraft } from "@/lib/platform-contract";

interface Props {
  draft: PlatformContractDraft;
  /** Сколько страниц показывать на экране. По умолчанию — все. */
  pages?: number;
  className?: string;
}

/**
 * Экранный предпросмотр проекта договора: реальные A4-страницы,
 * масштабируемые под ширину контейнера (без горизонтального скролла).
 */
export function PlatformContractPreview({ draft, pages, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const html = buildPlatformContractPagesHtml(draft);
  const visible = pages ? html.slice(0, pages) : html;

  const measure = () => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    setScale(Math.min(1, w / A4_W));
  };

  useLayoutEffect(measure, []);
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div ref={containerRef} className={className ?? "w-full min-w-0"}>
      <div className="flex flex-col items-center gap-4">
        {visible.map((page, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            style={{ width: A4_W * scale, height: A4_H * scale }}
          >
            <div
              style={{ width: A4_W, height: A4_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
              dangerouslySetInnerHTML={{ __html: page }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
