import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Database, Search, Loader2, Download, UserPlus, Trash2, ExternalLink, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useSalesCompaniesDb, type SalesCompanyDbRow } from '@/hooks/useSalesCompaniesDb';

const DEFAULT_URL =
  'https://www.list-org.com/search?type=all&work=on&is_phone=on&is_email=on&okved=85.3%2C85.41.9%2C85.42.9&sort=';

export function CompaniesDatabase() {
  const { list, parsePages, convertToLead, remove } = useSalesCompaniesDb();
  const [searchUrl, setSearchUrl] = useState(DEFAULT_URL);
  const [pages, setPages] = useState('1');
  const [search, setSearch] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('all');
  const [contactFilter, setContactFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');

  const rows = list.data || [];

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
      return true;
    });
  }, [rows, search, licenseFilter, contactFilter, cityFilter]);

  const handleParse = () => {
    const n = Math.max(1, Math.min(20, parseInt(pages, 10) || 1));
    parsePages.mutate({ searchUrl: searchUrl.trim(), pages: n });
  };

  const handleExport = () => {
    const data = filtered.map(r => ({
      'Название': r.name,
      'ИНН': r.inn,
      'ОГРН': r.ogrn || '',
      'Город': r.city || '',
      'Адрес': r.address || '',
      'Телефон': r.phone || '',
      'Email': r.email || '',
      'Сайт': r.website || '',
      'Директор': r.director || '',
      'Должность': r.director_position || '',
      'Лицензия №': r.license_number || '',
      'Дата лицензии': r.license_issue_date || '',
      'Орган выдачи': r.license_authority || '',
      'Виды деятельности по лицензии': r.license_activities?.join('; ') || '',
      'Статус': r.status || '',
      'Источник': r.source_url || '',
      'Добавлено': new Date(r.parsed_at).toLocaleDateString('ru-RU'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Компании');
    XLSX.writeFile(wb, `companies_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="w-5 h-5 text-primary" />
            База компаний (парсер list-org.com)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">URL поиска list-org.com</label>
            <Input value={searchUrl} onChange={e => setSearchUrl(e.target.value)} placeholder="https://www.list-org.com/search?..." />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Страниц подряд</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={pages}
                onChange={e => setPages(e.target.value)}
                className="w-28"
              />
            </div>
            <Button onClick={handleParse} disabled={parsePages.isPending} className="gap-2">
              {parsePages.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {parsePages.isPending ? 'Парсю…' : 'Спарсить страницу'}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!filtered.length} className="gap-2">
              <Download className="w-4 h-4" />
              Экспорт XLSX ({filtered.length})
            </Button>
            <p className="text-xs text-muted-foreground ml-auto max-w-md">
              Парсинг идёт через Firecrawl (обход Cloudflare), реквизиты и лицензии обогащаются через DaData.
              1 страница ≈ 30–60 сек.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
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
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Компания</TableHead>
                  <TableHead>ИНН / ОГРН</TableHead>
                  <TableHead>Город</TableHead>
                  <TableHead>Контакты</TableHead>
                  <TableHead>Лицензия</TableHead>
                  <TableHead>Директор</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </TableCell></TableRow>
                )}
                {!list.isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    База пуста. Запустите парсинг сверху.
                  </TableCell></TableRow>
                )}
                {filtered.map(r => <CompanyRow key={r.id} row={r} onConvert={() => convertToLead.mutate(r.id)} onDelete={() => remove.mutate(r.id)} converting={convertToLead.isPending} />)}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CompanyRow({ row, onConvert, onDelete, converting }: {
  row: SalesCompanyDbRow;
  onConvert: () => void;
  onDelete: () => void;
  converting: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="max-w-[280px]">
        <div className="font-medium truncate" title={row.name}>{row.name}</div>
        {row.status && row.status !== 'ACTIVE' && (
          <Badge variant="outline" className="mt-1 text-xs">{row.status}</Badge>
        )}
      </TableCell>
      <TableCell className="text-xs">
        <div className="font-mono">{row.inn}</div>
        {row.ogrn && <div className="font-mono text-muted-foreground">{row.ogrn}</div>}
      </TableCell>
      <TableCell className="text-sm">{row.city || '—'}</TableCell>
      <TableCell className="text-xs space-y-0.5">
        {row.phone && <div>{row.phone}</div>}
        {row.email && <div className="text-muted-foreground truncate max-w-[180px]" title={row.email}>{row.email}</div>}
        {row.website && (
          <a href={row.website} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
            сайт <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {!row.phone && !row.email && !row.website && <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-xs max-w-[220px]">
        {row.license_number ? (
          <div>
            <div className="flex items-center gap-1 font-medium">
              <BadgeCheck className="w-3.5 h-3.5 text-primary" />
              {row.license_number}
            </div>
            {row.license_issue_date && <div className="text-muted-foreground">от {row.license_issue_date}</div>}
            {row.license_authority && <div className="text-muted-foreground truncate" title={row.license_authority}>{row.license_authority}</div>}
          </div>
        ) : <span className="text-muted-foreground">нет</span>}
      </TableCell>
      <TableCell className="text-xs max-w-[180px] truncate" title={row.director || ''}>
        {row.director || '—'}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {row.source_url && (
            <Button variant="ghost" size="icon" asChild title="Открыть карточку list-org">
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
