import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  canRefresh: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  canRefresh,
  threshold = 80 }: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 180;

  return (
    <motion.div
      className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-50"
      style={{ top: -60 }}
      animate={{ y: pullDistance }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-200 ${
          canRefresh || isRefreshing
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {isRefreshing ? (
          <SigmaSpinner />
        ) : (
          <motion.div
            animate={{ rotate: rotation }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <ArrowDown className="w-5 h-5" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
