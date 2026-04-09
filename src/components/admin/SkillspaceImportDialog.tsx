import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertTriangle, Download, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SkillspaceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onSuccess?: () => void;
}

interface ImportResult {
  courseId: string;
  courseTitle: string;
  lessonsTotal: number;
  lessonsCreated: number;
  lessonsWithContent: number;
  lessonsAccessDenied?: number;
  importMode?: "school" | "student";
  schoolApiAvailable?: boolean;
}

export function SkillspaceImportDialog({ open, onOpenChange, organizationId, onSuccess }: SkillspaceImportDialogProps) {
  const [url, setUrl] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!url || !login || !password) {
      setError("Заполните все поля");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Use direct fetch with extended timeout (5 min) — the function processes 80+ lessons sequentially
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/parse-skillspace-course`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
        },
        body: JSON.stringify({ url, login, password, organizationId }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const data = await response.json();
      const fnError = !response.ok ? { message: data?.error || `HTTP ${response.status}` } : null;

      if (fnError) {
        setError(fnError.message || "Ошибка при вызове функции");
        return;
      }

      if (data?.error) {
        setError(data.error);
        return;
      }

      if (data?.success) {
        setResult({
          courseId: data.courseId,
          courseTitle: data.courseTitle,
          lessonsTotal: data.lessonsTotal,
          lessonsCreated: data.lessonsCreated,
          lessonsWithContent: data.lessonsWithContent,
          lessonsAccessDenied: data.lessonsAccessDenied,
          importMode: data.importMode,
          schoolApiAvailable: data.schoolApiAvailable,
        });
        onSuccess?.();
      }
    } catch (err) {
      setError("Непредвиденная ошибка: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setUrl("");
      setLogin("");
      setPassword("");
      setError(null);
      setResult(null);
      onOpenChange(false);
    }
  };

  const isPartialImport = result && (
    result.importMode === "student" ||
    (result.lessonsAccessDenied && result.lessonsAccessDenied > 0) ||
    result.lessonsWithContent === 0
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Импорт курса со SkillSpace
          </DialogTitle>
          <DialogDescription>
            Введите URL курса и учётные данные SkillSpace для автоматического импорта структуры и контента.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ss-url">URL курса</Label>
              <Input
                id="ss-url"
                placeholder="https://school.skillspace.ru/course/12345/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ss-login">Email / Логин</Label>
              <Input
                id="ss-login"
                type="email"
                placeholder="email@example.com"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ss-password">Пароль</Label>
              <Input
                id="ss-password"
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

            {loading && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Парсинг курса... Это может занять до минуты.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {isPartialImport && (
              <Alert className="border-yellow-500/30 bg-yellow-50 dark:bg-yellow-900/10">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  {result.importMode === "student" && !result.schoolApiAvailable ? (
                    <>
                      <p className="font-semibold">Импорт выполнен в ограниченном режиме</p>
                      <p className="text-sm mt-1">
                        Административный API SkillSpace недоступен для этого аккаунта. 
                        Импортированы только уроки, доступные студенту. 
                        Для полного импорта используйте аккаунт владельца школы.
                      </p>
                    </>
                  ) : result.lessonsWithContent === 0 ? (
                    <>
                      <p className="font-semibold">Уроки созданы, но без контента</p>
                      <p className="text-sm mt-1">
                        Не удалось извлечь содержимое уроков. Возможно, у аккаунта нет доступа к контенту.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">Частичный импорт</p>
                      <p className="text-sm mt-1">
                        Некоторые уроки были пропущены из-за ограничений доступа ({result.lessonsAccessDenied} уроков).
                      </p>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Alert className="border-primary/20 bg-primary/5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertDescription className="text-foreground">
                <p className="font-semibold">Курс импортирован!</p>
                <p className="mt-1">«{result.courseTitle}»</p>
                <ul className="mt-2 text-sm space-y-1">
                  <li>Уроков найдено: {result.lessonsTotal}</li>
                  <li>Уроков создано: {result.lessonsCreated}</li>
                  <li>С контентом: {result.lessonsWithContent}</li>
                  {result.lessonsAccessDenied ? (
                    <li className="text-yellow-600">Без доступа: {result.lessonsAccessDenied}</li>
                  ) : null}
                </ul>
                {result.importMode && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Режим: {result.importMode === "school" ? "Администратор" : "Студент"}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Отмена
              </Button>
              <Button onClick={handleImport} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Импорт...
                  </>
                ) : (
                  "Импортировать"
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Закрыть</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
