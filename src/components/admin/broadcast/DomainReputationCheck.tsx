import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

interface DomainReport {
  domain: string;
  spf: { found: boolean; value: string | null; status: "ok" | "warn" | "missing"; note: string };
  dmarc: { found: boolean; value: string | null; policy: string | null; status: "ok" | "warn" | "missing"; note: string };
  dkim: { selectors_checked: string[]; found_selectors: string[]; status: "ok" | "warn" | "missing"; note: string };
  mx: { found: boolean; records: string[] };
  score: number;
  recommendations: string[];
}

const StatusIcon = ({ status }: { status: "ok" | "warn" | "missing" }) => {
  if (status === "ok") return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  if (status === "warn") return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  return <XCircle className="w-5 h-5 text-destructive" />;
};

export function DomainReputationCheck() {
  const [domain, setDomain] = useState("sintagma.com.ru");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DomainReport | null>(null);

  const run = async () => {
    if (!domain.trim()) { toast.error("Укажите домен"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-domain-check", {
        body: { domain: domain.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReport(data as DomainReport);
    } catch (e: any) {
      toast.error("Ошибка проверки: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = report ? (report.score >= 80 ? "text-emerald-500" : report.score >= 50 ? "text-amber-500" : "text-destructive") : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Репутация домена отправителя (SPF / DKIM / DMARC)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          />
          <Button onClick={run} disabled={loading} className="gap-1">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Проверить
          </Button>
        </div>

        {report && (
          <div className="space-y-4">
            {/* Score */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Общий балл репутации</span>
                <span className={`text-2xl font-bold ${scoreColor}`}>{report.score}/100</span>
              </div>
              <Progress value={report.score} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {report.score >= 80 && "Отличная настройка домена."}
                {report.score >= 50 && report.score < 80 && "Базовая защита настроена, но есть что улучшить."}
                {report.score < 50 && "Защита домена слабая. Письма могут попадать в спам или подменяться."}
              </p>
            </div>

            {/* SPF */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon status={report.spf.status} />
                  <span className="font-medium">SPF</span>
                  <Badge variant={report.spf.found ? "secondary" : "outline"}>{report.spf.found ? "найдено" : "нет"}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{report.spf.note}</p>
              {report.spf.value && (
                <code className="block text-xs bg-muted/50 p-2 rounded break-all">{report.spf.value}</code>
              )}
            </div>

            {/* DKIM */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon status={report.dkim.status} />
                  <span className="font-medium">DKIM</span>
                  <Badge variant={report.dkim.found_selectors.length > 0 ? "secondary" : "outline"}>
                    {report.dkim.found_selectors.length > 0 ? `${report.dkim.found_selectors.length} селектор(а)` : "нет"}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{report.dkim.note}</p>
              <p className="text-[10px] text-muted-foreground">Проверены селекторы: {report.dkim.selectors_checked.join(", ")}</p>
            </div>

            {/* DMARC */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon status={report.dmarc.status} />
                  <span className="font-medium">DMARC</span>
                  {report.dmarc.policy && <Badge variant="secondary">p={report.dmarc.policy}</Badge>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{report.dmarc.note}</p>
              {report.dmarc.value && (
                <code className="block text-xs bg-muted/50 p-2 rounded break-all">{report.dmarc.value}</code>
              )}
            </div>

            {/* MX */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center gap-2">
                {report.mx.found ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-destructive" />}
                <span className="font-medium">MX-записи</span>
                <Badge variant={report.mx.found ? "secondary" : "outline"}>{report.mx.records.length}</Badge>
              </div>
              {report.mx.records.length > 0 && (
                <p className="text-xs text-muted-foreground">{report.mx.records.join(" · ")}</p>
              )}
            </div>

            {report.recommendations.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Рекомендации:</p>
                <ul className="text-xs space-y-1 list-disc pl-4">
                  {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
