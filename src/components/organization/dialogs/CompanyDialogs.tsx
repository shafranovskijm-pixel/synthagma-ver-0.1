import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {} from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface AddCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  inn: string;
  onInnChange: (value: string) => void;
  contactName: string;
  onContactNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  isCreating: boolean;
  onCreate: () => void;
}

export function AddCompanyDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  email,
  onEmailChange,
  inn,
  onInnChange,
  contactName,
  onContactNameChange,
  phone,
  onPhoneChange,
  isCreating,
  onCreate }: AddCompanyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Добавить компанию</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Название *</Label>
            <Input
              placeholder="ООО Пример"
              className="rounded-xl"
              value={name}
              onChange={e => onNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              placeholder="info@example.com"
              className="rounded-xl"
              value={email}
              onChange={e => onEmailChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>ИНН</Label>
            <Input
              placeholder="1234567890"
              className="rounded-xl"
              value={inn}
              onChange={e => onInnChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Контактное лицо</Label>
            <Input
              placeholder="Иванов Иван"
              className="rounded-xl"
              value={contactName}
              onChange={e => onContactNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input
              placeholder="+7 (999) 123-45-67"
              className="rounded-xl"
              value={phone}
              onChange={e => onPhoneChange(e.target.value)}
            />
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={onCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <SigmaSpinner size="sm" className="mr-2" />
                Создание...
              </>
            ) : (
              "Создать компанию"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface EditCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  inn: string;
  onInnChange: (value: string) => void;
  contactName: string;
  onContactNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  isSaving: boolean;
  onSave: () => void;
}

export function EditCompanyDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  email,
  onEmailChange,
  inn,
  onInnChange,
  contactName,
  onContactNameChange,
  phone,
  onPhoneChange,
  isSaving,
  onSave }: EditCompanyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Редактировать компанию</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Название *</Label>
            <Input className="rounded-xl" value={name} onChange={e => onNameChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input type="email" className="rounded-xl" value={email} onChange={e => onEmailChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>ИНН</Label>
            <Input className="rounded-xl" value={inn} onChange={e => onInnChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Контактное лицо</Label>
            <Input className="rounded-xl" value={contactName} onChange={e => onContactNameChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input className="rounded-xl" value={phone} onChange={e => onPhoneChange(e.target.value)} />
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <SigmaSpinner size="sm" className="mr-2" />
                Сохранение...
              </>
            ) : (
              "Сохранить"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
