import { useEffect, useState } from "react";
import { Clock, Monitor, BookOpen, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TestAttemptDetail, type EnrichedTestAttempt, type QuestionData } from "./TestAttemptDetail";

interface LoginRecord {
  id: string;
  logged_in_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface CourseAccessRecord {
  id: string;
  course_id: string;
  accessed_at: string;
  user_agent: string | null;
  course_title?: string;
}

interface ActivityTabProps {
  userId: string;
  organizationId: string;
  studentName?: string;
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Неизвестно";
  if (ua.includes("Mobile")) return "📱 Мобильный";
  if (ua.includes("Chrome")) return "🌐 Chrome";
  if (ua.includes("Firefox")) return "🦊 Firefox";
  if (ua.includes("Safari")) return "🍎 Safari";
  if (ua.includes("Edge")) return "🌐 Edge";
  return "🖥 Браузер";
}

export function ActivityTab({ userId, organizationId, studentName }: ActivityTabProps) {
  const [history, setHistory] = useState<LoginRecord[]>([]);
  const [courseAccess, setCourseAccess] = useState<CourseAccessRecord[]>([]);
  const [testAttempts, setTestAttempts] = useState<EnrichedTestAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    setIsLoading(true);
    const [loginRes, accessRes, attemptsRes] = await Promise.all([
      supabase
        .from("student_login_history")
        .select("*")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .order("logged_in_at", { ascending: false })
        .limit(50),
      supabase
        .from("course_access_log")
        .select("id, course_id, accessed_at, user_agent")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .order("accessed_at", { ascending: false })
        .limit(50),
      supabase
        .from("test_attempts")
        .select("id, lesson_id, score, max_score, completed_at, answers, shown_question_ids")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(100),
    ]);

    setHistory((loginRes.data as LoginRecord[]) || []);

    // Enrich course access with titles
    const accessData = (accessRes.data || []) as CourseAccessRecord[];
    if (accessData.length > 0) {
      const courseIds = [...new Set(accessData.map((a) => a.course_id))];
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title")
        .in("id", courseIds);
      const courseMap = new Map((courses || []).map((c: any) => [c.id, c.title]));
      accessData.forEach((a) => {
        a.course_title = courseMap.get(a.course_id) || "Неизвестный курс";
      });
    }
    setCourseAccess(accessData);

    // Enrich test attempts
    const rawAttempts = (attemptsRes.data || []) as any[];
    if (rawAttempts.length > 0) {
      const lessonIds = [...new Set(rawAttempts.map((a) => a.lesson_id))];
      
      const [lessonsRes, questionsRes] = await Promise.all([
        supabase
          .from("lessons")
          .select("id, title, course_id, test_passing_score")
          .in("id", lessonIds),
        supabase
          .from("test_questions")
          .select("id, lesson_id, question, options, correct_answer, explanation, order_index")
          .in("lesson_id", lessonIds)
          .order("order_index", { ascending: true }),
      ]);

      const lessonMap = new Map((lessonsRes.data || []).map((l: any) => [l.id, l]));
      const questionsByLesson = new Map<string, QuestionData[]>();
      (questionsRes.data || []).forEach((q: any) => {
        const list = questionsByLesson.get(q.lesson_id) || [];
        list.push({
          id: q.id,
          question: q.question,
          options: Array.isArray(q.options) ? q.options.map((o: any) => typeof o === 'object' && o !== null ? o.text : String(o)) : [],
          correct_answer: q.correct_answer,
          explanation: q.explanation });
        questionsByLesson.set(q.lesson_id, list);
      });

      // Get course titles
      const courseIds = [...new Set((lessonsRes.data || []).map((l: any) => l.course_id).filter(Boolean))];
      const { data: courses } = courseIds.length > 0
        ? await supabase.from("courses").select("id, title").in("id", courseIds)
        : { data: [] };
      const courseMap = new Map((courses || []).map((c: any) => [c.id, c.title]));

      // Filter attempts to only those belonging to org courses
      const orgCourseIds = new Set(
        (courses || [])
          .map((c: any) => c.id)
      );
      
      // We need to check org ownership - get org courses
      const { data: orgCourses } = await supabase
        .from("courses")
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", courseIds);
      const orgCourseIdSet = new Set((orgCourses || []).map((c: any) => c.id));

      const enriched: EnrichedTestAttempt[] = rawAttempts
        .filter((a) => {
          const lesson = lessonMap.get(a.lesson_id);
          return lesson && orgCourseIdSet.has(lesson.course_id);
        })
        .map((a) => {
          const lesson = lessonMap.get(a.lesson_id)!;
          return {
            id: a.id,
            lesson_id: a.lesson_id,
            lesson_title: lesson.title,
            course_title: courseMap.get(lesson.course_id) || "Неизвестный курс",
            score: a.score,
            max_score: a.max_score,
            completed_at: a.completed_at,
            answers: (a.answers as Record<string, number>) || {},
            shown_question_ids: a.shown_question_ids as string[] | null,
            passing_score: lesson.test_passing_score || 60,
            questions: questionsByLesson.get(a.lesson_id) || [] };
        });

      setTestAttempts(enriched);
    } else {
      setTestAttempts([]);
    }

    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <Tabs defaultValue="courses" className="space-y-4">
      <TabsList>
        <TabsTrigger value="courses">
          <BookOpen className="w-4 h-4 mr-1.5" />
          Заходы на курсы ({courseAccess.length})
        </TabsTrigger>
        <TabsTrigger value="tests">
          <ClipboardCheck className="w-4 h-4 mr-1.5" />
          Тестирование ({testAttempts.length})
        </TabsTrigger>
        <TabsTrigger value="logins">
          <Monitor className="w-4 h-4 mr-1.5" />
          Входы на платформу ({history.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="courses">
        {courseAccess.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Нет записей о заходах на курсы</p>
          </div>
        ) : (
          <div className="space-y-2">
            {courseAccess.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-4 p-3 rounded-xl bg-muted/50 border border-border"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {record.course_title}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span>
                      {format(new Date(record.accessed_at), "d MMMM yyyy, HH:mm", { locale: ru })}
                    </span>
                    <span>{parseUserAgent(record.user_agent)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="tests">
        {testAttempts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Нет записей о тестировании</p>
          </div>
        ) : (
          <div className="space-y-2">
            {testAttempts.map((attempt) => (
              <TestAttemptDetail
                key={attempt.id}
                attempt={attempt}
                studentName={studentName || "Студент"}
              />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="logins">
        {history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Нет записей о входах</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-4 p-3 rounded-xl bg-muted/50 border border-border"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {format(new Date(record.logged_in_at), "d MMMM yyyy, HH:mm", { locale: ru })}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span>{parseUserAgent(record.user_agent)}</span>
                    {record.ip_address && (
                      <span className="font-mono">{record.ip_address}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
