import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingHighlightProps {
  selector?: string;
}

export function OnboardingHighlight({ selector }: OnboardingHighlightProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updatePosition = useCallback(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [selector]);

  useEffect(() => {
    updatePosition();
    // Small delay to ensure DOM is ready
    const timeout = setTimeout(updatePosition, 100);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  if (!selector || !rect) return null;

  const padding = 4;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={selector}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed pointer-events-none"
        style={{
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
          zIndex: 45,
          borderRadius: 12,
          border: "2px solid hsl(var(--primary))",
          boxShadow: "0 0 0 4px hsl(var(--primary) / 0.15), 0 0 20px 4px hsl(var(--primary) / 0.25)",
          animation: "onboarding-pulse 2s ease-in-out infinite",
        }}
      />
    </AnimatePresence>,
    document.body
  );
}
