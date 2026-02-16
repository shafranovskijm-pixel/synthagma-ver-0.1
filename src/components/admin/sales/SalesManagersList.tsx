import { useState, useEffect } from 'react';
import { Plus, UserCheck, UserX, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSalesManager } from '@/hooks/useSalesManager';

export function SalesManagersList() {
  const { managers, fetchManagers, createManager, toggleManagerActive, loading, leads, proposals, fetchLeads, fetchProposals } = useSalesManager();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => { fetchManagers(); fetchLeads(); fetchProposals(); }, [fetchManagers, fetchLeads, fetchProposals]);

  const handleCreate = async () => {
    if (!email || !password || !fullName) return;
    const ok = await createManager(email, password, fullName, phone || undefined);
    if (ok) { setEmail(''); setPassword(''); setFullName(''); setPhone(''); setDialogOpen(false); }
  };

  const getManagerStats = (managerId: string) => {
    const leadsCount = leads.filter(l => l.assigned_manager_id === managerId).length;
    const proposalsCount = proposals.filter(p => p.manager_id === managerId).length;
    return { leadsCount, proposalsCount };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Менеджеры по продажам</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />Добавить менеджера</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новый менеджер</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <div><Label>ФИО</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Иванов Иван Иванович" /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@company.ru" /></div>
              <div><Label>Пароль</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 6 символов" /></div>
              <div><Label>Телефон (необязательно)</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7..." /></div>
              <Button onClick={handleCreate} className="w-full" disabled={loading}>
                {loading ? 'Создание...' : 'Создать менеджера'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {managers.map(m => {
          const stats = getManagerStats(m.id);
          return (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{m.full_name}</p>
                    <Badge variant={m.is_active ? 'default' : 'secondary'}>
                      {m.is_active ? 'Активен' : 'Неактивен'}
                    </Badge>
                  </div>
                  {m.phone && <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{m.phone}</p>}
                  <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                    <span>Лидов: {stats.leadsCount}</span>
                    <span>КП: {stats.proposalsCount}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleManagerActive(m.id, !m.is_active)}
                >
                  {m.is_active ? <><UserX className="w-4 h-4 mr-1" />Деактивировать</> : <><UserCheck className="w-4 h-4 mr-1" />Активировать</>}
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {managers.length === 0 && <p className="text-center text-muted-foreground py-8">Менеджеры не добавлены</p>}
      </div>
    </div>
  );
}
