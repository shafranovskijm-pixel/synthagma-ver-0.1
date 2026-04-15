import { useState, useCallback } from "react";
import { Upload, FileText, Receipt, FileCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface DocumentValidation {
  date: string;
  amount: string;
  serviceName: string;
}

interface DocumentDropZoneProps {
  type: 'contract' | 'invoice' | 'act';
  isUploading: boolean;
  onUpload: (file: File, validation?: DocumentValidation) => void;
  accept?: string;
  requireValidation?: boolean;
}

const typeConfig = {
  contract: {
    icon: FileText,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500",
    label: "Договоры",
    dateLabel: "Дата договора",
    amountLabel: "Сумма договора" },
  invoice: {
    icon: Receipt,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500",
    label: "Счета",
    dateLabel: "Дата счёта",
    amountLabel: "Сумма счёта" },
  act: {
    icon: FileCheck,
    color: "text-sigma-green",
    bgColor: "bg-sigma-green/10",
    borderColor: "border-sigma-green",
    label: "Акты",
    dateLabel: "Дата акта",
    amountLabel: "Сумма акта" } };

export function DocumentDropZone({ 
  type, 
  isUploading, 
  onUpload, 
  accept = ".pdf,.doc,.docx",
  requireValidation = true 
}: DocumentDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [validationData, setValidationData] = useState<DocumentValidation>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    serviceName: '' });
  const [validationErrors, setValidationErrors] = useState<Partial<Record<keyof DocumentValidation, string>>>({});
  
  const config = typeConfig[type];
  const Icon = config.icon;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFile = useCallback((file: File) => {
    if (requireValidation) {
      setPendingFile(file);
      setValidationData({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        serviceName: '' });
      setValidationErrors({});
      setShowValidationDialog(true);
    } else {
      onUpload(file);
    }
  }, [requireValidation, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const extension = file.name.split('.').pop()?.toLowerCase();
      const acceptedExtensions = accept.split(',').map(ext => ext.replace('.', '').toLowerCase());
      
      if (acceptedExtensions.includes(extension || '')) {
        processFile(file);
      } else {
        toast.error(`Неподдерживаемый формат файла. Допустимые: ${accept}`);
      }
    }
  }, [accept, processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  }, [processFile]);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof DocumentValidation, string>> = {};
    
    if (!validationData.date) {
      errors.date = "Укажите дату";
    }
    
    if (!validationData.amount || parseFloat(validationData.amount) <= 0) {
      errors.amount = "Укажите сумму";
    }
    
    if (!validationData.serviceName.trim()) {
      errors.serviceName = "Укажите наименование услуги";
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleConfirmUpload = () => {
    if (!validateForm()) {
      toast.error("Заполните все обязательные поля");
      return;
    }
    
    if (pendingFile) {
      onUpload(pendingFile, validationData);
      setShowValidationDialog(false);
      setPendingFile(null);
    }
  };

  const handleCancelUpload = () => {
    setShowValidationDialog(false);
    setPendingFile(null);
  };

  return (
    <>
      <div
        className={cn(
          "relative border-2 border-dashed rounded-xl p-4 transition-all duration-200",
          isDragging ? `${config.borderColor} ${config.bgColor}` : "border-border hover:border-muted-foreground/50",
          isUploading && "opacity-50 pointer-events-none"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <label className="cursor-pointer flex flex-col items-center justify-center gap-2 py-4">
          <input
            type="file"
            className="hidden"
            accept={accept}
            onChange={handleFileSelect}
            disabled={isUploading}
          />
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
            isDragging ? config.bgColor : "bg-muted"
          )}>
            {isUploading ? (
              <SigmaSpinner />
            ) : (
              <Upload className={cn("w-6 h-6", isDragging ? config.color : "text-muted-foreground")} />
            )}
          </div>
          <div className="text-center">
            <p className={cn(
              "text-sm font-medium",
              isDragging ? config.color : "text-foreground"
            )}>
              {isUploading ? "Загрузка..." : isDragging ? "Отпустите файл" : "Перетащите файл сюда"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              или нажмите для выбора
            </p>
          </div>
        </label>
      </div>

      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className={cn("w-5 h-5", config.color)} />
              Данные документа
            </DialogTitle>
            <DialogDescription>
              Укажите информацию о загружаемом документе "{pendingFile?.name}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="doc-date">{config.dateLabel} *</Label>
              <Input
                id="doc-date"
                type="date"
                value={validationData.date}
                onChange={(e) => setValidationData({ ...validationData, date: e.target.value })}
                className={cn(validationErrors.date && "border-destructive")}
              />
              {validationErrors.date && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {validationErrors.date}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-amount">{config.amountLabel} (₽) *</Label>
              <Input
                id="doc-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={validationData.amount}
                onChange={(e) => setValidationData({ ...validationData, amount: e.target.value })}
                className={cn(validationErrors.amount && "border-destructive")}
              />
              {validationErrors.amount && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {validationErrors.amount}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-service">Наименование услуги *</Label>
              <Input
                id="doc-service"
                type="text"
                placeholder="Образовательные услуги по программе..."
                value={validationData.serviceName}
                onChange={(e) => setValidationData({ ...validationData, serviceName: e.target.value })}
                className={cn(validationErrors.serviceName && "border-destructive")}
              />
              {validationErrors.serviceName && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {validationErrors.serviceName}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelUpload}>
              Отмена
            </Button>
            <Button onClick={handleConfirmUpload}>
              Загрузить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
