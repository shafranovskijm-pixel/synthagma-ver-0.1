import { useMemo, useState } from 'react';
import { useSalesCompaniesDb, type SalesCompanyDbRow } from '@/hooks/useSalesCompaniesDb';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Filter, Search, UserPlus, Trash2, ExternalLink, Plus, X, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FilterState {
  q: string;
  region: string;
  city: string;
  okved: string;
  licenseNumber: string;
  hasPhone: boolean;
  hasEmail: boolean;
  hasWebsite: boolean;
  hasLicense: boolean;
  onlyActive: boolean;
  onlyNotConverted: boolean;
}

const EMPTY: FilterState = {
  q: '', region: '', city: '', okved: '', licenseNumber: '',
  hasPhone: false, hasEmail: false, hasWebsite: false, hasLicense: false,
  onlyActive: false, onlyNotConverted: false,
};

export function AdminCompaniesTab() {
  const { list, convertToLead, remove } = useSalesCompaniesDb();
  const [filters, setFilters] = useState<FilterState>(EMPTY);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const companies = list.data || [];

  const { regions, cities } = useMemo(() => {
    const r = new Set<string>();
    const c = new Set<string>();
    companies.forEach(x => {
      if (x.region) r.add(x.region);
      if (x.city) c.add(x.city);
    });
    return { regions: Array.from(r).sort(), cities: Array.from(c).sort() };
  }, [companies]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return companies.filter(x => {
      if (q) {
        const hay = [x.name, x.short_name, x.full_name, x.inn, x.ogrn, x.director, x.email, x.phone]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.region && x.region !== filters.region) return false;
      if (filters.city && x.city !== filters.city) return false;
      if (filters.okved) {
        const ok = (x.okved_main || '').toLowerCase().includes(filters.okved.toLowerCase());
        if (!ok) return false;
      }
      if (filters.licenseNumber && !(x.license_number || '').toLowerCase().includes(filters.licenseNumber.toLowerCase())) return false;
      if (filters.hasPhone && !x.phone) return false;
      if (filters.hasEmail && !x.email) return false;
      if (filters.hasWebsite && !x.website) return false;
      if (filters.hasLicense && !x.has_education_license && !x.license_number) return false;
      if (filters.onlyActive && x.status && !/действ|active/i.test(x.status)) return false;
      if (filters.onlyNotConverted && x.converted_to_lead_id) return false;
      return true;
    });
  }, [companies, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    (Object.keys(filters) as (keyof FilterState)[]).forEach(k => {
      const v = filters[k];
      if (typeof v === 'boolean' && v) n++;
      else if (typeof v === 'string' && v.trim()) n++;
    });
    return n;
  }, [filters]);

  const toggleSelect = (id: string) => {
    setSelected(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(x => x.id)));
  };

  const bulkConvert = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const id of Array.from(selected)) {
      try {
        await convertToLead.mutateAsync(id);
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    toast.success(`Создано лидов: ${ok}${fail ? `, ошибок: ${fail}` : ''}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> База компаний
          </h2>
          <p className="text-sm text-muted-foreground">
            Всего: {companies.length.toLocaleString('ru')} · Отфильтровано: {filtered.length.toLocaleString('ru')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="secondary" onClick={bulkConvert} disabled={bulkBusy}>
              <UserPlus className="w-4 h-4 mr-1.5" /> В лиды ({selected.size})
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Добавить компанию
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Название, ИНН, ОГРН, директор, email, телефон…"
              value={filters.q}
              onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
              className="pl-9"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" /> Фильтр
                {activeFilterCount > 0 && <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-4 space-y-4" align="end">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Базовые</div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Регион</label>
                  <Select value={filters.region || 'all'} onValueChange={v => setFilters(f => ({ ...f, region: v === 'all' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Все" /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="all">Все регионы</SelectItem>
                      {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Город</label>
                  <Select value={filters.city || 'all'} onValueChange={v => setFilters(f => ({ ...f, city: v === 'all' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Все" /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="all">Все города</SelectItem>
                      {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">ОКВЭД (осн.)</label>
                  <Input value={filters.okved} onChange={e => setFilters(f => ({ ...f, okved: e.target.value }))} placeholder="85.42, образование…" />
                </div>

                <div className="col-span-2 pt-2 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Контакты</div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={filters.hasPhone} onCheckedChange={v => setFilters(f => ({ ...f, hasPhone: !!v }))} />
                      Есть телефон
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={filters.hasEmail} onCheckedChange={v => setFilters(f => ({ ...f, hasEmail: !!v }))} />
                      Есть e-mail
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={filters.hasWebsite} onCheckedChange={v => setFilters(f => ({ ...f, hasWebsite: !!v }))} />
                      Есть сайт
                    </label>
                  </div>
                </div>

                <div className="col-span-2 pt-2 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Лицензии</div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                    <Checkbox checked={filters.hasLicense} onCheckedChange={v => setFilters(f => ({ ...f, hasLicense: !!v }))} />
                    Есть образовательная лицензия
                  </label>
                  <Input value={filters.licenseNumber} onChange={e => setFilters(f => ({ ...f, licenseNumber: e.target.value }))} placeholder="Номер лицензии" />
                </div>

                <div className="col-span-2 pt-2 border-t space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={filters.onlyActive} onCheckedChange={v => setFilters(f => ({ ...f, onlyActive: !!v }))} />
                    Только действующие
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={filters.onlyNotConverted} onCheckedChange={v => setFilters(f => ({ ...f, onlyNotConverted: !!v }))} />
                    Ещё не в лидах
                  </label>
                </div>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
                  <X className="w-4 h-4 mr-1" /> Сбросить
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {filters.region && <Badge variant="secondary" className="gap-1">Регион: {filters.region}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, region: '' }))} /></Badge>}
            {filters.city && <Badge variant="secondary" className="gap-1">Город: {filters.city}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, city: '' }))} /></Badge>}
            {filters.okved && <Badge variant="secondary" className="gap-1">ОКВЭД: {filters.okved}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, okved: '' }))} /></Badge>}
            {filters.hasPhone && <Badge variant="secondary" className="gap-1">Телефон<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, hasPhone: false }))} /></Badge>}
            {filters.hasEmail && <Badge variant="secondary" className="gap-1">E-mail<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, hasEmail: false }))} /></Badge>}
            {filters.hasWebsite && <Badge variant="secondary" className="gap-1">Сайт<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, hasWebsite: false }))} /></Badge>}
            {filters.hasLicense && <Badge variant="secondary" className="gap-1">Лицензия<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, hasLicense: false }))} /></Badge>}
            {filters.licenseNumber && <Badge variant="secondary" className="gap-1">№ лиц.: {filters.licenseNumber}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, licenseNumber: '' }))} /></Badge>}
            {filters.onlyActive && <Badge variant="secondary" className="gap-1">Действ.<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, onlyActive: false }))} /></Badge>}
            {filters.onlyNotConverted && <Badge variant="secondary" className="gap-1">Без лида<X className="w-3 h-3 cursor-pointer" onClick={() => setFilters(f => ({ ...f, onlyNotConverted: false }))} /></Badge>}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left w-8">
                  <Checkbox
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="p-3 text-left">Компания</th>
                <th className="p-3 text-left">Регион / город</th>
                <th className="p-3 text-left">Контакты</th>
                <th className="p-3 text-left">Лицензия</th>
                <th className="p-3 text-left">Статус</th>
                <th className="p-3 text-right w-32">Действия</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Загрузка…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Ничего не найдено</td></tr>
              ) : filtered.slice(0, 500).map(c => (
                <CompanyRow
                  key={c.id}
                  company={c}
                  checked={selected.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                  onConvert={() => convertToLead.mutate(c.id)}
                  onDelete={() => {
                    if (confirm(`Удалить «${c.name}» из базы?`)) remove.mutate(c.id);
                  }}
                />
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t">
              Показаны первые 500 из {filtered.length}. Уточните фильтры.
            </div>
          )}
        </div>
      </Card>

      <AddCompanySheet open={showAdd} onOpenChange={setShowAdd} onAdded={() => list.refetch()} />
    </div>
  );
}

function CompanyRow({ company: c, checked, onToggle, onConvert, onDelete }: {
  company: SalesCompanyDbRow;
  checked: boolean;
  onToggle: () => void;
  onConvert: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-3"><Checkbox checked={checked} onCheckedChange={onToggle} /></td>
      <td className="p-3">
        <div className="font-medium">{c.name}</div>
        <div className="text-xs text-muted-foreground">ИНН {c.inn}{c.ogrn ? ` · ОГРН ${c.ogrn}` : ''}</div>
        {c.director && <div className="text-xs text-muted-foreground">{c.director}</div>}
      </td>
      <td className="p-3 text-xs">
        {c.region && <div>{c.region}</div>}
        {c.city && <div className="text-muted-foreground">{c.city}</div>}
      </td>
      <td className="p-3 text-xs space-y-0.5">
        {c.phone && <div>📞 {c.phone}</div>}
        {c.email && <div className="truncate max-w-[180px]">✉ {c.email}</div>}
        {c.website && (
          <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer"
             className="text-primary hover:underline inline-flex items-center gap-1 truncate max-w-[180px]">
            {c.website} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </td>
      <td className="p-3 text-xs">
        {c.has_education_license || c.license_number ? (
          <div>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
              {c.license_number || 'Есть'}
            </Badge>
            {c.license_issue_date && <div className="text-muted-foreground mt-0.5">от {c.license_issue_date}</div>}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3 text-xs">{c.status || '—'}</td>
      <td className="p-3 text-right">
        {c.converted_to_lead_id ? (
          <Badge variant="secondary">В лидах</Badge>
        ) : (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={onConvert} title="В лиды">
              <UserPlus className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} title="Удалить">
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function AddCompanySheet({ open, onOpenChange, onAdded }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    inn: '', name: '', ogrn: '', region: '', city: '', address: '',
    phone: '', email: '', website: '', director: '',
    license_number: '', license_issue_date: '', okved_main: '',
    has_education_license: false,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.inn.trim() || !form.name.trim()) {
      toast.error('ИНН и название обязательны');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('sales_companies_db').insert({
      ...form,
      inn: form.inn.trim(),
      name: form.name.trim(),
      license_issue_date: form.license_issue_date || null,
      data_source: 'manual',
    } as any);
    setBusy(false);
    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Компания с таким ИНН уже есть' : error.message);
      return;
    }
    toast.success('Компания добавлена');
    onAdded();
    onOpenChange(false);
    setForm({
      inn: '', name: '', ogrn: '', region: '', city: '', address: '',
      phone: '', email: '', website: '', director: '',
      license_number: '', license_issue_date: '', okved_main: '',
      has_education_license: false,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Добавить компанию</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">ИНН *</label><Input value={form.inn} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">ОГРН</label><Input value={form.ogrn} onChange={e => setForm(f => ({ ...f, ogrn: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Название *</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">Регион</label><Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Город</label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Адрес</label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">Телефон</label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">E-mail</label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Сайт</label><Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} /></div>
          <div><label className="text-xs text-muted-foreground">Директор</label><Input value={form.director} onChange={e => setForm(f => ({ ...f, director: e.target.value }))} /></div>
          <div><label className="text-xs text-muted-foreground">ОКВЭД (осн.)</label><Input value={form.okved_main} onChange={e => setForm(f => ({ ...f, okved_main: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">Номер лицензии</label><Input value={form.license_number} onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">Дата лицензии</label><Input type="date" value={form.license_issue_date} onChange={e => setForm(f => ({ ...f, license_issue_date: e.target.value }))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={form.has_education_license} onCheckedChange={v => setForm(f => ({ ...f, has_education_license: !!v }))} />
            Есть образовательная лицензия
          </label>
          <div className="flex gap-2 pt-4">
            <Button onClick={submit} disabled={busy} className="flex-1">
              {busy ? 'Сохраняю…' : 'Добавить'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
