import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useStaffDocumentScope } from "@/hooks/useStaffDocumentScope";
import { useStaffDocumentGrants } from "@/hooks/useStaffDocumentGrants";
import { toast } from "sonner";

export function StaffDocumentGroupsDialog({ organizationId, staff, canWrite, canGrantSign, canGrantIssue, onClose, onSaved }: {
  organizationId: string; staff: { id: string; display_name: string } | null; canWrite: boolean;
  canGrantSign: boolean; canGrantIssue: boolean; onClose: () => void; onSaved?: () => void;
}) {
  const h = useStaffDocumentScope(organizationId, staff?.id ?? null, canWrite);
  const grants = useStaffDocumentGrants(organizationId, staff?.id ?? null, { canManage: canWrite, canGrantSign, canGrantIssue });
  const [selected, setSelected] = useState<string[]>([]);
  const [sign, setSign] = useState(false);
  const [issue, setIssue] = useState(false);
  const roleDefaults = !!grants.data && ["owner", "admin"].includes(grants.data.role);
  useEffect(() => { setSelected(h.data?.group_ids ?? []); }, [h.data]);
  useEffect(() => {
    setSign(roleDefaults || !!grants.data?.sections_access?.includes("documents.sign"));
    setIssue(roleDefaults || !!grants.data?.sections_access?.includes("documents.issue"));
  }, [grants.data, roleDefaults]);
  return <Dialog open={!!staff} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Доступ сотрудника</DialogTitle>
        <DialogDescription>{staff?.display_name}. Права на документы и доступ к группам.</DialogDescription>
      </DialogHeader>
      {h.loading ? <div className="flex justify-center py-6"><SigmaSpinner /></div> : <div className="space-y-4">
        {h.error && <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{h.error}</p>
          <Button variant="outline" disabled={h.saving} onClick={() => void h.reload()}>Обновить список</Button>
        </div>}
        {h.data?.scope === "organization" && <p className="text-sm text-muted-foreground">Текущая роль имеет доступ в пределах организации. Назначения групп ограничивают доступ преподавателя.</p>}
        {h.data?.scope === "assigned_groups" && <>
          <p className="text-sm text-muted-foreground">Без назначенных групп документы и журналы учеников недоступны. Права на изменение, подпись и выдачу задаются отдельно.</p>
          {h.data.available_groups.length === 0 ? <p className="text-sm">Доступных групп пока нет.</p> :
            <ScrollArea className="h-40 rounded-md border p-3">
              <div className="space-y-3">{h.data.available_groups.map(group => <label key={group.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selected.includes(group.id)} disabled={!canWrite || h.saving || h.conflict}
                  onCheckedChange={checked => setSelected(previous => checked === true ? [...previous, group.id] : previous.filter(id => id !== group.id))} />
                <span>{group.name}</span>
              </label>)}</div>
            </ScrollArea>}
          {canWrite && <Button variant="outline" disabled={h.loading || h.saving || h.conflict}
            onClick={async () => { if (await h.save(selected)) toast.success("Группы сотрудника сохранены"); }}>
            {h.saving ? <SigmaSpinner size="sm" /> : "Сохранить группы"}
          </Button>}
        </>}
      </div>}
      <div className="space-y-3 border-t pt-4">
        {grants.loading && <SigmaSpinner size="sm" />}
        {grants.error && <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{grants.error}</p>
          <Button variant="outline" disabled={grants.saving} onClick={() => void grants.reload()}>Обновить права</Button>
        </div>}
        {grants.data && <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sign} disabled={!canWrite || roleDefaults || grants.saving || grants.needsReload ||
              (!grants.data.sections_access?.includes("documents.sign") && !canGrantSign)}
              onCheckedChange={value => setSign(value === true)} />
            Подписывать от организации
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={issue} disabled={!canWrite || roleDefaults || grants.saving || grants.needsReload ||
              (!grants.data.sections_access?.includes("documents.issue") && !canGrantIssue)}
              onCheckedChange={value => setIssue(value === true)} />
            Выдавать документы об образовании
          </label>
          {roleDefaults ? <p className="text-xs text-muted-foreground">Эти права входят в текущую роль.</p> :
            <p className="text-xs text-muted-foreground">Редактирование документов само по себе не даёт права подписи или выдачи. Выдать право может сотрудник, у которого оно уже есть.</p>}
          {canWrite && !roleDefaults && <Button variant="outline" disabled={grants.saving || grants.needsReload}
            onClick={async () => { if (await grants.save(sign, issue)) { toast.success("Права сотрудника сохранены"); onSaved?.(); } }}>
            {grants.saving ? <SigmaSpinner size="sm" /> : "Сохранить права"}
          </Button>}
        </>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Закрыть</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
