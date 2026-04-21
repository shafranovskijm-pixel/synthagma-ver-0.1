import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { useOrgServices, type OrgService } from "@/hooks/useOrgServices";

interface Props {
  organizationId: string;
}

export function OrgServicesManager({ organizationId }: Props) {
  const { services, loading, upsert, remove } = useOrgServices(organizationId);
  const [editing, setEditing] = useState<Partial<OrgService> | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Каталог услуг для КП</h3>
        <Button size="sm" onClick={() => setEditing({ is_active: true, unit: "шт", price: 0 })}>
          <Plus className="w-4 h-4 mr-2" />Новая услуга
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Загрузка...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {services.map(s => (
          <Card key={s.id} className={s.is_active ? "" : "opacity-60"}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium truncate">{s.name}</span>
                  </div>
                  {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                  <p className="text-sm font-semibold mt-1">{Number(s.price).toLocaleString("ru-RU")} ₽ / {s.unit}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(s)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && services.length === 0 && (
          <p className="text-center text-muted-foreground py-8 col-span-full">Каталог пуст. Добавьте первую услугу.</p>
        )}
      </div>

      {editing && <ServiceEditor svc={editing} onClose={() => setEditing(null)} onSave={async (s) => { await upsert(s as any); setEditing(null); }} />}
    </div>
  );
}

function ServiceEditor({ svc, onClose, onSave }: { svc: Partial<OrgService>; onClose: () => void; onSave: (s: Partial<OrgService>) => Promise<void> }) {
  const [name, setName] = useState(svc.name || "");
  const [description, setDescription] = useState(svc.description || "");
  const [price, setPrice] = useState<number>(svc.price ?? 0);
  const [unit, setUnit] = useState(svc.unit || "шт");
  const [isActive, setIsActive] = useState(svc.is_active ?? true);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{svc.id ? "Редактировать" : "Новая услуга"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Название</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>Описание</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Цена (₽)</Label><Input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} /></div>
            <div><Label>Единица</Label><Input value={unit} onChange={e => setUnit(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Активна</Label></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button disabled={!name.trim() || saving} onClick={async () => {
            setSaving(true);
            await onSave({ ...svc, name: name.trim(), description, price, unit, is_active: isActive });
            setSaving(false);
          }}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
