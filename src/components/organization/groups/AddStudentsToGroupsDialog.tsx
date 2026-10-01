import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { addStudentsToGroups } from "@/api/studentGroupMemberships";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  userIds: string[];
  groups: Array<{ id: string; name: string; color?: string | null }>;
  onSaved: () => void | Promise<void>;
}

export function AddStudentsToGroupsDialog({ open, onOpenChange, organizationId, userIds, groups, onSaved }: Props) {
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const selectionKey = [...new Set(userIds)].sort().join(",");
  useEffect(() => { setSelectedGroups(new Set()); }, [open, organizationId, selectionKey]);
  const save = async () => {
    setSaving(true);
    try {
      await addStudentsToGroups(supabase, organizationId, userIds, [...selectedGroups]);
      await onSaved();
      toast.success("Ученики добавлены в выбранные группы", {
        description: "Прежние группы и зачисления на курсы сохранены.",
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось добавить учеников в группы");
    } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}>
    <DialogContent className="max-w-lg rounded-2xl">
      <DialogHeader>
        <DialogTitle>Добавить в группы</DialogTitle>
        <DialogDescription>
          Выбрано учеников: {new Set(userIds).size}. Можно отметить несколько групп. Основная группа, подразделение и обучение сохранятся.
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {groups.map(group => <label key={group.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-muted/50">
          <Checkbox aria-label={`Добавить в ${group.name}`} disabled={saving} checked={selectedGroups.has(group.id)} onCheckedChange={checked => {
            setSelectedGroups(current => { const next = new Set(current); if (checked) next.add(group.id); else next.delete(group.id); return next; });
          }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color || "#6366f1" }} />
          <span>{group.name}</span>
        </label>)}
        {!groups.length && <p className="py-4 text-sm text-muted-foreground">Сначала создайте учебную группу.</p>}
      </div>
      <Button disabled={saving || !userIds.length || !selectedGroups.size} onClick={() => void save()}>
        {saving && <SigmaSpinner size="sm" className="mr-2" />}Добавить в выбранные группы
      </Button>
    </DialogContent>
  </Dialog>;
}
