import { useMemo, useState, useEffect } from 'react';
import { Loader2, Search, Save, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RUSSIAN_REGIONS, regionName } from '@/data/russianRegions';
import { CHECKO_LICENSE_TYPES, LICENSE_CATEGORIES, licenseName } from '@/data/checkoLicenseTypes';
import { useCheckoSearch, type CheckoSearchPreset } from '@/hooks/useCheckoSearch';
import { useCheckoApi } from '@/hooks/useCheckoApi';
import { toast } from 'sonner';

interface CheckoSearchDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CheckoSearchDialog({ open, onOpenChange }: CheckoSearchDialogProps) {
  const { stats } = useCheckoApi();
  const { presets, countSearch, runSearch, savePreset, deletePreset } = useCheckoSearch();

  const [selectedRegions, setSelectedRegions] = useState<number[]>([]);
  const [selectedLicenses, setSelectedLicenses] = useState<string[]>([]);
  const [okvedsText, setOkvedsText] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [limit, setLimit] = useState(1000);
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [regionSearch, setRegionSearch] = useState('');

  useEffect(() => {
    if (!open) {
      countSearch.reset();
      runSearch.reset();
    }
  }, [open]);

  const okveds = useMemo(
    () => okvedsText.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean),
    [okvedsText],
  );

  const filteredRegions = useMemo(() => {
    if (!regionSearch) return RUSSIAN_REGIONS;
    const q = regionSearch.toLowerCase();
    return RUSSIAN_REGIONS.filter(r => r.name.toLowerCase().includes(q) || String(r.code) === regionSearch);
  }, [regionSearch]);

  const hasFilters = selectedRegions.length || selectedLicenses.length || okveds.length;

  const handleLoadPreset = (id: string) => {
    setSelectedPresetId(id);
    if (!id) return;
    const preset = presets.data?.find(p => p.id === id);
    if (!preset) return;
    setSelectedRegions(preset.regions || []);
    setSelectedLicenses(preset.licenses || []);
    setOkvedsText((preset.okveds || []).join(', '));
    setActiveOnly(preset.active_only);
    setPresetName(preset.name);
    countSearch.reset();
    runSearch.reset();
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast.error('Укажите название пресета');
      return;
    }
    savePreset.mutate({
      id: selectedPresetId || undefined,
      name: presetName.trim(),
      regions: selectedRegions,
      licenses: selectedLicenses,
      okveds,
      active_only: activeOnly,
    });
  };

  const handleCount = () => {
    if (!hasFilters) {
      toast.error('Выберите хотя бы один фильтр');
      return;
    }
    countSearch.mutate({
      regions: selectedRegions,
      licenses: selectedLicenses,
      okveds,
      activeOnly,
      presetId: selectedPresetId || null,
    });
  };

  const handleRun = () => {
    if (!hasFilters) {
      toast.error('Выберите хотя бы один фильтр');
      return;
    }
    runSearch.mutate({
      regions: selectedRegions,
      licenses: selectedLicenses,
      okveds,
      activeOnly,
      autoEnrich,
      limit,
      presetId: selectedPresetId || null,
    });
  };

  const enrichRemaining = stats.data?.today_remaining ?? 100;
  const searchRemaining = stats.data?.search_remaining ?? 100;
  const count = countSearch.data;

  const toggleRegion = (code: number) =>
    setSelectedRegions(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  const toggleLicense = (code: string) =>
    setSelectedLicenses(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Подбор компаний по фильтрам через Checko Search
          </DialogTitle>
          <DialogDescription>
            Найдите компании по региону и наличию лицензии. Бесплатный лимит — 100 запросов поиска
            и 100 карточек обогащения в сутки. Сегодня осталось: <b>{searchRemaining}</b> поиска,
            <b className="ml-1">{enrichRemaining}</b> карточек.
          </DialogDescription>
        </DialogHeader>

        {/* Presets */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Сохранённый пресет</Label>
            <Select value={selectedPresetId || 'none'} onValueChange={(v) => handleLoadPreset(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Загрузить пресет…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Новый подбор —</SelectItem>
                {(presets.data || []).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Название для сохранения</Label>
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Напр.: ДПО Москва + Рособрнадзор"
            />
          </div>
          <Button variant="outline" onClick={handleSavePreset} disabled={savePreset.isPending} className="gap-2">
            {savePreset.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {selectedPresetId ? 'Обновить' : 'Сохранить'}
          </Button>
          {selectedPresetId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (confirm('Удалить пресет?')) {
                  deletePreset.mutate(selectedPresetId, { onSuccess: () => setSelectedPresetId('') });
                }
              }}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          )}
        </div>

        <Separator />

        <Tabs defaultValue="licenses" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="licenses">
              Лицензии {selectedLicenses.length > 0 && <Badge variant="secondary" className="ml-2">{selectedLicenses.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="regions">
              Регионы {selectedRegions.length > 0 && <Badge variant="secondary" className="ml-2">{selectedRegions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="extra">Доп. фильтры</TabsTrigger>
          </TabsList>

          <TabsContent value="licenses" className="flex-1 mt-3 min-h-0">
            <ScrollArea className="h-[320px] pr-3">
              {LICENSE_CATEGORIES.map(cat => {
                const items = CHECKO_LICENSE_TYPES.filter(l => l.category === cat.key);
                if (!items.length) return null;
                return (
                  <div key={cat.key} className="mb-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      {cat.label}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {items.map(l => (
                        <label
                          key={l.code}
                          className={`flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50 transition ${
                            selectedLicenses.includes(l.code) ? 'border-primary bg-primary/5' : 'border-border'
                          }`}
                        >
                          <Checkbox
                            checked={selectedLicenses.includes(l.code)}
                            onCheckedChange={() => toggleLicense(l.code)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{l.name}</div>
                            <div className="text-xs text-muted-foreground">{l.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="regions" className="flex-1 mt-3 min-h-0">
            <div className="space-y-2 h-full flex flex-col">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Поиск региона..."
                  value={regionSearch}
                  onChange={e => setRegionSearch(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => setSelectedRegions([])}>
                  Очистить
                </Button>
              </div>
              <ScrollArea className="h-[280px] pr-3 border rounded-md p-2">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                  {filteredRegions.map(r => (
                    <label
                      key={r.code}
                      className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/50 transition ${
                        selectedRegions.includes(r.code) ? 'bg-primary/10' : ''
                      }`}
                    >
                      <Checkbox
                        checked={selectedRegions.includes(r.code)}
                        onCheckedChange={() => toggleRegion(r.code)}
                      />
                      <span className="text-xs text-muted-foreground font-mono w-6">{r.code}</span>
                      <span className="text-sm truncate">{r.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="extra" className="flex-1 mt-3 space-y-4">
            <div className="space-y-1.5">
              <Label>Коды ОКВЭД (через запятую, опционально)</Label>
              <Input
                value={okvedsText}
                onChange={(e) => setOkvedsText(e.target.value)}
                placeholder="85.42, 85.41.9"
              />
              <p className="text-xs text-muted-foreground">Например: 85.42 — ДПО, 85.41 — дополнительное образование детей</p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded border">
              <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
              <div>
                <div className="text-sm font-medium">Только действующие компании</div>
                <div className="text-xs text-muted-foreground">Исключить ликвидированные и в стадии ликвидации</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Максимум ИНН за подбор</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 1000)))}
              />
              <p className="text-xs text-muted-foreground">Максимум 1000 за один запуск (10 запросов поиска)</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Selected summary */}
        {hasFilters && (
          <div className="flex flex-wrap gap-1 max-h-[60px] overflow-auto p-2 bg-muted/30 rounded text-xs">
            {selectedLicenses.map(c => (
              <Badge key={c} variant="secondary" className="text-xs">{licenseName(c)}</Badge>
            ))}
            {selectedRegions.map(c => (
              <Badge key={c} variant="outline" className="text-xs">{regionName(c)}</Badge>
            ))}
            {okveds.map(o => (
              <Badge key={o} variant="outline" className="text-xs font-mono">ОКВЭД {o}</Badge>
            ))}
          </div>
        )}

        {/* Count result */}
        {count && (
          <div className="rounded-md border p-3 bg-primary/5 space-y-2">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm">Найдено компаний по фильтру:</div>
                <div className="text-2xl font-bold text-primary">{count.total.toLocaleString('ru-RU')}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>Будет израсходовано ~{count.estimated_search_requests} запросов поиска</div>
                <div>Доступно сегодня: {count.search_remaining} поиска / {enrichRemaining} карточек</div>
              </div>
            </div>
            {count.total > enrichRemaining && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground p-2 rounded bg-background">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
                <span>
                  Все {Math.min(count.total, limit)} ИНН попадут в очередь, но обогатится только до{' '}
                  <b>{enrichRemaining}</b> сегодня. Остальные обогатятся автоматически в следующие дни
                  (по 100 карточек/сутки) при включённом автообновлении.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
          <Button
            variant="outline"
            onClick={handleCount}
            disabled={countSearch.isPending || !hasFilters}
            className="gap-2"
          >
            {countSearch.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Оценить выборку
          </Button>
          <div className="flex items-center gap-2 px-2 border-l ml-1">
            <Switch checked={autoEnrich} onCheckedChange={setAutoEnrich} id="auto-enrich" />
            <Label htmlFor="auto-enrich" className="text-xs cursor-pointer">Сразу обогатить</Label>
          </div>
          <Button
            onClick={handleRun}
            disabled={runSearch.isPending || !hasFilters || searchRemaining === 0}
            className="gap-2"
          >
            {runSearch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Запустить подбор
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
