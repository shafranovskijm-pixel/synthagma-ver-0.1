import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { PepSignatureStamp } from "@/components/signing/PepSignatureStamp";
import { getPepAgreementText, PEP_AGREEMENT_VERSION } from "@/constants/pepAgreementTemplate";
import { sha256Hex } from "@/utils/documentHash";
import { CheckCircle2, FileText, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

interface SigData {
  id: string;
  document_type: string;
  document_title: string;
  document_html: string | null;
  document_hash: string | null;
  organization_id: string;
  organization_name: string;
  organization_inn: string | null;
  recipient_email: string;
  recipient_name: string;
  recipient_user_id: string | null;
  status: string;
  expires_at: string;
  signed_at: string | null;
}

type Step = "loading" | "identity" | "agreement" | "review" | "sign" | "done" | "error" | "expired" | "already-signed";

export default function SignDocument() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>("loading");
  const [sig, setSig] = useState<SigData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signAccepted, setSignAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ ip: string; signedAt: string; pepAgreementId: string } | null>(null);

  useEffect(() => {
    if (!token) { setStep("error"); setErrorMsg("Токен не указан"); return; }
    (async () => {
      const { data, error } = await supabase.rpc("get_signature_by_token", { p_token: token });
      if (error || !data || data.length === 0) {
        setStep("error");
        setErrorMsg("Документ не найден или ссылка недействительна");
        return;
      }
      const row = data[0] as SigData;
      setSig(row);
      setFullName(row.recipient_name);
      setEmail(row.recipient_email);

      if (row.status === "signed") { setStep("already-signed"); return; }
      if (new Date(row.expires_at) < new Date()) { setStep("expired"); return; }
      setStep("identity");
    })();
  }, [token]);

  const today = new Date().toLocaleDateString("ru-RU");
  const agreementText = sig ? getPepAgreementText({
    org_name: sig.organization_name,
    org_inn: sig.organization_inn || undefined,
    user_name: fullName || sig.recipient_name,
    user_email: email || sig.recipient_email,
    current_date: today,
  }) : "";

  const handleSign = async () => {
    if (!sig || !signAccepted || !agreementAccepted) return;
    setSubmitting(true);
    try {
      const docHash = sig.document_html ? await sha256Hex(sig.document_html) : await sha256Hex(sig.document_title);
      const { data, error } = await supabase.functions.invoke("finalize-signature", {
        body: {
          token,
          documentHash: docHash,
          pepAgreement: {
            agreement_text: agreementText,
            agreement_version: PEP_AGREEMENT_VERSION,
            full_name: fullName,
            email,
          },
        },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Ошибка подписания");
      }
      setSignedInfo({
        ip: (data as any).ip,
        signedAt: (data as any).signedAt,
        pepAgreementId: (data as any).pepAgreementId,
      });
      setStep("done");
      toast.success("Документ успешно подписан");
    } catch (e: any) {
      toast.error(e.message || "Не удалось подписать документ");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <>
      <Helmet><title>Подписание документа · Синтагма</title></Helmet>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-primary/5 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3">
              <ShieldCheck className="w-4 h-4" /> Простая электронная подпись · 63-ФЗ
            </div>
            <h1 className="text-2xl font-bold">Подписание документа</h1>
            {sig && <p className="text-muted-foreground text-sm mt-1">Отправитель: <strong>{sig.organization_name}</strong></p>}
          </div>

          {step === "error" && (
            <Card><CardContent className="pt-6 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-destructive mb-3" />
              <h2 className="font-bold text-lg mb-1">Ошибка</h2>
              <p className="text-muted-foreground">{errorMsg}</p>
            </CardContent></Card>
          )}

          {step === "expired" && (
            <Card><CardContent className="pt-6 text-center">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <h2 className="font-bold text-lg mb-1">Ссылка просрочена</h2>
              <p className="text-muted-foreground">Срок действия ссылки истёк. Запросите новый документ у отправителя.</p>
            </CardContent></Card>
          )}

          {step === "already-signed" && sig && (
            <Card><CardContent className="pt-6 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-primary mb-3" />
              <h2 className="font-bold text-lg mb-1">Документ уже подписан</h2>
              <p className="text-muted-foreground">«{sig.document_title}» подписан {sig.signed_at ? new Date(sig.signed_at).toLocaleString("ru-RU") : ""}.</p>
            </CardContent></Card>
          )}

          {step === "identity" && sig && (
            <Card>
              <CardHeader>
                <CardTitle>Шаг 1 из 4 · Подтверждение личности</CardTitle>
                <CardDescription>Проверьте ваши данные. Они будут использованы для подписания.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>ФИО</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Иванов Иван Иванович" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button className="w-full" onClick={() => setStep("agreement")} disabled={!fullName.trim() || !email.trim()}>
                  Далее
                </Button>
              </CardContent>
            </Card>
          )}

          {step === "agreement" && sig && (
            <Card>
              <CardHeader>
                <CardTitle>Шаг 2 из 4 · Соглашение о ПЭП</CardTitle>
                <CardDescription>Ознакомьтесь и примите Соглашение об использовании простой электронной подписи.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-80 rounded-lg border p-4 bg-muted/20">
                  <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{agreementText}</pre>
                </ScrollArea>
                <div className="flex items-start gap-2">
                  <Checkbox id="agree" checked={agreementAccepted} onCheckedChange={(v) => setAgreementAccepted(!!v)} />
                  <Label htmlFor="agree" className="text-sm leading-relaxed cursor-pointer">
                    Я ознакомился(ась) и принимаю условия Соглашения об использовании простой электронной подписи в соответствии с 63-ФЗ.
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("identity")}>Назад</Button>
                  <Button className="flex-1" onClick={() => setStep("review")} disabled={!agreementAccepted}>Далее</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "review" && sig && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Шаг 3 из 4 · Просмотр документа</CardTitle>
                <CardDescription>{sig.document_title}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-white max-h-[500px] overflow-auto">
                  {sig.document_html ? (
                    <div className="p-4" dangerouslySetInnerHTML={{ __html: sig.document_html }} />
                  ) : (
                    <div className="p-6 text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      Документ не содержит текстового представления
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("agreement")}>Назад</Button>
                  <Button className="flex-1" onClick={() => setStep("sign")}>К подписанию</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "sign" && sig && (
            <Card>
              <CardHeader>
                <CardTitle>Шаг 4 из 4 · Подписание</CardTitle>
                <CardDescription>Подтвердите подписание документа простой электронной подписью.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
                  <div className="text-sm"><span className="text-muted-foreground">Документ:</span> <strong>{sig.document_title}</strong></div>
                  <div className="text-sm"><span className="text-muted-foreground">Подписант:</span> <strong>{fullName}</strong> ({email})</div>
                  <div className="text-sm"><span className="text-muted-foreground">Соглашение ПЭП:</span> <Badge variant="secondary">принято {PEP_AGREEMENT_VERSION}</Badge></div>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="sign" checked={signAccepted} onCheckedChange={(v) => setSignAccepted(!!v)} />
                  <Label htmlFor="sign" className="text-sm leading-relaxed cursor-pointer">
                    Я, <strong>{fullName}</strong>, подписываю указанный документ простой электронной подписью. Подпись имеет юридическую силу, равную собственноручной (п. 2 ст. 6 63-ФЗ).
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("review")}>Назад</Button>
                  <Button className="flex-1" onClick={handleSign} disabled={!signAccepted || submitting}>
                    {submitting ? "Подписание…" : "Подписать"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "done" && sig && signedInfo && (
            <Card>
              <CardHeader className="text-center">
                <CheckCircle2 className="w-16 h-16 mx-auto text-primary mb-2" />
                <CardTitle>Документ подписан</CardTitle>
                <CardDescription>«{sig.document_title}» успешно подписан простой электронной подписью.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center">
                  <PepSignatureStamp
                    fullName={fullName}
                    email={email}
                    signedAt={signedInfo.signedAt}
                    ip={signedInfo.ip}
                    documentHash={sig.document_html ? undefined : null}
                    agreementId={signedInfo.pepAgreementId}
                  />
                </div>
                <p className="text-center text-sm text-muted-foreground mt-4">
                  Копия подписанного документа отправлена на {email}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
