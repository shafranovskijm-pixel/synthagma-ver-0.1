import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Save, RotateCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  useOperatorRequisites,
  saveOperatorRequisites,
} from "@/hooks/useOperatorRequisites";
import {
  DEFAULT_OPERATOR_REQUISITES,
  type OperatorRequisites,
} from "@/constants/operatorDetails";

type FieldKey = keyof OperatorRequisites;

const SECTIONS: { title: string; fields: { key: FieldKey; label: string; placeholder?: string }[] }[] = [
  {
    title: "Идентификация",
    fields: [
      { key: "fullName", label: "Полное наименование" },
      { key: "shortName", label: "Краткое наименование (для подписи)" },
      { key: "inn", label: "ИНН" },
      { key: "ogrnip", label: "ОГРНИП" },
    ],
  },
  {
    title: "Контакты и адрес",
    fields: [
      { key: "address", label: "Юридический адрес" },
      { key: "phone", label: "Телефон" },
      { key: "email", label: "Email" },
    ],
  },
  {
    title: "Банковские реквизиты",
    fields: [
      { key: "bankName", label: "Наименование банка" },
      { key: "bankAccount", label: "Расчётный счёт" },
      { key: "bik", label: "БИК" },
      { key: "corrAccount", label: "Корр. счёт" },
      { key: "bankInn", label: "ИНН банка" },
      { key: "bankKpp", label: "КПП банка" },
    ],
  },
];

export function AdminOperatorRequisites() {
  const { requisites, loading } = useOperatorRequisites();
  const [form, setForm] = useState<OperatorRequisites>(DEFAULT_OPERATOR_REQUISITES);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!loading) {
      setForm(requisites);
      setDirty(false);
    }
  }, [loading, requisites]);

  const update = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveOperatorRequisites(form);
      toast.success("Реквизиты сохранены");
      setDirty(false);
    } catch (e: any) {
      toast.error("Ошибка сохранения", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(DEFAULT_OPERATOR_REQUISITES);
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex gap-3">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <div className="text-sm text-muted-foreground">
            Эти реквизиты подставляются в счета на оплату подписки, которые формируются для организаций.
            Изменения вступают в силу сразу — новые счета будут содержать актуальные данные.
            <br />
            <span className="text-xs">
              Юридические тексты (оферта, политика ПД) меняются отдельно — обратитесь к разработчику.
            </span>
          </div>
        </div>
      </Card>

      {SECTIONS.map((section) => (
        <div key={section.title} className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
                <Input
                  id={f.key}
                  value={form[f.key] || ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="rounded-lg"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
        <Button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-xl gap-2"
        >
          {saving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
          Сохранить
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={saving}
          className="rounded-xl gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Сбросить к значениям по умолчанию
        </Button>
      </div>
    </div>
  );
}
