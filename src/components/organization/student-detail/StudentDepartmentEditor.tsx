import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";

interface StudentDepartmentEditorProps {
  value: string;
  saving: boolean;
  onSave: (value: string) => Promise<boolean>;
}

export function StudentDepartmentEditor({ value, saving, onSave }: StudentDepartmentEditorProps) {
  const { can, loading } = useStaffPermissions();
  const [draft, setDraft] = useState(value);
  const [submitting, setSubmitting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => { setDraft(value); setSaveFailed(false); }, [value]);
  const canEdit = !loading && can("students.write");
  const busy = saving || submitting;
  const changed = draft !== value;

  return (
    <form className="bg-card rounded-2xl border border-border p-6 space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      if (!canEdit || busy || !changed) return;
      setSubmitting(true);
      setSaveFailed(false);
      try {
        const saved = await onSave(draft);
        if (saved) setDraft(draft.trim());
        else setSaveFailed(true);
      } catch {
        setSaveFailed(true);
      } finally {
        setSubmitting(false);
      }
    }}>
      <Label htmlFor="student-department" className="font-semibold flex items-center gap-2">
        <Building2 className="w-5 h-5 text-primary" />Подразделение
      </Label>
      <Input id="student-department" value={draft} maxLength={200} disabled={!canEdit || busy}
        onChange={(event) => { setDraft(event.target.value); setSaveFailed(false); }}
        placeholder="Например, участок № 2" aria-describedby="student-department-help" />
      <p id="student-department-help" className="text-xs text-muted-foreground">
        Подразделение сотрудника. Можно указать или изменить для уже добавленного ученика.
      </p>
      {canEdit && <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !changed}>
          {busy ? "Сохранение…" : "Сохранить подразделение"}
        </Button>
        {changed && <Button type="button" size="sm" variant="outline" disabled={busy}
          onClick={() => { setDraft(value); setSaveFailed(false); }}>Отмена</Button>}
      </div>}
      {saveFailed && <p role="alert" className="text-sm text-destructive">
        Подразделение не сохранено. Проверьте значение и повторите попытку.
      </p>}
    </form>
  );
}
