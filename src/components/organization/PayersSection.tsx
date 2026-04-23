import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Users, Building2, User, Archive, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

interface Payer {
  id: string;
  name: string;
  inn: string | null;
  phone: string | null;
  email: string | null;
  payer_type: "individual" | "legal_entity";
  status: string;
  created_at: string;
}

type FilterType = "all" | "individual" | "legal_entity" | "active" | "archived";

interface Props {
  organizationId: string;
}

export function PayersSection({ organizationId }: Props) {
  const [payers, setPayers] = useState<Payer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", inn: "", phone: "", email: "", payer_type: "individual" as "individual" | "legal_entity" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPayers();
  }, [organizationId]);

  const loadPayers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("org_payers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    setPayers((data as any[]) || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("org_payers").insert({
      organization_id: organizationId,
      name: form.name.trim(),
      inn: form.inn.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      payer_type: form.payer_type,
    } as any);
    if (error) {
      toast.error("Ошибка", { description: getErrorMessage(error) });
    } else {
      toast.success("Плательщик добавлен");
      setShowDialog(false);
      setForm({ name: "", inn: "", phone: "", email: "", payer_type: "individual" });
      loadPayers();
    }
    setSubmitting(false);
  };

  const handleArchive = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "archived" ? "active" : "archived";
    await supabase.from("org_payers").update({ status: newStatus } as any).eq("id", id);
    setPayers(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
  };

  const filtered = payers.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.inn || "").includes(search)) return false;
    if (filter === "individual") return p.payer_type === "individual";
    if (filter === "legal_entity") return p.payer_type === "legal_entity";
    if (filter === "active") return p.status === "active";
    if (filter === "archived") return p.status === "archived";
    return true;
  });

  const FILTERS: { value: FilterType; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "individual", label: "Физ. лица" },
    { value: "legal_entity", label: "Юр. лица" },
    { value: "active", label: "Активные" },
    { value: "archived", label: "В архиве" },
  ];

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Поиск по имени или ИНН..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                filter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" className="rounded-xl gap-1.5 ml-auto" onClick={() => setShowDialog(true)}>
          <Plus className="w-3.5 h-3.5" />
          Добавить
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Плательщиков не найдено</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                {p.payer_type === "legal_entity" ? (
                  <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                ) : (
                  <User className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {p.name}
                    {p.status === "archived" && <Badge variant="secondary" className="text-[10px]">Архив</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {p.inn && <span>ИНН: {p.inn}</span>}
                    {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                    {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleArchive(p.id, p.status)} title={p.status === "archived" ? "Восстановить" : "В архив"}>
                <Archive className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить плательщика</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Тип</Label>
              <Select value={form.payer_type} onValueChange={v => setForm(f => ({ ...f, payer_type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Физическое лицо</SelectItem>
                  <SelectItem value="legal_entity">Юридическое лицо</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Наименование *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ФИО или название организации" />
            </div>
            <div className="space-y-2">
              <Label>ИНН</Label>
              <Input value={form.inn} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))} placeholder="ИНН" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+7..." />
              </div>
              <div className="space-y-2">
                <Label>Почта</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@..." />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={submitting || !form.name.trim()}>
              {submitting ? "Создание..." : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
