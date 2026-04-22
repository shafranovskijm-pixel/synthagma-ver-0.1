import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, ShieldCheck, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Factor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
  created_at: string;
}

export function TwoFactorSetup() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pendingFactor, setPendingFactor] = useState<{
    id: string;
    qr: string;
    secret: string;
    uri: string;
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [factorToRemove, setFactorToRemove] = useState<string | null>(null);

  const loadFactors = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error("Не удалось загрузить факторы", { description: error.message });
      setLoading(false);
      return;
    }
    const totp = (data?.totp || []) as any[];
    setFactors(totp.map((f) => ({
      id: f.id,
      friendly_name: f.friendly_name,
      factor_type: f.factor_type,
      status: f.status,
      created_at: f.created_at,
    })));
    setLoading(false);
  };

  useEffect(() => {
    loadFactors();
  }, []);

  const startEnrollment = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString("ru-RU")}`,
    });
    setEnrolling(false);
    if (error) {
      toast.error("Не удалось начать настройку", { description: error.message });
      return;
    }
    setPendingFactor({
      id: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  };

  const verifyEnrollment = async () => {
    if (!pendingFactor) return;
    if (verifyCode.length !== 6) {
      toast.error("Введите 6-значный код");
      return;
    }
    setVerifying(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: pendingFactor.id,
    });
    if (chErr) {
      setVerifying(false);
      toast.error("Ошибка проверки", { description: chErr.message });
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: pendingFactor.id,
      challengeId: ch.id,
      code: verifyCode,
    });
    setVerifying(false);
    if (vErr) {
      toast.error("Неверный код", { description: vErr.message });
      return;
    }
    toast.success("2FA подключена!");
    setPendingFactor(null);
    setVerifyCode("");
    await loadFactors();
  };

  const cancelEnrollment = async () => {
    if (!pendingFactor) return;
    await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
    setPendingFactor(null);
    setVerifyCode("");
    await loadFactors();
  };

  const removeFactor = async () => {
    if (!factorToRemove) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factorToRemove });
    if (error) {
      toast.error("Не удалось удалить", { description: error.message });
      return;
    }
    toast.success("Фактор удалён");
    setFactorToRemove(null);
    await loadFactors();
  };

  const verifiedFactors = factors.filter((f) => f.status === "verified");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="w-5 h-5" />
          Двухфакторная аутентификация (2FA)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Используйте Google Authenticator, Authy или 1Password для генерации одноразовых кодов.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
          </div>
        ) : (
          <>
            {verifiedFactors.length === 0 && !pendingFactor && (
              <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                <Shield className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  2FA не настроена. Подключите для повышения безопасности аккаунта.
                </p>
                <Button onClick={startEnrollment} disabled={enrolling}>
                  {enrolling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                  Подключить 2FA
                </Button>
              </div>
            )}

            {verifiedFactors.length > 0 && (
              <div className="space-y-2">
                {verifiedFactors.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="font-medium text-sm">{f.friendly_name || "Authenticator"}</div>
                        <div className="text-xs text-muted-foreground">
                          Подключён {new Date(f.created_at).toLocaleDateString("ru-RU")}
                        </div>
                      </div>
                      <Badge variant="secondary">Активен</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => setFactorToRemove(f.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {pendingFactor && (
              <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                <div>
                  <Label className="text-sm font-semibold">Шаг 1: Отсканируйте QR-код</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Откройте приложение-аутентификатор и отсканируйте код:
                  </p>
                  <div className="flex justify-center bg-white p-4 rounded-lg">
                    <img
                      src={pendingFactor.qr}
                      alt="QR код 2FA"
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Или введите код вручную: <code className="bg-background px-2 py-1 rounded text-xs">{pendingFactor.secret}</code>
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Шаг 2: Введите код из приложения</Label>
                  <Input
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="text-center text-2xl tracking-widest font-mono mt-2"
                    maxLength={6}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={verifyEnrollment} disabled={verifying || verifyCode.length !== 6} className="flex-1">
                    {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Подтвердить
                  </Button>
                  <Button variant="outline" onClick={cancelEnrollment}>
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={!!factorToRemove} onOpenChange={(o) => !o && setFactorToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить 2FA?</AlertDialogTitle>
            <AlertDialogDescription>
              После удаления вы будете входить только по паролю. Это снизит безопасность аккаунта.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={removeFactor} className="bg-destructive text-destructive-foreground">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
