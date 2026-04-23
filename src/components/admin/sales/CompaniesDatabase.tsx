import { useMemo, useState } from 'react';
// xlsx is dynamically imported inside the export handler to keep it out of the main bundle
import {
  Database, Search, Loader2, Download, UserPlus, Trash2, ExternalLink,
  BadgeCheck, Plus, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useSalesCompaniesDb, type SalesCompanyDbRow } from '@/hooks/useSalesCompaniesDb';
import { useCheckoApi } from '@/hooks/useCheckoApi';
import { CheckoQuotaBar } from './CheckoQuotaBar';
import { AddInnsDialog } from './AddInnsDialog';

interface CompaniesDatabaseProps {
  organizationId?: string;
}

export function CompaniesDatabase({ organizationId }: CompaniesDatabaseProps = {}) {
  const { list, convertToLead, remove } = useSalesCompaniesDb(organizationId);
  const { stats, enrichBatch } = useCheckoApi();
  const [search, setSearch] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('all');
  const [contactFilter, setContactFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);

  const rows = list.data || [];
  const remaining = stats.data?.today_remaining ?? 100;

  const cities = useMemo(
    () => Array.from(new Set(rows.map(r => r.city).filter(Boolean))).sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (search) {
        const s = search.toLowerCase();
        const hit =
          r.name.toLowerCase().includes(s) ||
          r.inn?.includes(s) ||
          r.ogrn?.includes(s) ||
          r.director?.toLowerCase().includes(s);
        if (!hit) return false;
      }
      if (licenseFilter === 'with' && !r.has_education_license) return false;
      if (licenseFilter === 'without' && r.has_education_license) return false;
      if (contactFilter === 'email' && !r.email) return false;
      if (contactFilter === 'phone' && !r.phone) return false;
      if (contactFilter === 'both' && (!r.email || !r.phone)) return false;
      if (cityFilter !== 'all' && r.city !== cityFilter) return false;
      if (riskFilter === 'risky' && !(r.sanctions || r.unfair_supplier || r.mass_address || r.mass_director)) return false;
      if (riskFilter === 'clean' && (r.sanctions || r.unfair_supplier || r.mass_address || r.mass_director)) return false;
      return true;
    });
  }, [rows, search, licenseFilter, contactFilter, cityFilter, riskFilter]);

  const handleAdd = (inns: string[]) => {
    enrichBatch.mutate(
      { inns, mode: 'add' },
      { onSuccess: () => setAddOpen(false) },
    );
  };

  const handleRefresh = () => {
    enrichBatch.mutate({ inns: [], mode: 'refresh' });
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const data = filtered.map(r => ({
      'Название': r.name,
      'ИНН': r.inn,
      'КПП': r.kpp || '',
      'ОГРН': r.ogrn || '',
      'Дата регистрации': r.registration_date || '',
      'Город': r.city || '',
      'Регион': r.region || '',
      'Адрес': r.address || '',
      'Телефон': r.phone || '',
      'Все телефоны': r.phones?.join('; ') || '',
      'Email': r.email || '',
      'Все email': r.emails?.join('; ') || '',
      'Сайт': r.website || '',
      'Директор': r.director || '',
      'ИНН директора': r.director_inn || '',
      'Должность': r.director_position || '',
      'ОКВЭД': r.okved_main || '',
      'Сотрудников': r.employee_count ?? '',
      'Уставный капитал': r.charter_capital ?? '',
      'Лицензий всего': Array.isArray(r.licenses) ? r.licenses.length : 0,
      'Образоват. лицензия': r.has_education_license ? 'Да' : 'Нет',
      'Лицензия №': r.license_number || '',
      'Дата лицензии': r.license_issue_date || '',
      'Орган выдачи': r.license_authority || '',
      'Действует до': r.license_valid_to || '',
      'Виды деятельности по лицензии': r.license_activities?.join('; ') || '',
      'Статус': r.status || '',
      'РНП': r.unfair_supplier ? 'Да' : '',
      'Санкции': r.sanctions ? 'Да' : '',
      'Массовый адрес': r.mass_address ? 'Да' : '',
      'Массовый руководитель': r.mass_director ? 'Да' : '',
      'Источник': r.source_url || '',
      'Обновлено': new Date(r.parsed_at).toLocaleDateString('ru-RU'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Компании');
    XLSX.writeFile(wb, `companies_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <CheckoQuotaBar />

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">База компаний (Checko API)</h3>
              <Badge variant="secondary">{rows.length}</Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => setAddOpen(true)} className="gap-2" disabled={remaining === 0}>
                <Plus className="w-4 h-4" /> Добавить ИНН
              </Button>
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={enrichBatch.isPending || remaining === 0 || rows.length === 0}
                className="gap-2"
                title={remaining === 0 ? 'Дневная квота исчерпана' : 'Обновить самые старые записи'}
              >
                {enrichBatch.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RefreshCw className="w-4 h-4" />}
                Обновить устаревшие ({Math.min(remaining, rows.length)})
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={!filtered.length} className="gap-2">
                <Download className="w-4 h-4" /> Экспорт XLSX ({filtered.length})
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск: название / ИНН / ОГРН / директор"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={licenseFilter} onValueChange={setLicenseFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все компании</SelectItem>
                <SelectItem value="with">С образоват. лицензией</SelectItem>
                <SelectItem value="without">Без лицензии</SelectItem>
              </SelectContent>
            </Select>
            <Select value={contactFilter} onValueChange={setContactFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любые контакты</SelectItem>
                <SelectItem value="email">Есть Email</SelectItem>
                <SelectItem value="phone">Есть телефон</SelectItem>
                <SelectItem value="both">Email и телефон</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Город" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все города</SelectItem>
                {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все по рискам</SelectItem>
                <SelectItem value="clean">Без рисков</SelectItem>
                <SelectItem value="risky">Есть риски</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Компания</TableHead>
                  <TableHead>ИНН / КПП</TableHead>
                  <TableHead>Город</TableHead>
                  <TableHead>Контакты</TableHead>
                  <TableHead>Лицензии</TableHead>
                  <TableHead>Сотр.</TableHead>
                  <TableHead>Риски</TableHead>
                  <TableHead>Директор</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </TableCell></TableRow>
                )}
                {!list.isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    База пуста. Нажмите «Добавить ИНН», чтобы загрузить компании из Checko.
                  </TableCell></TableRow>
                )}
                {filtered.map(r => (
                  <CompanyRow
                    key={r.id}
                    row={r}
                    onConvert={() => convertToLead.mutate(r.id)}
                    onDelete={() => remove.mutate(r.id)}
                    converting={convertToLead.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddInnsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleAdd}
        isSubmitting={enrichBatch.isPending}
        remainingQuota={remaining}
      />
    </div>
  );
}

function CompanyRow({ row, onConvert, onDelete, converting }: {
  row: SalesCompanyDbRow;
  onConvert: () => void;
  onDelete: () => void;
  converting: boolean;
}) {
  const licCount = Array.isArray(row.licenses) ? row.licenses.length : 0;
  const risks: string[] = [];
  if (row.sanctions) risks.push('Санкции');
  if (row.unfair_supplier) risks.push('РНП');
  if (row.mass_address) risks.push('Масс. адрес');
  if (row.mass_director) risks.push('Масс. рук.');

  return (
    <TableRow>
      <TableCell className="max-w-[280px]">
        <div className="font-medium truncate" title={row.name}>{row.name}</div>
        {row.status && row.status !== 'Действующее' && row.status !== 'ACTIVE' && (
          <Badge variant="outline" className="mt-1 text-xs">{row.status}</Badge>
        )}
      </TableCell>
      <TableCell className="text-xs">
        <div className="font-mono">{row.inn}</div>
        {row.kpp && <div className="font-mono text-muted-foreground">{row.kpp}</div>}
      </TableCell>
      <TableCell className="text-sm">{row.city || row.region || '—'}</TableCell>
      <TableCell className="text-xs space-y-0.5">
        {row.phone && <div>{row.phone}</div>}
        {row.email && <div className="text-muted-foreground truncate max-w-[180px]" title={row.email}>{row.email}</div>}
        {row.website && (
          <a href={row.website.startsWith('http') ? row.website : `https://${row.website}`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
            сайт <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {!row.phone && !row.email && !row.website && <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-xs max-w-[180px]">
        {licCount > 0 ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 font-medium">
              <BadgeCheck className={`w-3.5 h-3.5 ${row.has_education_license ? 'text-primary' : 'text-muted-foreground'}`} />
              {licCount} {licCount === 1 ? 'лицензия' : 'лицензий'}
            </div>
            {row.has_education_license && (
              <Badge variant="secondary" className="text-[10px]">Образоват.</Badge>
            )}
          </div>
        ) : <span className="text-muted-foreground">нет</span>}
      </TableCell>
      <TableCell className="text-sm">{row.employee_count ?? '—'}</TableCell>
      <TableCell className="text-xs">
        {risks.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {risks.map(r => (
              <Badge key={r} variant="destructive" className="text-[10px] gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />{r}
              </Badge>
            ))}
          </div>
        ) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-xs max-w-[180px] truncate" title={row.director || ''}>
        {row.director || '—'}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {row.source_url && (
            <Button variant="ghost" size="icon" asChild title="Открыть карточку Checko">
              <a href={row.source_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
            </Button>
          )}
          <Button
            variant={row.converted_to_lead_id ? 'ghost' : 'outline'}
            size="sm"
            onClick={onConvert}
            disabled={converting || !!row.converted_to_lead_id}
            className="gap-1"
            title={row.converted_to_lead_id ? 'Уже в лидах' : 'Создать лид'}
          >
            <UserPlus className="w-4 h-4" />
            {row.converted_to_lead_id ? 'В лидах' : 'В лиды'}
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} title="Удалить">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
