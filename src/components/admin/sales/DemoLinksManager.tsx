import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Copy, Plus, Trash2, Users, ExternalLink, Eye } from 'lucide-react';
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
}

interface DemoSession {
  id: string;
  participant_name: string | null;
  org_name: string | null;
  created_at: string;
}

export function DemoLinksManager() {
  const [links, setLinks] = useState<DemoLink[]>([]);
  const [sessions, setSessions] = useState<Record<string, DemoSession[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [kinescopeId, setKinescopeId] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLinks = useCallback(async () => {
    const { data } = await supabase
      .from('sales_demo_links')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setLinks(data);
  }, []);

  const fetchSessions = useCallback(async (linkId: string) => {
    const { data } = await supabase
      .from('sales_demo_sessions')
      .select('id, participant_name, org_name, created_at')
      .eq('demo_link_id', linkId)
      .order('created_at', { ascending: false });
    if (data) setSessions(prev => ({ ...prev, [linkId]: data }));
  }, []);

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
      label: label.trim(),
      kinescope_live_id: kinescopeId.trim() || null,
    });

    if (error) { toast.error('Ошибка создания'); console.error(error); }
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
    await supabase.from('sales_demo_links').delete().eq('id', id);
    toast.success('Удалено');
    fetchLinks();
  };

  const copyUrl = (token: string) => {
    const url = `${window.location.origin}/demo/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Ссылка скопирована');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Демо-ссылки</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />Создать ссылку
        </Button>
      </div>

      {links.map(link => (
        <Card key={link.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{link.label}</span>
                <Badge variant={link.is_active ? 'default' : 'secondary'}>
                  {link.is_active ? 'Активна' : 'Отключена'}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => copyUrl(link.token)} title="Копировать">
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => window.open(`/demo/${link.token}`, '_blank')} title="Открыть регистрацию">
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => window.open(`/demo/${link.token}/dashboard${link.kinescope_live_id ? `?kinescope=${link.kinescope_live_id}` : ''}`, '_blank')} title="Превью ведущего">
                  <Eye className="w-4 h-4" />
                </Button>
                <Switch checked={link.is_active} onCheckedChange={() => toggleActive(link)} />
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteLink(link.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Создана: {format(new Date(link.created_at), 'dd MMM yyyy HH:mm', { locale: ru })}
              {link.kinescope_live_id && ` • Kinescope: ${link.kinescope_live_id}`}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => fetchSessions(link.id)}
            >
              <Users className="w-3 h-3 mr-1" />Участники
            </Button>
            {sessions[link.id] && (
              <div className="mt-2 space-y-1">
                {sessions[link.id].length === 0 && (
                  <p className="text-xs text-muted-foreground">Нет участников</p>
                )}
                {sessions[link.id].map(s => (
                  <div key={s.id} className="text-xs flex items-center gap-2 p-1.5 bg-muted/30 rounded">
                    <span className="font-medium">{s.participant_name || '—'}</span>
                    <span className="text-muted-foreground">{s.org_name || '—'}</span>
                    <span className="text-muted-foreground ml-auto">
                      {format(new Date(s.created_at), 'dd.MM HH:mm')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {links.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Нет демо-ссылок</p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать демо-ссылку</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Название *</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Например: Демо для ООО Ромашка" />
            </div>
            <div>
              <Label>Kinescope Live ID (опционально)</Label>
              <Input value={kinescopeId} onChange={e => setKinescopeId(e.target.value)} placeholder="ID трансляции Kinescope" />
              <p className="text-xs text-muted-foreground mt-1">
                Если указан, в демо-кабинете будет показан плеер с вашей трансляцией
              </p>
            </div>
            <Button onClick={handleCreate} disabled={loading} className="w-full">
              {loading ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
