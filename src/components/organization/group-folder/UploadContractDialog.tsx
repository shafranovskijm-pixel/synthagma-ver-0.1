import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload } from "lucide-react";

interface Student {
  user_id: string;
  full_name: string;
}

interface Props {
  organizationId: string;
  groupId: string;
  students: Student[];
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export function UploadContractDialog({ organizationId, groupId, students, open, onClose, onUploaded }: Props) {
  const [studentId, setStudentId] = useState<string>("");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"individual" | "legal">("individual");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!file) { toast.error("Выберите файл"); return; }
    if (!studentId) { toast.error("Выберите ученика"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const safe = (name || file.name).replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const path = `${organizationId}/contracts/${groupId}/${studentId}/${Date.now()}_${safe}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("billing-documents")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;

      const { error: insErr } = await (supabase as any).from("org_contracts").insert({
        organization_id: organizationId,
        student_user_id: studentId,
        student_group_id: groupId,
        counterparty_type: type,
        name: name || file.name,
        contract_number: number || null,
        contract_date: date || null,
        file_path: path,
        status: "active",
      });
      if (insErr) throw insErr;

      toast.success("Договор загружен");
      onUploaded();
      onClose();
      setFile(null); setName(""); setNumber(""); setStudentId("");
    } catch (e: any) {
      toast.error("Ошибка загрузки", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Загрузить договор</DialogTitle>
          <DialogDescription>Загрузите готовый файл договора (PDF или Word) и привяжите его к ученику группы.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Файл договора</Label>
            <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ученик</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Выберите ученика" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Тип контрагента</Label>
              <Select value={type} onValueChange={v => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Физическое лицо</SelectItem>
                  <SelectItem value="legal">Юридическое лицо</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Номер</Label>
              <Input value={number} onChange={e => setNumber(e.target.value)} placeholder="2026-01-001" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Дата</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Договор на обучение" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button onClick={upload} disabled={busy} className="gap-1.5"><Upload className="w-4 h-4" />{busy ? "Загрузка…" : "Загрузить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
