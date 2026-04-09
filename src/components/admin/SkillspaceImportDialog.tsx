import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
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
      const { data, error: fnError } = await supabase.functions.invoke("parse-skillspace-course", {
        body: { url, login, password, organizationId },
      });

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
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <p className="font-semibold">Курс успешно импортирован!</p>
                <p className="mt-1">«{result.courseTitle}»</p>
                <ul className="mt-2 text-sm space-y-1">
                  <li>Уроков найдено: {result.lessonsTotal}</li>
                  <li>Уроков создано: {result.lessonsCreated}</li>
                  <li>С контентом: {result.lessonsWithContent}</li>
                </ul>
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
