import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import { Search, Check } from "lucide-react";
import type { Company } from "@/hooks/useCompaniesManager";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface DadataCompanyInfo {
  name: string;
  fullName: string;
  shortName: string;
  inn: string;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  management: string | null;
  status: string | null;
  type: string | null;
  opf: string | null;
}

interface CreateCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  setCompanyName: (name: string) => void;
  companyInn: string;
  setCompanyInn: (inn: string) => void;
  companyEmail: string;
  setCompanyEmail: (email: string) => void;
  isCreating: boolean;
  isSearchingDadata: boolean;
  dadataCompanyInfo: DadataCompanyInfo | null;
  onSearchByInn: (inn: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

export function CreateCompanyDialog({
  open,
  onOpenChange,
  companyName,
  setCompanyName,
  companyInn,
  setCompanyInn,
  companyEmail,
  setCompanyEmail,
  isCreating,
  isSearchingDadata,
  dadataCompanyInfo,
  onSearchByInn,
  onCreate,
  onClose }: CreateCompanyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) onClose();
    }}>
      <DialogContent className="rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Добавить компанию</DialogTitle>
          <DialogDescription>
            Введите ИНН для автозаполнения данных компании
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>ИНН</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Введите ИНН для поиска"
                className="rounded-xl"
                value={companyInn}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 12);
                  setCompanyInn(value);
                }}
                maxLength={12}
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-xl shrink-0"
                onClick={() => onSearchByInn(companyInn)}
                disabled={isSearchingDadata || companyInn.length < 10}
              >
                {isSearchingDadata ? (
                  <SigmaSpinner size="sm" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">10 цифр для юрлица, 12 для ИП</p>
          </div>

          {dadataCompanyInfo && (
            <DadataInfoCard info={dadataCompanyInfo} />
          )}

          <div className="space-y-2">
            <Label>Название компании *</Label>
            <Input
              placeholder='ООО "Название"'
              className="rounded-xl"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Email компании</Label>
            <Input
              type="email"
              placeholder="info@company.ru"
              className="rounded-xl"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Для отправки напоминаний о переобучении</p>
          </div>

          <Button
            onClick={onCreate}
            disabled={isCreating}
          >
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
  company: Company | null;
  companyName: string;
  setCompanyName: (name: string) => void;
  companyInn: string;
  setCompanyInn: (inn: string) => void;
  companyEmail: string;
  setCompanyEmail: (email: string) => void;
  isSaving: boolean;
  isSearchingDadata: boolean;
  dadataCompanyInfo: DadataCompanyInfo | null;
  onSearchByInn: (inn: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function EditCompanyDialog({
  open,
  onOpenChange,
  company,
  companyName,
  setCompanyName,
  companyInn,
  setCompanyInn,
  companyEmail,
  setCompanyEmail,
  isSaving,
  isSearchingDadata,
  dadataCompanyInfo,
  onSearchByInn,
  onSave,
  onClose }: EditCompanyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) onClose();
    }}>
      <DialogContent className="rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            Редактировать компанию
          </DialogTitle>
          <DialogDescription>Измените данные компании или найдите по ИНН</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>ИНН</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Введите ИНН для поиска"
                className="rounded-xl"
                value={companyInn}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 12);
                  setCompanyInn(value);
                }}
                maxLength={12}
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-xl shrink-0"
                onClick={() => onSearchByInn(companyInn)}
                disabled={isSearchingDadata || companyInn.length < 10}
              >
                {isSearchingDadata ? (
                  <SigmaSpinner size="sm" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">10 цифр для юрлица, 12 для ИП</p>
          </div>

          {dadataCompanyInfo && (
            <DadataInfoCard info={dadataCompanyInfo} />
          )}

          <div className="space-y-2">
            <Label>Название компании *</Label>
            <Input
              placeholder='ООО "Название"'
              className="rounded-xl"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Email компании</Label>
            <Input
              type="email"
              placeholder="info@company.ru"
              className="rounded-xl"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Для отправки напоминаний о переобучении</p>
          </div>

          <Button
            className="w-full btn-gradient rounded-xl"
            onClick={onSave}
            disabled={isSaving}
          >
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

interface DeleteCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  isDeleting: boolean;
  onDelete: () => void;
}

export function DeleteCompanyDialog({
  open,
  onOpenChange,
  company,
  isDeleting,
  onDelete }: DeleteCompanyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-destructive">
            Удалить компанию?
          </DialogTitle>
          <DialogDescription>
            Компания «{company?.name}» будет удалена. Ученики компании останутся
            в системе, но будут откреплены от компании.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
          <Button
            variant="destructive"
            className="flex-1 rounded-xl"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <SigmaSpinner size="sm" className="mr-2" />
                Удаление...
              </>
            ) : (
              "Удалить"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DadataInfoCard({ info }: { info: DadataCompanyInfo }) {
  return (
    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl space-y-2">
      <div className="flex items-center gap-2 text-green-600">
        <Check className="w-4 h-4" />
        <span className="font-medium text-sm">Компания найдена</span>
      </div>
      <div className="space-y-1 text-sm">
        <p><span className="text-muted-foreground">Название:</span> {info.shortName}</p>
        <p><span className="text-muted-foreground">ИНН:</span> {info.inn}</p>
        {info.kpp && (
          <p><span className="text-muted-foreground">КПП:</span> {info.kpp}</p>
        )}
        {info.ogrn && (
          <p><span className="text-muted-foreground">ОГРН:</span> {info.ogrn}</p>
        )}
        {info.management && (
          <p><span className="text-muted-foreground">Руководитель:</span> {info.management}</p>
        )}
        {info.address && (
          <p className="text-xs"><span className="text-muted-foreground">Адрес:</span> {info.address}</p>
        )}
        {info.status && (
          <p>
            <span className="text-muted-foreground">Статус:</span>{' '}
            <span className={info.status === 'ACTIVE' ? 'text-green-600' : 'text-red-600'}>
              {info.status === 'ACTIVE' ? 'Действующая' : info.status}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
