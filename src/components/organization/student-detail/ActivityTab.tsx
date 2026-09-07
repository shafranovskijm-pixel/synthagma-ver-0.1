import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock, Monitor, BookOpen, ClipboardCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TestAttemptDetail, type EnrichedTestAttempt, type QuestionData } from "./TestAttemptDetail";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Button } from "@/components/ui/button";

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
  defaultSubTab?: "courses" | "tests" | "logins";
  onlySubTab?: boolean;
}

function ActivityLoadError({ title, message, onRetry, retrying = false }: {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4 gap-2 rounded-xl" onClick={onRetry} disabled={retrying}>
        <RefreshCw className="h-4 w-4" /> {retrying ? "Загрузка…" : "Повторить"}
      </Button>
    </div>
  );
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

export function ActivityTab({ userId, organizationId, studentName, defaultSubTab = "courses", onlySubTab = false }: ActivityTabProps) {
  const shouldLoadTests = defaultSubTab === "tests";
  const shouldLoadActivity = !onlySubTab || !shouldLoadTests;
  const scopeKey = `${organizationId}:${userId}:${shouldLoadTests ? "tests" : "activity"}`;
  const activeScopeKeyRef = useRef(scopeKey);
  activeScopeKeyRef.current = scopeKey;
  const [history, setHistory] = useState<LoginRecord[]>([]);
  const [courseAccess, setCourseAccess] = useState<CourseAccessRecord[]>([]);
  const [testAttempts, setTestAttempts] = useState<EnrichedTestAttempt[]>([]);
  const [loadingScopeKey, setLoadingScopeKey] = useState<string | null>(scopeKey);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ scopeKey: string; message: string } | null>(null);
  const [activityErrors, setActivityErrors] = useState<{
    scopeKey: string;
    logins: string | null;
    courses: string | null;
  } | null>(null);
  const requestSequenceRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestScopeKey = scopeKey;
    const requestSequence = ++requestSequenceRef.current;
    const isCurrentRequest = () => (
      requestSequenceRef.current === requestSequence
      && activeScopeKeyRef.current === requestScopeKey
    );
    setLoadingScopeKey(requestScopeKey);
    setLoadError(null);

    try {
      let nextHistory: LoginRecord[] = [];
      let nextCourseAccess: CourseAccessRecord[] = [];
      let nextTestAttempts: EnrichedTestAttempt[] = [];
      const nextActivityErrors = { scopeKey: requestScopeKey, logins: null as string | null, courses: null as string | null };

      if (shouldLoadActivity) {
        // The two histories are independent; an unavailable journal must not hide the other.
        const [loginResult, accessResult] = await Promise.allSettled([
          (async () => {
            const loginRes = await supabase
              .from("student_login_history")
              .select("*")
              .eq("user_id", userId)
              .eq("organization_id", organizationId)
              .order("logged_in_at", { ascending: false })
              .limit(50);
            if (loginRes.error) throw loginRes.error;
            return (loginRes.data || []) as LoginRecord[];
          })(),
          (async () => {
            const accessRes = await supabase
              .from("course_access_log")
              .select("id, course_id, accessed_at, user_agent")
              .eq("user_id", userId)
              .eq("organization_id", organizationId)
              .order("accessed_at", { ascending: false })
              .limit(50);
            if (accessRes.error) throw accessRes.error;
            const accessData = (accessRes.data || []) as CourseAccessRecord[];
            if (accessData.length === 0) return [];
            const courseIds = [...new Set(accessData.map((item) => item.course_id))];
            const coursesRes = await supabase
              .from("courses")
              .select("id, title")
              .eq("organization_id", organizationId)
              .in("id", courseIds);
            if (coursesRes.error) throw coursesRes.error;
            const courseMap = new Map((coursesRes.data || []).map((course: any) => [course.id, course.title]));
            return accessData.map((item) => ({
              ...item,
              course_title: courseMap.get(item.course_id) || "Неизвестный курс",
            }));
          })(),
        ]);
        if (loginResult.status === "fulfilled") {
          nextHistory = loginResult.value;
        } else {
          nextActivityErrors.logins = "Не удалось подтвердить историю входов на платформу. Повторите загрузку.";
        }
        if (accessResult.status === "fulfilled") {
          nextCourseAccess = accessResult.value;
        } else {
          nextActivityErrors.courses = "Не удалось подтвердить историю заходов на курсы. Повторите загрузку.";
        }
      }

      if (shouldLoadTests) {
        const attemptsRes = await supabase.rpc('get_test_attempt_history' as never, {
          p_user_id: userId, p_organization_id: organizationId,
        } as never);
        if (attemptsRes.error || !Array.isArray(attemptsRes.data)) throw new Error('Не удалось загрузить историю тестирования');
        nextTestAttempts = (attemptsRes.data as unknown as EnrichedTestAttempt[]).map(attempt => ({
          ...attempt, course_title: attempt.course_title || 'Курс',
          answers: attempt.answers || {}, questions: attempt.questions || [],
          shown_question_ids: attempt.shown_question_ids || (attempt.questions || []).map(q => q.id),
        }));
      }

      if (!isCurrentRequest()) return;
      setHistory(nextHistory);
      setCourseAccess(nextCourseAccess);
      setTestAttempts(nextTestAttempts);
      setActivityErrors(nextActivityErrors);
      setLoadedScopeKey(requestScopeKey);
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error("[ActivityTab] load failed:", error);
      setHistory([]);
      setCourseAccess([]);
      setTestAttempts([]);
      setActivityErrors(null);
      setLoadedScopeKey(null);
      setLoadError({
        scopeKey: requestScopeKey,
        message: "Не удалось подтвердить данные ученика. Повторите загрузку.",
      });
    } finally {
      if (isCurrentRequest()) setLoadingScopeKey(null);
    }
  }, [organizationId, scopeKey, shouldLoadActivity, shouldLoadTests, userId]);

  useEffect(() => {
    void loadData();
    return () => {
      requestSequenceRef.current += 1;
    };
  }, [loadData]);

  const hasCurrentScopeData = loadedScopeKey === scopeKey;
  const currentLoadError = loadError?.scopeKey === scopeKey ? loadError.message : null;
  const currentActivityErrors = activityErrors?.scopeKey === scopeKey ? activityErrors : null;
  const currentHistory = hasCurrentScopeData ? history : [];
  const currentCourseAccess = hasCurrentScopeData ? courseAccess : [];
  const currentTestAttempts = hasCurrentScopeData ? testAttempts : [];
  const isLoading = !currentLoadError && (
    loadingScopeKey === scopeKey || !hasCurrentScopeData
  );

  if (isLoading && !hasCurrentScopeData) {
    return (
      <div className="flex justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  if (currentLoadError) {
    return (
      <ActivityLoadError
        title="Не удалось загрузить данные ученика"
        message={currentLoadError}
        onRetry={() => void loadData()}
      />
    );
  }

  return (
    <Tabs defaultValue={defaultSubTab} className="space-y-4">
      {!onlySubTab && (
        <TabsList>
          <TabsTrigger value="courses">
            <BookOpen className="w-4 h-4 mr-1.5" />
            Заходы на курсы ({currentActivityErrors?.courses ? "!" : currentCourseAccess.length})
          </TabsTrigger>
          <TabsTrigger value="logins">
            <Monitor className="w-4 h-4 mr-1.5" />
            Входы на платформу ({currentActivityErrors?.logins ? "!" : currentHistory.length})
          </TabsTrigger>
        </TabsList>
      )}

      <TabsContent value="courses">
        {currentActivityErrors?.courses ? (
          <ActivityLoadError
            title="Не удалось загрузить заходы на курсы"
            message={currentActivityErrors.courses}
            onRetry={() => void loadData()}
            retrying={isLoading}
          />
        ) : currentCourseAccess.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Нет записей о заходах на курсы</p>
          </div>
        ) : (
          <div className="space-y-2">
            {currentCourseAccess.map((record) => (
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
        {currentTestAttempts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Нет записей о тестировании</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Всего попыток: {currentTestAttempts.length}. Завершено: {currentTestAttempts.filter(attempt => !!attempt.completed_at).length}. Не завершено: {currentTestAttempts.filter(attempt => !attempt.completed_at).length}.</p>
            {currentTestAttempts.map((attempt) => (
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
        {currentActivityErrors?.logins ? (
          <ActivityLoadError
            title="Не удалось загрузить входы на платформу"
            message={currentActivityErrors.logins}
            onRetry={() => void loadData()}
            retrying={isLoading}
          />
        ) : currentHistory.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Нет записей о входах</p>
          </div>
        ) : (
          <div className="space-y-2">
            {currentHistory.map((record) => (
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
