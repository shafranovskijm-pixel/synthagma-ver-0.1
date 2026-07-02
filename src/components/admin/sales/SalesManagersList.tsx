import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UserCheck, UserX, Phone, Eye, Link2, Copy, Send, Wand2, Mail, MessageCircle, ListTodo, BarChart3, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useSalesManager } from '@/hooks/useSalesManager';
import { InviteSalesManagerDialog } from './InviteSalesManagerDialog';
import { setAdminSalesView } from '@/utils/adminViewMode';
import { AssignTaskDialog } from './AssignTaskDialog';
import { ManagerStatsDialog } from './ManagerStatsDialog';


interface CreatedCreds { email: string; password: string; generated: boolean; fullName: string }

export function SalesManagersList() {
  const { managers, fetchManagers, createManager, toggleManagerActive, resetManagerPassword, loading, leads, proposals, fetchLeads, fetchProposals } = useSalesManager();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [autoGen, setAutoGen] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [created, setCreated] = useState<CreatedCreds | null>(null);
  const [taskFor, setTaskFor] = useState<{ id: string; full_name: string; user_id: string } | null>(null);
  const [statsFor, setStatsFor] = useState<{ id: string; full_name: string } | null>(null);
  const navigate = useNavigate();

  const handleImpersonate = (m: { id: string; user_id: string; full_name: string }) => {
    setAdminSalesView({ managerId: m.id, userId: m.user_id, fullName: m.full_name, returnTo: '/admin' });
    // Форсируем полную перезагрузку, чтобы SalesDashboard подхватил viewAs
    // и показал баннер + чистый интерфейс менеджера.
    window.location.assign('/sales');
  };


  useEffect(() => { fetchManagers(); fetchLeads(); fetchProposals(); }, [fetchManagers, fetchLeads, fetchProposals]);

  const resetForm = () => { setEmail(''); setPassword(''); setFullName(''); setPhone(''); setAutoGen(true); };

  const handleCreate = async () => {
    if (!fullName.trim()) { toast.error('Укажите ФИО'); return; }
    if (!autoGen && (!email || !password)) { toast.error('Заполните email и пароль или включите авто-генерацию'); return; }
    const res = await createManager(
      fullName.trim(),
      phone || undefined,
      autoGen ? undefined : { email, password }
    );
    if (res) {
      setCreated({ ...res, fullName: fullName.trim() });
      resetForm();
      setDialogOpen(false);
    }
  };

  const copy = async (text: string, label = 'Скопировано') => {
    try { await navigator.clipboard.writeText(text); toast.success(label); } catch { toast.error('Не удалось скопировать'); }
  };

  const credsText = created
    ? `Доступ в кабинет менеджера СИНТАГМА\nФИО: ${created.fullName}\nЛогин: ${created.email}\nПароль: ${created.password}\nВход: ${window.location.origin}/login`
    : '';

  const getManagerStats = (managerId: string) => {
    const leadsCount = leads.filter(l => l.assigned_manager_id === managerId).length;
    const proposalsCount = proposals.filter(p => p.manager_id === managerId).length;
    return { leadsCount, proposalsCount };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Менеджеры по продажам</h3>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
            <Link2 className="w-4 h-4 mr-2" />Пригласить по ссылке
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />Добавить менеджера
          </Button>
        </div>
      </div>

      {/* Диалог создания */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Новый менеджер</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>ФИО</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Иванов Иван Иванович" />
            </div>
            <div>
              <Label>Телефон (необязательно)</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7..." />
            </div>
            <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
              <Switch checked={autoGen} onCheckedChange={setAutoGen} />
              <div className="flex-1">
                <div className="text-sm font-medium flex items-center gap-1"><Wand2 className="w-3.5 h-3.5" />Сгенерировать логин и пароль</div>
                <div className="text-xs text-muted-foreground">Система создаст доступ и покажет учётные данные для отправки менеджеру</div>
              </div>
            </label>
            {!autoGen && (
              <>
                <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@company.ru" /></div>
                <div><Label>Пароль</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 6 символов" /></div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? 'Создание…' : 'Создать менеджера'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог с созданными доступами */}
      <Dialog open={!!created} onOpenChange={(v) => !v && setCreated(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Доступ создан</DialogTitle></DialogHeader>
          {created && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Логин</span><code className="font-mono">{created.email}</code></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Пароль</span><code className="font-mono">{created.password}</code></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Вход</span><code className="font-mono text-xs">{window.location.origin}/login</code></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => copy(credsText, 'Данные скопированы')}>
                  <Copy className="w-4 h-4 mr-2" />Скопировать всё
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://t.me/share/url?url=${encodeURIComponent(window.location.origin + '/login')}&text=${encodeURIComponent(credsText)}`} target="_blank" rel="noreferrer">
                    <Send className="w-4 h-4 mr-2" />Telegram
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://wa.me/?text=${encodeURIComponent(credsText)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="w-4 h-4 mr-2" />WhatsApp
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${created.email}?subject=${encodeURIComponent('Доступ в кабинет менеджера СИНТАГМА')}&body=${encodeURIComponent(credsText)}`}>
                    <Mail className="w-4 h-4 mr-2" />Email
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Пароль показывается один раз — сохраните или сразу отправьте менеджеру.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InviteSalesManagerDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <div className="grid gap-3">
        {managers.map(m => {
          const stats = getManagerStats(m.id);
          return (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between p-4 gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStatsFor({ id: m.id, full_name: m.full_name })}
                  className="flex-1 min-w-[200px] text-left hover:opacity-80 transition"
                  title="Открыть историю активностей"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium underline-offset-4 hover:underline">{m.full_name}</p>
                    <Badge variant={m.is_active ? 'default' : 'secondary'}>
                      {m.is_active ? 'Активен' : 'Неактивен'}
                    </Badge>
                  </div>
                  {m.phone && <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{m.phone}</p>}
                  <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                    <span>Лидов: {stats.leadsCount}</span>
                    <span>КП: {stats.proposalsCount}</span>
                  </div>
                </button>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => setStatsFor({ id: m.id, full_name: m.full_name })}>
                    <BarChart3 className="w-4 h-4 mr-1" />История
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTaskFor({ id: m.id, full_name: m.full_name, user_id: m.user_id })}>
                    <ListTodo className="w-4 h-4 mr-1" />Поставить задачу
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleImpersonate(m)}>
                    <Eye className="w-4 h-4 mr-1" />Войти как
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!confirm(`Сбросить пароль для ${m.full_name}? Старый пароль перестанет работать.`)) return;
                      const res = await resetManagerPassword(m.id);
                      if (res) setCreated({ email: res.email, password: res.password, generated: true, fullName: res.full_name });
                    }}
                  >
                    <KeyRound className="w-4 h-4 mr-1" />Сбросить пароль
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleManagerActive(m.id, !m.is_active)}
                  >
                    {m.is_active ? <><UserX className="w-4 h-4 mr-1" />Деактивировать</> : <><UserCheck className="w-4 h-4 mr-1" />Активировать</>}
                  </Button>
                </div>

              </CardContent>
            </Card>
          );
        })}
        {managers.length === 0 && <p className="text-center text-muted-foreground py-8">Менеджеры не добавлены</p>}
      </div>

      <AssignTaskDialog
        open={!!taskFor}
        onOpenChange={(v) => !v && setTaskFor(null)}
        manager={taskFor}
      />

      <ManagerStatsDialog
        open={!!statsFor}
        onOpenChange={(v) => !v && setStatsFor(null)}
        manager={statsFor}
      />

    </div>
  );
}
