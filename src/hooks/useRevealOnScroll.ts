import { useEffect } from "react";

/**
 * Подписывает все элементы с атрибутом `data-reveal` внутри контейнера на
 * IntersectionObserver — при попадании в зону видимости добавляет класс
 * `is-revealed`, который запускает CSS-анимации появления (см. .landing-reveal*
 * в `index.css`).
 *
 * Поведение:
 *  - Один раз — после показа observer отписывается, чтобы не дёргать DOM.
 *  - Уважает `prefers-reduced-motion: reduce` — сразу выставляет `is-revealed`
 *    без анимации (контент остаётся видимым).
 *  - Контейнер опционален: если не передан — наблюдает за всем `document.body`.
 *
 * Использование:
 *   useRevealOnScroll(rootRef);
 *   <section data-reveal>...</section>
 */
export function useRevealOnScroll(
  containerRef?: React.RefObject<HTMLElement | null>,
  options?: { threshold?: number; rootMargin?: string },
) {
  useEffect(() => {
    const root = containerRef?.current ?? document.body;
    if (!root) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (elements.length === 0) return;

    if (reduced) {
      elements.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      {
        threshold: options?.threshold ?? 0.12,
        rootMargin: options?.rootMargin ?? "0px 0px -40px 0px",
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [containerRef, options?.threshold, options?.rootMargin]);
}
