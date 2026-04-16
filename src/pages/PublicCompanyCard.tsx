import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Building2, User, MapPin, Mail, Globe, CreditCard, Calendar, Hash, Copy, Check, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import companyCardBg from '@/assets/company-card-bg.jpg';



const KNOWN_DATA = {
  inn: '253615392404',
  ogrnip: '324253600042754',
  fullName: 'ИП Шафрановский Максим Михайлович',
  birthDate: '25.10.1988',
  email: '24@24zxc.ru',
  domain: 'sintagma.com.ru',
  bankName: 'ООО «Озон Банк»',
  bik: '044525068',
  account1: '40914810200040551529',
  account2: '40802810200000522079',
  corrAccount: '30101810645374525068',
};

function Field({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Скопировано');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button onClick={handleCopy} className="group flex items-start gap-3 w-full text-left p-3 rounded-lg hover:bg-white/10 transition-colors">
      <Icon className="w-4 h-4 mt-0.5 text-cyan-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-white/50 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-white font-medium truncate">{value}</p>
      </div>
      {copied ? <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" /> : <Copy className="w-4 h-4 text-white/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-1">
      <h3 className="text-[11px] font-semibold uppercase text-cyan-300/70 tracking-widest mb-2">{title}</h3>
      {children}
    </div>
  );
}

export default function PublicCompanyCard() {
  const { token } = useParams<{ token: string }>();
  const [valid, setValid] = useState<boolean | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'company_card_public_token')
        .maybeSingle();

      if (data?.setting_value === token) {
        setValid(true);
        // Try to get address from DaData
        try {
          const { data: dd } = await supabase.functions.invoke('dadata-company', { body: { inn: KNOWN_DATA.inn } });
          if (dd?.company?.address) setAddress(dd.company.address);
        } catch { /* ignore */ }
      } else {
        setValid(false);
      }
    })();
  }, [token]);

  const handleExport = async (format: 'pdf' | 'docx') => {
    setExporting(format);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-company-card', {
        body: { format, companyData: { ...KNOWN_DATA, address, opf: null, ogrn: KNOWN_DATA.ogrnip } },
      });
      if (fnError) throw fnError;
      if (data?.base64) {
        const html = decodeURIComponent(escape(atob(data.base64)));
        if (format === 'pdf') {
          const w = window.open('', '_blank');
          if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
        } else {
          const blob = new Blob([html], { type: 'application/msword' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'Карточка_компании.doc'; a.click();
          URL.revokeObjectURL(url);
        }
      }
      toast.success(format === 'pdf' ? 'Откройте печать для сохранения в PDF' : 'Файл Word скачан');
    } catch (e: any) {
      console.error('Export error:', e);
      toast.error('Ошибка экспорта');
    } finally {
      setExporting(null);
    }
  };


  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
        <div className="text-center text-white/70">
          <h1 className="text-2xl font-bold mb-2">Ссылка недействительна</h1>
          <p className="text-sm">Проверьте корректность ссылки</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={companyCardBg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#0a1628]/85" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-1">Синтагма</h1>
          <p className="text-sm text-cyan-300/60">Образовательная платформа · Реквизиты компании</p>
        </div>

        <div className="space-y-5">
          <Section title="Основные реквизиты">
            <Field label="Наименование" value={KNOWN_DATA.fullName} icon={Building2} />
            <Field label="ИНН" value={KNOWN_DATA.inn} icon={Hash} />
            <Field label="ОГРНИП" value={KNOWN_DATA.ogrnip} icon={Hash} />
          </Section>

          <Section title="Руководитель">
            <Field label="ФИО" value="Шафрановский Максим Михайлович" icon={User} />
            <Field label="Дата рождения" value={KNOWN_DATA.birthDate} icon={Calendar} />
          </Section>

          {address && (
            <Section title="Юридический адрес">
              <Field label="Адрес" value={address} icon={MapPin} />
            </Section>
          )}

          <Section title="Контакты">
            <Field label="Email" value={KNOWN_DATA.email} icon={Mail} />
            <Field label="Сайт" value={KNOWN_DATA.domain} icon={Globe} />
          </Section>

          <Section title="Банковские реквизиты">
            <Field label="Банк" value={KNOWN_DATA.bankName} icon={CreditCard} />
            <Field label="БИК" value={KNOWN_DATA.bik} icon={Hash} />
            <Field label="Расчётный счёт №1" value={KNOWN_DATA.account1} icon={Hash} />
            <Field label="Расчётный счёт №2" value={KNOWN_DATA.account2} icon={Hash} />
            <Field label="Корр. счёт" value={KNOWN_DATA.corrAccount} icon={Hash} />
          </Section>
        </div>

        <p className="text-center text-[11px] text-white/20 mt-10">© {new Date().getFullYear()} sintagma.com.ru</p>
      </div>
    </div>
  );
}
