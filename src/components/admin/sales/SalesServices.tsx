import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSalesManager, type SalesService } from '@/hooks/useSalesManager';

export function SalesServices() {
  const { services, fetchServices, createService, updateService, deleteService } = useSalesManager();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<SalesService | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => { fetchServices(); }, [fetchServices]);

  // Автосев дефолтных услуг (один раз после первой загрузки)
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!services) return;
    seededRef.current = true;
    const defaults = [
      {
        name: 'Коробочная версия СИНТАГМА',
        description: 'Неисключительная бессрочная лицензия с возможностью доработки и установки на ваш сервер. 3 месяца поддержки в стоимости.',
        price: 540000,
      },
      {
        name: 'Разработка сайта образовательной организации под ключ',
        description: 'Профессиональный сайт учебного центра: адаптивный дизайн, каталог курсов, формы заявок, управление контентом.',
        price: 55000,
      },
    ];
    (async () => {
      for (const d of defaults) {
        if (!services.some(s => s.name.trim().toLowerCase() === d.name.toLowerCase())) {
          await createService(d.name, d.description, d.price);
        }
      }
    })();
  }, [services, createService]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (editingService) {
      await updateService(editingService.id, { name, description, price: Number(price) || 0 });
    } else {
      await createService(name, description, Number(price) || 0);
    }
    resetForm();
  };

  const resetForm = () => {
    setName(''); setDescription(''); setPrice('');
    setEditingService(null); setDialogOpen(false);
  };

  const startEdit = (s: SalesService) => {
    setEditingService(s);
    setName(s.name); setDescription(s.description || ''); setPrice(String(s.price));
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Каталог услуг</h3>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />Добавить услугу</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingService ? 'Редактировать услугу' : 'Новая услуга'}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <div><Label>Название</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Название услуги" /></div>
              <div><Label>Описание</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание" /></div>
              <div><Label>Цена (₽)</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" /></div>
              <Button onClick={handleSubmit} className="w-full">{editingService ? 'Сохранить' : 'Создать'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {services.map(s => (
          <Card key={s.id} className="border">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 flex-1">
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                <div className="flex-1">
                  <p className="font-medium">{s.name}</p>
                  {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                </div>
                <p className="font-semibold text-primary">{s.price.toLocaleString('ru-RU')} ₽</p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Switch checked={s.is_active} onCheckedChange={v => updateService(s.id, { is_active: v })} />
                <Button variant="ghost" size="icon" onClick={() => startEdit(s)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => deleteService(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {services.length === 0 && <p className="text-center text-muted-foreground py-8">Услуги не добавлены</p>}
      </div>
    </div>
  );
}
