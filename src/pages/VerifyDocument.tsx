import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, ShieldAlert, Search, ArrowLeft, FileCheck2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

interface VerificationResult {
  valid: boolean;
  error?: string;
  document?: {
    reg_number: string;
    full_name_masked: string;
    document_type: string;
    document_number: string;
    document_series?: string | null;
    issue_date: string;
    specialty_name: string;
    qualification_name?: string | null;
    status: string;
    organization_name?: string | null;
    protocol_number?: string | null;
    protocol_date?: string | null;
  };
}

const DOC_TYPE_LABELS: Record<string, string> = {
  diploma: "Диплом о профессиональной переподготовке",
  certificate: "Удостоверение о повышении квалификации",
  qualification: "Свидетельство о профессии рабочего",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  original: { label: "Оригинал", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  duplicate: { label: "Дубликат", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  copy: { label: "Копия", color: "bg-sky-500/10 text-sky-600 border-sky-500/30" },
  cancelled: { label: "Аннулирован", color: "bg-destructive/10 text-destructive border-destructive/30" },
  invalidated: { label: "Признан недействительным", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    return format(parseISO(d), "dd MMMM yyyy", { locale: ru });
  } catch {
    return d;
  }
}

export default function VerifyDocument() {
  const { regNumber } = useParams<{ regNumber: string }>();
  const [search, setSearch] = useState(regNumber ?? "");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const verify = async (num: string) => {
    if (!num.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-verify-document?reg_number=${encodeURIComponent(num.trim())}`;
      const res = await fetch(url, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ valid: false, error: "Ошибка соединения" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (regNumber) verify(regNumber);
  }, [regNumber]);

  const doc = result?.document;
  const statusInfo = doc ? STATUS_LABELS[doc.status] ?? { label: doc.status, color: "bg-muted" } : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Helmet>
        <title>Проверка подлинности документа об образовании | Синтагма</title>
        <meta name="description" content="Публичный реестр документов об образовании. Проверьте подлинность удостоверения, диплома или свидетельства по регистрационному номеру." />
      </Helmet>

      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            На главную
          </Link>
          <div className="flex items-center gap-2 text-primary font-semibold">
            <ShieldAlert className="w-5 h-5" />
            Реестр документов
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="text-center mb-10 space-y-3">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-2">
            <FileCheck2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">Проверка подлинности документа</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Введите регистрационный номер с документа об образовании, чтобы убедиться в его подлинности.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verify(search);
              }}
              className="flex gap-2"
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Например: ДОК-2025/0001"
                className="flex-1 rounded-xl"
              />
              <Button type="submit" disabled={loading} className="rounded-xl">
                <Search className="w-4 h-4 mr-1" />
                Проверить
              </Button>
            </form>
          </CardContent>
        </Card>

        {loading && (
          <Card>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        )}

        {!loading && result && !result.valid && !doc && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 flex items-start gap-3">
              <XCircle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-lg mb-1">Документ не найден</h3>
                <p className="text-sm text-muted-foreground">
                  {result.error ?? "Регистрационный номер не зарегистрирован в реестре."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && doc && (
          <Card className={result?.valid ? "border-emerald-500/30" : "border-destructive/30"}>
            <CardHeader className="border-b">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {result?.valid ? (
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  ) : (
                    <XCircle className="w-8 h-8 text-destructive" />
                  )}
                  <div>
                    <CardTitle className="text-xl">
                      {result?.valid ? "Документ подлинный" : "Документ недействителен"}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Запись найдена в официальном реестре
                    </p>
                  </div>
                </div>
                {statusInfo && (
                  <Badge variant="outline" className={`${statusInfo.color} rounded-lg`}>
                    {statusInfo.label}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <Field label="Регистрационный номер" value={<span className="font-mono">{doc.reg_number}</span>} />
              <Field label="Тип документа" value={DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type} />
              <Field
                label="Серия и номер"
                value={
                  <span className="font-mono">
                    {doc.document_series ? `${doc.document_series} ` : ""}
                    {doc.document_number}
                  </span>
                }
              />
              <Field label="ФИО получателя" value={doc.full_name_masked} />
              <Field label="Программа" value={doc.specialty_name} />
              {doc.qualification_name && <Field label="Квалификация" value={doc.qualification_name} />}
              <Field label="Дата выдачи" value={formatDate(doc.issue_date)} />
              {doc.organization_name && <Field label="Образовательная организация" value={doc.organization_name} />}
              {doc.protocol_number && (
                <Field
                  label="Протокол итоговой аттестации"
                  value={`№ ${doc.protocol_number}${doc.protocol_date ? ` от ${formatDate(doc.protocol_date)}` : ""}`}
                />
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center mt-8">
          Персональные данные владельца документа отображаются в обезличенном виде в соответствии с 152-ФЗ.
        </p>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 py-2 border-b last:border-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="md:col-span-2 text-sm font-medium">{value}</div>
    </div>
  );
}
