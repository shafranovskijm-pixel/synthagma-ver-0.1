import { useState, useEffect, useRef, useCallback } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
}

interface PullToRefreshState {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
  canRefresh: boolean;
}

export function usePullToRefresh<T extends HTMLElement = HTMLElement>(
  options: PullToRefreshOptions
) {
  const { onRefresh, threshold = 80, maxPull = 120 } = options;
  
  const ref = useRef<T>(null);
  const touchStartY = useRef<number | null>(null);
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    canRefresh: false,
  });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const element = ref.current;
    if (!element) return;
    
    // Only start pull if at the top of the scroll container
    if (element.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchStartY.current === null || state.isRefreshing) return;
    
    const element = ref.current;
    if (!element || element.scrollTop > 0) {
      touchStartY.current = null;
      setState(prev => ({ ...prev, isPulling: false, pullDistance: 0, canRefresh: false }));
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;

    if (diff > 0) {
      // Apply resistance to pull
      const pullDistance = Math.min(diff * 0.5, maxPull);
      const canRefresh = pullDistance >= threshold;
      
      setState(prev => ({
        ...prev,
        isPulling: true,
        pullDistance,
        canRefresh,
      }));

      // Prevent default scroll when pulling
      if (diff > 10) {
        e.preventDefault();
      }
    }
  }, [state.isRefreshing, threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (touchStartY.current === null) return;
    
    touchStartY.current = null;

    if (state.canRefresh && !state.isRefreshing) {
      setState(prev => ({ 
        ...prev, 
        isPulling: false, 
        isRefreshing: true, 
        pullDistance: threshold,
        canRefresh: false 
      }));

      // Trigger haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(15);
      }

      try {
        await onRefresh();
      } finally {
        setState({
          isPulling: false,
          isRefreshing: false,
          pullDistance: 0,
          canRefresh: false,
        });
      }
    } else {
      setState({
        isPulling: false,
        isRefreshing: false,
        pullDistance: 0,
        canRefresh: false,
      });
    }
  }, [state.canRefresh, state.isRefreshing, onRefresh, threshold]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    ref,
    ...state,
  };
}
