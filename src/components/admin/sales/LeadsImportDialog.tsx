import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSalesManager, type SalesLead } from '@/hooks/useSalesManager';
// xlsx is dynamically imported inside handleFile to keep it out of the main bundle

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ColumnMapping {
  org_name: string;
  inn: string;
  ogrn: string;
  license_number: string;
  license_date: string;
  region: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  org_name: 'Наименование организации *',
  inn: 'ИНН',
  ogrn: 'ОГРН',
  license_number: 'Номер лицензии',
  license_date: 'Дата лицензии',
  region: 'Регион',
  city: 'Город',
  address: 'Адрес',
  phone: 'Телефон',
  email: 'Email',
  website: 'Сайт',
};

export function LeadsImportDialog({ open, onOpenChange }: Props) {
  const { importLeads, loading } = useSalesManager();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    org_name: '', inn: '', ogrn: '', license_number: '', license_date: '',
    region: '', city: '', address: '', phone: '', email: '', website: ''
  });
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let jsonData: any[] = [];

      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          jsonData = parsed;
        } else if (parsed && typeof parsed === 'object' && parsed.data) {
          // meta.json format — contains link to data, not actual records
          toast.error('Это файл метаданных (meta.json). Загрузите файл с данными (data-*.json).');
          return;
        } else {
          toast.error('JSON-файл не содержит массив записей. Загрузите файл data-*.json с массивом организаций.');
          return;
        }
      } else {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
      }

      if (jsonData.length === 0) {
        toast.error('Файл не содержит записей.');
        return;
      }

    const cols = Object.keys(jsonData[0]);
    setHeaders(cols);
    setRows(jsonData);

    // Auto-map common column names
    const autoMap = { ...mapping };
    const namePatterns: Record<keyof ColumnMapping, RegExp> = {
      org_name: /наименование|название|организац|name_edu|name$/i,
      inn: /^инн$|^inn$/i,
      ogrn: /^огрн$|^ogrn$/i,
      license_number: /лицензи.*номер|номер.*лицензи|license|reg_lic_number|рег/i,
      license_date: /лицензи.*дат|дат.*лицензи|lic_data|order_date/i,
      region: /регион|субъект|region/i,
      city: /город|city/i,
      address: /адрес.*нахожд|адрес.*место|^address$|^address_edu$/i,
      phone: /телефон|phone/i,
      email: /почт|email|^mail$|mbox/i,
      website: /сайт|website|web/i,
    };

    for (const [field, pattern] of Object.entries(namePatterns)) {
      const match = cols.find(c => pattern.test(c));
      if (match) autoMap[field as keyof ColumnMapping] = match;
    }
    setMapping(autoMap);
    setStep('map');
    } catch (err: any) {
      toast.error('Ошибка чтения файла: ' + (err.message || 'неизвестная ошибка'));
    }
  };

  const getMappedData = (): Partial<SalesLead>[] => {
    return rows.map(row => {
      const lead: Record<string, any> = { source: 'obrnadzor' };
      for (const [field, col] of Object.entries(mapping)) {
        if (col && row[col] !== undefined) {
          lead[field] = String(row[col]).trim() || null;
        }
      }
      return lead as Partial<SalesLead>;
    }).filter(l => l.org_name);
  };

  const handleImport = async () => {
    const data = getMappedData();
    if (data.length === 0) return;
    await importLeads(data);
    onOpenChange(false);
    setStep('upload');
    setRows([]);
    setHeaders([]);
  };

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) { setStep('upload'); setRows([]); setHeaders([]); } }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Импорт базы компаний</DialogTitle></DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                Загрузите реестр лицензий в формате Excel/CSV или JSON (с data.gov.ru, obrnadzor.gov.ru и др.)
              </AlertDescription>
            </Alert>
            <div className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-border rounded-lg">
              <FileSpreadsheet className="w-12 h-12 text-muted-foreground" />
              <p className="text-muted-foreground">Перетащите файл или нажмите для выбора</p>
              <Input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.json" onChange={handleFile} className="max-w-xs" />
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Найдено {rows.length} строк. Сопоставьте колонки:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(FIELD_LABELS).map(([field, label]) => (
                <div key={field}>
                  <Label className="text-xs">{label}</Label>
                  <Select value={mapping[field as keyof ColumnMapping]} onValueChange={v => setMapping(prev => ({ ...prev, [field]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Не выбрано" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Не выбрано</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>Назад</Button>
              <Button onClick={() => setStep('preview')} disabled={!mapping.org_name}>
                Предпросмотр ({getMappedData().length} записей)
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Будет импортировано: {getMappedData().length} компаний</p>
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-secondary sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Название</th>
                    <th className="p-2 text-left">ИНН</th>
                    <th className="p-2 text-left">Регион</th>
                    <th className="p-2 text-left">Лицензия</th>
                  </tr>
                </thead>
                <tbody>
                  {getMappedData().slice(0, 20).map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2">{l.org_name}</td>
                      <td className="p-2">{l.inn || '—'}</td>
                      <td className="p-2">{l.region || '—'}</td>
                      <td className="p-2">{l.license_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('map')}>Назад</Button>
              <Button onClick={handleImport} disabled={loading}>
                {loading ? 'Импорт...' : `Импортировать ${getMappedData().length} компаний`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
