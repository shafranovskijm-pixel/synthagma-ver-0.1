import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SigmaLogo } from '@/components/ui/SigmaLogo';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface DemoLinkData {
  id: string;
  token: string;
  label: string;
  kinescope_live_id: string | null;
  is_active: boolean;
}

const DemoJoin = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [linkData, setLinkData] = useState<DemoLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    supabase
      .from('sales_demo_links')
      .select('id, token, label, kinescope_live_id, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setInvalid(true);
        else setLinkData(data);
        setLoading(false);
      });
  }, [token]);

  const handleJoin = async () => {
    if (!name.trim() || !orgName.trim() || !linkData) {
      toast.error('Заполните все поля');
      return;
    }
    setJoining(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-demo-org', {
        body: {
          demo_link_id: linkData.id,
          participant_name: name.trim(),
          org_name: orgName.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Sign in with demo credentials
      if (data?.email && data?.password) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (signInError) throw signInError;
      }

      // Navigate to demo dashboard
      navigate(`/demo/${token}/dashboard`, { state: { kinescopeLiveId: linkData.kinescope_live_id } });
    } catch (err: any) {
      console.error('Demo join error:', err);
      toast.error(err.message || 'Ошибка регистрации');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <SigmaLogo size="md" />
            <h2 className="text-xl font-bold mt-4">Ссылка недействительна</h2>
            <p className="text-muted-foreground mt-2">Эта демо-ссылка не найдена или деактивирована.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <SigmaLogo size="md" />
          <CardTitle className="mt-4">Демонстрация платформы</CardTitle>
          <CardDescription>
            {linkData?.label || 'Введите данные для входа в демо-кабинет'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Ваше имя *</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Иван Петров"
              disabled={joining}
            />
          </div>
          <div>
            <Label>Название организации *</Label>
            <Input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="ООО Ромашка"
              disabled={joining}
            />
          </div>
          <Button onClick={handleJoin} disabled={joining} className="w-full" size="lg">
            {joining ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Подготовка...</>
            ) : (
              'Войти в демо-кабинет'
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Будет создан временный демо-аккаунт организации
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DemoJoin;
