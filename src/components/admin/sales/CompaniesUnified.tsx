import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Snowflake, Archive, Ban } from 'lucide-react';
import { LeadsManager } from './LeadsManager';
import { CompaniesDatabase } from './CompaniesDatabase';
import { useSalesBlacklist } from '@/hooks/useSalesBlacklist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export function CompaniesUnified() {
  const [tab, setTab] = useState<'in_work' | 'cold' | 'archive' | 'blacklist'>('in_work');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Компании
        </h2>
        <p className="text-sm text-muted-foreground">Все компании: в работе, холодная база, архив и чёрный список</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="in_work" className="rounded-lg gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> В работе
          </TabsTrigger>
          <TabsTrigger value="cold" className="rounded-lg gap-1.5">
            <Snowflake className="w-3.5 h-3.5" /> Холодная база
          </TabsTrigger>
          <TabsTrigger value="archive" className="rounded-lg gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Архив
          </TabsTrigger>
          <TabsTrigger value="blacklist" className="rounded-lg gap-1.5">
            <Ban className="w-3.5 h-3.5" /> Чёрный список
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in_work" className="mt-4">
          <LeadsManager />
        </TabsContent>

        <TabsContent value="cold" className="mt-4">
          <CompaniesDatabase />
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <Card className="rounded-2xl">
            <CardContent className="p-8 text-center text-muted-foreground">
              Архив компаний — здесь будут отображаться ранее удалённые лиды и компании.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blacklist" className="mt-4">
          <BlacklistTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BlacklistTab() {
  const { list, add, remove } = useSalesBlacklist();
  const [open, setOpen] = useState(false);
  const [inn, setInn] = useState('');
  const [orgName, setOrgName] = useState('');
  const [reason, setReason] = useState('');

  const items = list.data || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Компании, которым не звоним и не пишем. ИНН блокируется при импорте.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl"><Plus className="w-4 h-4 mr-1" />Добавить ИНН</Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader><DialogTitle>В чёрный список</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">ИНН *</label>
                <Input value={inn} onChange={e => setInn(e.target.value)} placeholder="7707083893" className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Название компании</label>
                <Input value={orgName} onChange={e => setOrgName(e.target.value)} className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Причина</label>
                <Textarea value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Отказались от сотрудничества, не звонить" rows={2} className="rounded-xl" />
              </div>
              <Button className="w-full rounded-xl" disabled={!inn.trim()}
                onClick={async () => {
                  await add.mutateAsync({ inn: inn.trim(), org_name: orgName.trim() || undefined, reason: reason.trim() || undefined });
                  setInn(''); setOrgName(''); setReason('');
                  setOpen(false);
                }}>
                Добавить
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-3">
          {list.isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">Загрузка...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              Чёрный список пуст
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map(it => (
                <div key={it.id} className="flex items-start gap-3 p-3 rounded-xl border hover:bg-muted/30">
                  <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{it.org_name || it.inn}</div>
                    <div className="text-xs text-muted-foreground">ИНН: {it.inn}</div>
                    {it.reason && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{it.reason}</div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(it.added_at), 'dd MMM yyyy', { locale: ru })}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg"
                    onClick={() => remove.mutate(it.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
