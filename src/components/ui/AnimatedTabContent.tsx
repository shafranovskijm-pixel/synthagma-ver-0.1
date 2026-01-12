import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedTabContentProps {
  children: ReactNode;
  tabKey: string;
  direction: number;
  isMobile: boolean;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 50 : -50,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -50 : 50,
    opacity: 0,
  }),
};

export function AnimatedTabContent({
  children,
  tabKey,
  direction,
  isMobile,
}: AnimatedTabContentProps) {
  // Skip animation on desktop
  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={tabKey}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{
          x: { type: "spring", stiffness: 300, damping: 30 },
          opacity: { duration: 0.2 },
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
