import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle, Download, XCircle, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SkillspaceBatchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onSuccess?: () => void;
}

interface ImportJob {
  id: string;
  url: string;
  status: string;
  result: any;
  error_message: string | null;
  organization_id?: string;
}

export function SkillspaceBatchImportDialog({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
}: SkillspaceBatchImportDialogProps) {
  const [urls, setUrls] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [reparsingJobId, setReparsingJobId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll jobs when batchId is set
  useEffect(() => {
    if (!batchId) return;

    const fetchJobs = async () => {
      const { data } = await supabase
        .from("skillspace_import_jobs")
        .select("id, url, status, result, error_message")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true });
      if (data) {
        setJobs(data as ImportJob[]);
        const allDone = data.every((j: any) => j.status === "done" || j.status === "error");
        if (allDone) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          onSuccess?.();
        }
      }
    };

    fetchJobs();
    pollingRef.current = setInterval(fetchJobs, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [batchId]);

  // Check for active batches on open
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("skillspace_import_jobs")
        .select("batch_id")
        .eq("organization_id", organizationId)
        .in("status", ["pending", "processing"])
        .limit(1);
      if (data && data.length > 0) {
        setBatchId((data[0] as any).batch_id);
      }
    })();
  }, [open, organizationId]);

  const handleSubmit = async () => {
    const urlList = urls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urlList.length === 0 || !login || !password) {
      setError("Заполните все поля и добавьте хотя бы одну ссылку");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setError("Не удалось получить токен авторизации. Перелогиньтесь.");
        setLoading(false);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/batch-skillspace-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            urls: urlList,
            login,
            password,
            organizationId,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok || data.error) {
        setError(data.error || `Ошибка ${response.status}`);
        return;
      }

      setBatchId(data.batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setUrls("");
    setLogin("");
    setPassword("");
    setError(null);
    setBatchId(null);
    setJobs([]);
    setReparsingJobId(null);
    onOpenChange(false);
  };

  const handleReparseContent = async (job: ImportJob) => {
    if (!job.result?.courseId || !job.url) return;
    setReparsingJobId(job.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/parse-skillspace-course`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            url: job.url,
            login,
            password,
            organizationId,
            existingCourseId: job.result.courseId,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        // Update the job result in state
        setJobs(prev => prev.map(j => 
          j.id === job.id 
            ? { ...j, result: { ...j.result, lessonsUpdated: data.lessonsUpdated, lessonsWithContent: data.lessonsWithContent, reparseSuccess: true } }
            : j
        ));
      }
    } catch (err) {
      console.error("Reparse error:", err);
    } finally {
      setReparsingJobId(null);
    }
  };

  const doneCount = jobs.filter((j) => j.status === "done").length;
  const errorCount = jobs.filter((j) => j.status === "error").length;
  const allDone = jobs.length > 0 && jobs.every((j) => j.status === "done" || j.status === "error");

  const statusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
      case "error":
        return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
      case "processing":
        return <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "done": return "Готово";
      case "error": return "Ошибка";
      case "processing": return "Импорт...";
      default: return "Ожидание";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Пакетный импорт со SkillSpace
          </DialogTitle>
          <DialogDescription>
            Вставьте ссылки на курсы (по одной на строку). Импорт выполняется на сервере — можно закрыть окно.
          </DialogDescription>
        </DialogHeader>

        {!batchId ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ссылки на курсы (по одной на строку)</Label>
              <Textarea
                placeholder={"https://school.skillspace.ru/course/12345\nhttps://school.skillspace.ru/course/67890"}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                disabled={loading}
                rows={6}
              />
              {urls.trim().length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {urls.split("\n").filter((u) => u.trim()).length} ссылок
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Email / Логин</Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Пароль</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {allDone ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span>
                {allDone
                  ? `Завершено: ${doneCount} успешно, ${errorCount} ошибок`
                  : `Импорт: ${doneCount + errorCount}/${jobs.length}`}
              </span>
            </div>

            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-start gap-2 p-2 rounded-lg border bg-card text-sm"
                >
                  {statusIcon(job.status)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">{job.url}</p>
                    {job.status === "done" && job.result?.courseTitle && (
                      <p className="text-xs text-green-600 mt-0.5">
                        {job.result.courseTitle} — {job.result.lessonsCreated} уроков
                      </p>
                    )}
                    {job.status === "error" && job.error_message && (
                      <p className="text-xs text-destructive mt-0.5">{job.error_message}</p>
                    )}
                  </div>
                  <Badge variant={job.status === "done" ? "default" : job.status === "error" ? "destructive" : "secondary"} className="shrink-0 text-xs">
                    {statusLabel(job.status)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {!batchId ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Отмена
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Отправка...
                  </>
                ) : (
                  "Импортировать все"
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              {allDone ? "Закрыть" : "Закрыть (импорт продолжится)"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
