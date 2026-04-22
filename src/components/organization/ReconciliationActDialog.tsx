import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, FileCheck, Download, Save, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  generateReconciliationActHtml,
  saveReconciliationAct,
  type GeneratedReconciliation,
} from "@/utils/generateReconciliationAct";

interface ReconciliationActDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  organizationInn: string | null;
  company: {
    id: string;
    name: string;
    inn: string | null;
  } | null;
  onSaved?: () => void;
}

export function ReconciliationActDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  organizationInn,
  company,
  onSaved,
}: ReconciliationActDialogProps) {
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);

  const [from, setFrom] = useState(yearStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [act, setAct] = useState<GeneratedReconciliation | null>(null);

  if (!company) return null;

  const handleGenerate = async () => {
    setGenerating(true);
    setAct(null);
    try {
      const result = await generateReconciliationActHtml({
        organizationId,
        organizationName,
        organizationInn,
        companyId: company.id,
        companyName: company.name,
        companyInn: company.inn,
        periodFrom: new Date(from + "T00:00:00"),
        periodTo: new Date(to + "T23:59:59"),
      });
      if (!result) {
        toast.error("Не удалось сформировать акт сверки");
        return;
      }
      setAct(result);
      toast.success(`Найдено операций: ${result.rowCount}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!act) return;
    setSaving(true);
    try {
      const name = await saveReconciliationAct(act);
      if (name) {
        toast.success("Акт сохранён в документах компании");
        onSaved?.();
        onOpenChange(false);
        setAct(null);
      } else {
        toast.error("Не удалось сохранить акт");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!act) return;
    const blob = new Blob([act.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${act.docName}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!act) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(act.html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const fmt = (n: number) =>
    n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            Акт сверки взаиморасчётов
          </DialogTitle>
          <DialogDescription>
            {company.name} — выберите период и сформируйте акт по данным договоров, счетов и платежей.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Период с</Label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Период по</Label>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={generating} className="w-full gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
            {generating ? "Считаем сальдо…" : "Сформировать акт"}
          </Button>

          {act && (
            <>
              <Card className="p-4 grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Начислено</div>
                  <div className="text-lg font-bold">{fmt(act.totalDebit)} ₽</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Оплачено</div>
                  <div className="text-lg font-bold text-green-600">{fmt(act.totalCredit)} ₽</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Сальдо</div>
                  <div
                    className={`text-lg font-bold ${
                      act.balance > 0 ? "text-amber-600" : act.balance < 0 ? "text-blue-600" : ""
                    }`}
                  >
                    {fmt(act.balance)} ₽
                  </div>
                </div>
              </Card>

              <div className="border rounded-xl overflow-hidden bg-white">
                <iframe
                  title="Предпросмотр акта сверки"
                  className="w-full h-[400px]"
                  srcDoc={act.html}
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <Button variant="outline" onClick={handlePrint} className="gap-2">
                  <Printer className="w-4 h-4" />
                  Печать
                </Button>
                <Button variant="outline" onClick={handleDownload} className="gap-2">
                  <Download className="w-4 h-4" />
                  Скачать HTML
                </Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Сохранить в документах компании
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
