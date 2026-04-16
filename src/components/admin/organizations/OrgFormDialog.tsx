import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface OrgFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formData: { name: string; email: string; phone: string; inn: string; contact_name: string; login_email: string; login_password: string };
  setFormData: (data: any) => void;
  onSubmit: () => void;
  saving: boolean;
}

export function OrgFormDialog({ mode, open, onOpenChange, formData, setFormData, onSubmit, saving }: OrgFormDialogProps) {
  const title = mode === "create" ? "Новая организация" : "Редактировать организацию";
  const submitLabel = mode === "create" ? "Создать" : "Сохранить";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {mode === "create" && (
        <DialogTrigger asChild>
          <Button className="btn-gradient"><Plus className="w-4 h-4 mr-2" />Добавить</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2"><Label>Название *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="ООО Компания" /></div>
          <div className="space-y-2"><Label>Email *</Label><Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="org@example.com" /></div>
          <div className="space-y-2"><Label>Телефон</Label><Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+7 (999) 123-45-67" /></div>
          <div className="space-y-2"><Label>ИНН</Label><Input value={formData.inn} onChange={e => setFormData({ ...formData, inn: e.target.value })} placeholder="1234567890" /></div>
          <div className="space-y-2"><Label>Контактное лицо</Label><Input value={formData.contact_name} onChange={e => setFormData({ ...formData, contact_name: e.target.value })} placeholder="Иван Иванов" /></div>
          {mode === "create" && (
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium mb-3">Учётные данные для входа</p>
              <div className="space-y-3">
                <div className="space-y-2"><Label>Email для входа</Label><Input type="email" value={formData.login_email} onChange={e => setFormData({ ...formData, login_email: e.target.value })} placeholder="admin@company.ru" /></div>
                <div className="space-y-2"><Label>Пароль</Label><Input type="text" value={formData.login_password} onChange={e => setFormData({ ...formData, login_password: e.target.value })} placeholder="Минимум 6 символов" /></div>
              </div>
            </div>
          )}
          <Button onClick={onSubmit} disabled={saving} className="w-full">
            {saving ? <SigmaSpinner size="sm" className="mr-2" /> : null}{submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
