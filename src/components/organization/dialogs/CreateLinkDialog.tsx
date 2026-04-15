import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {} from "lucide-react";

interface CreateLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  onCompanyNameChange: (value: string) => void;
  inn: string;
  onInnChange: (value: string) => void;
  isCreating: boolean;
  onCreate: () => void;
}

export function CreateLinkDialog({
  open,
  onOpenChange,
  companyName,
  onCompanyNameChange,
  inn,
  onInnChange,
  isCreating,
  onCreate }: CreateLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Создать ссылку для регистрации</DialogTitle>
          <DialogDescription>
            Ученики, перешедшие по этой ссылке, автоматически привяжутся к вашей организации
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Название компании (необязательно)</Label>
            <Input
              placeholder="ООО Пример"
              className="rounded-xl"
              value={companyName}
              onChange={e => onCompanyNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>ИНН (необязательно)</Label>
            <Input
              placeholder="1234567890"
              className="rounded-xl"
              value={inn}
              onChange={e => onInnChange(e.target.value)}
            />
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={onCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <SigmaSpinner size="sm" className="mr-2" />
                Создание...
              </>
            ) : (
              "Создать ссылку"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
