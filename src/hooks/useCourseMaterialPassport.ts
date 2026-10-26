import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { findCourseMaterialPassport, isPlatformPassportCourse, verifyPassportSource, verifyPlatformCourseOwnership } from "@/lib/courseMaterialPassport";

export function useCourseMaterialPassport(courseId: string, context: object, actorId?: string) {
  const eligible = isPlatformPassportCourse(courseId);
  const passport = findCourseMaterialPassport(courseId);
  const [result, setResult] = useState<{ courseId: string; context: object; actorId?: string; owned: boolean; status: "loading" | "verified" | "unconfirmed" }>({ courseId, context, actorId, owned: false, status: "loading" });
  useEffect(() => {
    if (!eligible) return;
    let current = true;
    setResult({ courseId, context, actorId, owned: false, status: "loading" });
    void (async () => {
      try {
        const ownership = await supabase.from("courses").select("id,organization_id").eq("id", courseId).maybeSingle();
        if (!current) return;
        if (!verifyPlatformCourseOwnership(courseId, ownership.data, ownership.error)) {
          setResult({ courseId, context, actorId, owned: false, status: "unconfirmed" });
          return;
        }
        setResult({ courseId, context, actorId, owned: true, status: passport ? "loading" : "unconfirmed" });
        if (!passport) return;
        let status: "verified" | "unconfirmed" = "unconfirmed";
        try {
          const source = await supabase.from("lessons").select("id,content,course_id").eq("id", passport.source.lessonId).maybeSingle();
          status = (await verifyPassportSource(passport, courseId, source.data, source.error)).status;
        } catch { /* An unavailable source never supplies facts. */ }
        if (!current) return;
        // Reconfirm ownership after the asynchronous source read/hash, just before publishing facts.
        const latest = await supabase.from("courses").select("id,organization_id").eq("id", courseId).maybeSingle();
        if (current) setResult({ courseId, context, actorId, owned: verifyPlatformCourseOwnership(courseId, latest.data, latest.error), status });
      } catch {
        if (current) setResult({ courseId, context, actorId, owned: false, status: "unconfirmed" });
      }
    })();
    return () => { current = false; };
  }, [courseId, context, actorId, eligible, passport]);
  return { visible: eligible && result.courseId === courseId && result.context === context && result.actorId === actorId && result.owned, status: result.status, passport };
}
