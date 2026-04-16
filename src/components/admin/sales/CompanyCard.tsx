import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, User, MapPin, Mail, Globe, Copy, Check, CreditCard, Calendar, Hash, FileText, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const KNOWN_DATA = {
  inn: '253615392404',
  ogrnip: '324253600042754',
  fullName: 'ИП Шафрановский Максим Михайлович',
  birthDate: '25.10.1988',
  email: '24@24zxc.ru',
  domain: 'sintagma.com.ru',
  bankName: 'ООО «Озон Банк»',
  bik: '044525068',
  account: '40914810200040551529',
  corrAccount: '30101810645374525068',
};

interface DaDataCompany {
  name: string;
  fullName: string;
  inn: string;
  ogrn: string;
  address: string | null;
  status: string | null;
  type: string;
  opf: string | null;
  management: string | null;
  managementPosition: string | null;
  license: { number: string; issueDate: string; issueAuthority: string; activities: string[] } | null;
}

function CopyField({ label, value, icon: Icon }: { label: string; value: string | null; icon: React.ElementType }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Скопировано');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button onClick={handleCopy} className="group flex items-start gap-3 w-full text-left p-3 rounded-xl hover:bg-primary/5 transition-colors">
      <Icon className="w-4 h-4 mt-0.5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
      {copied ? <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> : <Copy className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />}
    </button>
  );
}

export function CompanyCard() {
  const [company, setCompany] = useState<DaDataCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('dadata-company', {
          body: { inn: KNOWN_DATA.inn },
        });
        if (fnError) throw fnError;
        if (data?.success && data.company) {
          setCompany(data.company);
        } else {
          setError('Компания не найдена в DaData');
        }
      } catch (e: any) {
        console.error('DaData error:', e);
        setError(e.message || 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Загрузка реквизитов…</span>
      </div>
    );
  }

  const statusLabel = company?.status === 'ACTIVE' ? 'Действующий' : company?.status || '—';
  const statusColor = company?.status === 'ACTIVE' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500';

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">Карточка компании</h2>
        {company && <Badge className={statusColor}>{statusLabel}</Badge>}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive p-3 rounded-xl bg-destructive/10">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Основные реквизиты */}
      <Card className="shadow-lg border-0 bg-card">
        <CardContent className="p-5 space-y-1">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Основные реквизиты</h3>
          <CopyField label="Наименование" value={company?.fullName || KNOWN_DATA.fullName} icon={Building2} />
          <CopyField label="ИНН" value={KNOWN_DATA.inn} icon={Hash} />
          <CopyField label="ОГРНИП" value={company?.ogrn || KNOWN_DATA.ogrnip} icon={Hash} />
          <CopyField label="ОПФ" value={company?.opf || null} icon={FileText} />
        </CardContent>
      </Card>

      {/* Руководитель */}
      <Card className="shadow-lg border-0 bg-card">
        <CardContent className="p-5 space-y-1">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Руководитель</h3>
          <CopyField label="ФИО" value={company?.management || 'Шафрановский Максим Михайлович'} icon={User} />
          <CopyField label="Должность" value={company?.managementPosition || 'Индивидуальный предприниматель'} icon={User} />
          <CopyField label="Дата рождения" value={KNOWN_DATA.birthDate} icon={Calendar} />
        </CardContent>
      </Card>

      {/* Адрес */}
      <Card className="shadow-lg border-0 bg-card">
        <CardContent className="p-5 space-y-1">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Юридический адрес</h3>
          <CopyField label="Адрес" value={company?.address || '—'} icon={MapPin} />
        </CardContent>
      </Card>

      {/* Контакты */}
      <Card className="shadow-lg border-0 bg-card">
        <CardContent className="p-5 space-y-1">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Контакты</h3>
          <CopyField label="Email" value={KNOWN_DATA.email} icon={Mail} />
          <CopyField label="Домен" value={KNOWN_DATA.domain} icon={Globe} />
        </CardContent>
      </Card>

      {/* Лицензии */}
      {company?.license && (
        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-5 space-y-1">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Лицензия</h3>
            <CopyField label="Номер" value={company.license.number} icon={FileText} />
            <CopyField label="Дата выдачи" value={company.license.issueDate} icon={Calendar} />
            <CopyField label="Орган выдачи" value={company.license.issueAuthority} icon={Building2} />
            {company.license.activities?.length > 0 && (
              <div className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Виды деятельности</p>
                {company.license.activities.map((a, i) => (
                  <p key={i} className="text-xs text-foreground/80">• {a}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Банковские реквизиты */}
      <Card className="shadow-lg border-0 bg-card">
        <CardContent className="p-5 space-y-1">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Банковские реквизиты</h3>
          <CopyField label="Банк" value={KNOWN_DATA.bankName} icon={CreditCard} />
          <CopyField label="БИК" value={KNOWN_DATA.bik} icon={Hash} />
          <CopyField label="Расчётный счёт" value={KNOWN_DATA.account} icon={Hash} />
          <CopyField label="Корр. счёт" value={KNOWN_DATA.corrAccount} icon={Hash} />
        </CardContent>
      </Card>
    </div>
  );
}
