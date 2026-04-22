import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Copy, Plus, Trash2, ExternalLink, MonitorPlay, Pencil, Save } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface DemoLink {
  id: string;
  token: string;
  label: string;
  kinescope_live_id: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  organization_id: string | null;
}

interface Props { organizationId: string }

/**
 * Демо-доступы организации. Менеджер по продажам создаёт уникальную ссылку,
 * передаёт её клиенту → клиент видит демо-страницу с трансляцией Kinescope Live.
 * Видно только записи своей организации (RLS).
 */
export function OrgDemoLinksManager({ organizationId }: Props) {
  const [links, setLinks] = useState<DemoLink[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [kinescopeId, setKinescopeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingKinescope, setEditingKinescope] = useState<Record<string, string>>({});

  const fetchLinks = useCallback(async () => {
    const { data, error } = await supabase
      .from('sales_demo_links')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    if (data) setLinks(data as DemoLink[]);
  }, [organizationId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const generateToken = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

  const handleCreate = async () => {
    if (!label.trim()) { toast.error('Введите название'); return; }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Не авторизован'); setLoading(false); return; }

    const { error } = await supabase.from('sales_demo_links').insert({
      token: generateToken(),
      created_by: user.id,
      organization_id: organizationId,
      label: label.trim(),
      kinescope_live_id: kinescopeId.trim() || null,
    });

    if (error) { toast.error('Ошибка создания: ' + error.message); console.error(error); }
    else {
      toast.success('Демо-ссылка создана');
      setCreateOpen(false);
      setLabel('');
      setKinescopeId('');
      fetchLinks();
    }
    setLoading(false);
  };

  const toggleActive = async (link: DemoLink) => {
    await supabase.from('sales_demo_links').update({ is_active: !link.is_active }).eq('id', link.id);
    fetchLinks();
  };

  const deleteLink = async (id: string) => {
    if (!confirm('Удалить демо-ссылку?')) return;
    await supabase.from('sales_demo_links').delete().eq('id', id);
    toast.success('Удалено');
    fetchLinks();
  };

  const copyUrl = (token: string) => {
    const url = `${window.location.origin}/demo/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Ссылка скопирована');
  };

  const extractKinescopeId = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const rtmpMatch = trimmed.match(/rtmp:\/\/[^/]+\/live\/([a-f0-9]+)/i);
    if (rtmpMatch) return rtmpMatch[1];
    const playerMatch = trimmed.match(/player\.kinescope\.io\/live\/([a-f0-9-]+)/i);
    if (playerMatch) return playerMatch[1];
    return trimmed;
  };

  const saveKinescope = async (link: DemoLink) => {
    const raw = editingKinescope[link.id] ?? '';
    const id = extractKinescopeId(raw);
    await supabase.from('sales_demo_links').update({ kinescope_live_id: id }).eq('id', link.id);
    setEditingKinescope(prev => { const n = { ...prev }; delete n[link.id]; return n; });
    toast.success('Сохранено');
    fetchLinks();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Демо-доступы</h3>
          <p className="text-sm text-muted-foreground">
            Уникальные ссылки на демо-стрим Kinescope для потенциальных клиентов.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" /> Создать демо
        </Button>
      </div>

      {links.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <MonitorPlay className="w-10 h-10 mx-auto mb-3 opacity-50" />
            Демо-ссылок ещё нет. Создайте первую и передайте клиенту.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {links.map(link => {
            const isEditing = link.id in editingKinescope;
            return (
              <Card key={link.id} className="border-border/60">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{link.label}</h4>
                        <Badge variant={link.is_active ? 'default' : 'secondary'} className="text-[10px]">
                          {link.is_active ? 'Активна' : 'Отключена'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Создана {format(new Date(link.created_at), 'd MMM yyyy, HH:mm', { locale: ru })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={link.is_active} onCheckedChange={() => toggleActive(link)} />
                      <Button size="sm" variant="ghost" onClick={() => copyUrl(link.token)} className="gap-1.5">
                        <Copy className="w-3.5 h-3.5" /> Копировать
                      </Button>
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <a href={`/demo/${link.token}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" /> Открыть
                        </a>
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteLink(link.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Kinescope Live ID или RTMP-ссылка</Label>
                      {isEditing ? (
                        <Input
                          value={editingKinescope[link.id]}
                          onChange={e => setEditingKinescope(prev => ({ ...prev, [link.id]: e.target.value }))}
                          placeholder="rtmp://… или ID"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground font-mono break-all min-h-[2.25rem] flex items-center">
                          {link.kinescope_live_id || '— не указан —'}
                        </p>
                      )}
                    </div>
                    {isEditing ? (
                      <Button size="sm" onClick={() => saveKinescope(link)} className="gap-1.5">
                        <Save className="w-3.5 h-3.5" /> Сохранить
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setEditingKinescope(prev => ({ ...prev, [link.id]: link.kinescope_live_id || '' }))} className="gap-1.5">
                        <Pencil className="w-3.5 h-3.5" /> Изменить
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая демо-ссылка</DialogTitle>
            <DialogDescription>Клиент увидит вашу трансляцию по уникальной ссылке.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Название (внутреннее)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Демо для ООО Ромашка" />
            </div>
            <div>
              <Label className="text-xs">Kinescope Live ID или RTMP-ссылка (необязательно)</Label>
              <Input value={kinescopeId} onChange={e => setKinescopeId(e.target.value)} placeholder="rtmp://… или ID" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={loading}>Создать</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
