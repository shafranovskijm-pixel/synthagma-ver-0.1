import { useEffect, useRef, useCallback } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  minSwipeDistance?: number;
}

export function useSwipeGesture<T extends HTMLElement = HTMLElement>(
  options: SwipeGestureOptions
) {
  const { 
    onSwipeLeft, 
    onSwipeRight, 
    threshold = 50,
    minSwipeDistance = 30 
  } = options;
  
  const ref = useRef<T>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = null;
    touchEndY.current = null;
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null || touchStartY.current === null || touchEndY.current === null) {
      return;
    }

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = Math.abs(touchEndY.current - touchStartY.current);
    const elapsed = Date.now() - touchStartTime.current;
    
    // Only trigger swipe if: horizontal > vertical, fast enough (<500ms), and exceeds thresholds
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY * 0.5 && elapsed < 500) {
      if (deltaX > threshold && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < -threshold && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    // Reset
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
  }, [onSwipeLeft, onSwipeRight, threshold, minSwipeDistance]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return ref;
}
