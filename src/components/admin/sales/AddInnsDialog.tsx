import { useState } from 'react';
// xlsx is dynamically imported inside handleFile to keep it out of the main bundle
import { Loader2, Upload, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface AddInnsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (inns: string[]) => void;
  isSubmitting: boolean;
  remainingQuota: number;
}

// Russian INN check digit validation (10 / 12 digits)
function isValidInn(inn: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;
  const d = inn.split('').map(Number);
  if (inn.length === 10) {
    const w = [2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
    const s = w.reduce((a, k, i) => a + k * d[i], 0) % 11 % 10;
    return s === d[9];
  }
  const w1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
  const w2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
  const s1 = w1.reduce((a, k, i) => a + k * d[i], 0) % 11 % 10;
  const s2 = w2.reduce((a, k, i) => a + k * d[i], 0) % 11 % 10;
  return s1 === d[10] && s2 === d[11];
}

export function AddInnsDialog({ open, onOpenChange, onSubmit, isSubmitting, remainingQuota }: AddInnsDialogProps) {
  const [text, setText] = useState('');

  const parsed = text
    .split(/[\s,;\n\t]+/)
    .map(s => s.replace(/\D/g, ''))
    .filter(Boolean);
  const unique = Array.from(new Set(parsed));
  const valid = unique.filter(isValidInn);
  const invalid = unique.filter(v => !isValidInn(v));

  const handleFile = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      // Pull any cell that looks like an INN
      const collected: string[] = [];
      for (const row of json) {
        for (const v of Object.values(row)) {
          const s = String(v ?? '').replace(/\D/g, '');
          if (s.length === 10 || s.length === 12) collected.push(s);
        }
      }
      setText((prev) => (prev ? prev + '\n' : '') + collected.join('\n'));
      toast.success(`Загружено ${collected.length} ИНН из файла`);
    } catch (e) {
      toast.error(`Не удалось прочитать файл: ${(e as Error).message}`);
    }
  };

  const handleSubmit = () => {
    if (!valid.length) {
      toast.error('Нет корректных ИНН');
      return;
    }
    onSubmit(valid);
  };

  const willProcessNow = Math.min(valid.length, remainingQuota);
  const willQueue = Math.max(0, valid.length - remainingQuota);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Добавить ИНН для обогащения через Checko</DialogTitle>
          <DialogDescription>
            Введите список ИНН (по одному в строке или через запятую/пробел) или загрузите CSV/XLSX.
            Каждый ИНН = 1 запрос к Checko API. Дневной лимит: 100 запросов.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="file"
              id="inn-file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <Button asChild variant="outline" size="sm" className="gap-2">
              <label htmlFor="inn-file" className="cursor-pointer">
                <Upload className="w-4 h-4" /> Загрузить CSV / XLSX
              </label>
            </Button>
            <span className="text-xs text-muted-foreground">или вставьте список ниже</span>
          </div>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'7707083893\n7736207543\n9701123456'}
            rows={10}
            className="font-mono text-sm"
          />

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">Всего: {unique.length}</Badge>
            <Badge variant="default">Корректных: {valid.length}</Badge>
            {invalid.length > 0 && (
              <Badge variant="destructive">Некорректных: {invalid.length}</Badge>
            )}
            {valid.length > 0 && (
              <>
                <Badge variant="outline" className="border-primary text-primary">
                  Обработать сейчас: {willProcessNow}
                </Badge>
                {willQueue > 0 && (
                  <Badge variant="outline">В очередь: {willQueue}</Badge>
                )}
              </>
            )}
          </div>

          {valid.length > remainingQuota && (
            <div className="text-xs text-muted-foreground p-2 rounded bg-muted/50 flex items-start gap-2">
              <FileSpreadsheet className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Сегодня осталось {remainingQuota} из 100 запросов. Лишние ИНН попадут в очередь
                и будут автоматически обогащены при следующем сбросе квоты в 00:00 МСК
                (если включено автообновление).
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !valid.length} className="gap-2">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Обогащаю…' : `Обогатить ${valid.length} ИНН`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
