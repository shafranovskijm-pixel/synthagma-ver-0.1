import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getPaidProgram } from "@/constants/paidPrograms20260922";

interface PaidProgramDeepLinkOptions<T extends { course_id: string }> {
  catalog: T[];
  isLoading: boolean;
  organizationId: string;
  onSelect: (course: T) => void;
  onOpenCatalog: (tab: "catalog") => void;
}

/** Selects a published listing only. A link never opens an order or purchases it. */
export function usePaidProgramDeepLink<T extends { course_id: string }>({
  catalog, isLoading, organizationId, onSelect, onOpenCatalog,
}: PaidProgramDeepLinkOptions<T>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const courseId = searchParams.get("course");
  const handled = useRef<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!getPaidProgram(courseId)) {
      handled.current = null;
      setUnavailable(false);
      return;
    }
    if (isLoading) return;
    const key = `${organizationId}:${courseId}`;
    if (handled.current === key) return;
    handled.current = key;
    const listing = catalog.find((item) => item.course_id === courseId);
    onOpenCatalog("catalog");
    setUnavailable(!listing);
    if (listing) onSelect(listing);
  }, [catalog, courseId, isLoading, organizationId, onOpenCatalog, onSelect]);

  const clearRequestedCourse = () => {
    if (getPaidProgram(courseId)) {
      const next = new URLSearchParams(searchParams);
      next.delete("course");
      setSearchParams(next, { replace: true });
    }
    setUnavailable(false);
  };

  return { unavailable, clearRequestedCourse };
}
