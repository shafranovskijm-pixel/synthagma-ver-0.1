import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Status = 'yes' | 'no' | 'partial' | string;

interface ComparisonRow {
  category: string;
  feature: string;
  sintagma: Status;
  getcourse: Status;
  ispring: Status;
  moodle: Status;
}

const data: ComparisonRow[] = [
  // LMS
  { category: 'LMS', feature: 'Конструктор курсов', sintagma: 'yes', getcourse: 'yes', ispring: 'yes', moodle: 'yes' },
  { category: 'LMS', feature: 'ИИ-генерация курсов', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  { category: 'LMS', feature: 'Тесты', sintagma: 'yes', getcourse: 'yes', ispring: 'yes', moodle: 'yes' },
  { category: 'LMS', feature: 'Вебинары', sintagma: 'yes', getcourse: 'yes', ispring: 'partial', moodle: 'partial' },
  { category: 'LMS', feature: 'Домашние задания', sintagma: 'yes', getcourse: 'yes', ispring: 'yes', moodle: 'yes' },
  { category: 'LMS', feature: 'Сертификаты', sintagma: 'yes', getcourse: 'partial', ispring: 'yes', moodle: 'partial' },
  { category: 'LMS', feature: 'Мобильная версия', sintagma: 'yes', getcourse: 'yes', ispring: 'yes', moodle: 'partial' },
  // Документооборот
  { category: 'Документооборот', feature: 'Договоры', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  { category: 'Документооборот', feature: 'Акты', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  { category: 'Документооборот', feature: 'Счета', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  { category: 'Документооборот', feature: 'Протоколы', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  { category: 'Документооборот', feature: 'Приказы', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  // ИИ
  { category: 'ИИ', feature: 'Генерация курсов', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  { category: 'ИИ', feature: 'Генерация тестов', sintagma: 'yes', getcourse: 'no', ispring: 'partial', moodle: 'no' },
  { category: 'ИИ', feature: 'Озвучка (TTS)', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  { category: 'ИИ', feature: 'Генерация обложек', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  // ФИС ФРДО
  { category: 'ФИС ФРДО', feature: 'Выгрузка данных', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  { category: 'ФИС ФРДО', feature: 'Автозаполнение', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  // Интеграции
  { category: 'Интеграции', feature: 'Платёжные системы', sintagma: 'yes', getcourse: 'yes', ispring: 'partial', moodle: 'partial' },
  { category: 'Интеграции', feature: 'Email-рассылки', sintagma: 'yes', getcourse: 'yes', ispring: 'yes', moodle: 'partial' },
  { category: 'Интеграции', feature: 'Видеохостинг (Kinescope)', sintagma: 'yes', getcourse: 'no', ispring: 'no', moodle: 'no' },
  // Тарифы
  { category: 'Тарифы', feature: 'Бесплатный тариф', sintagma: 'yes', getcourse: 'partial', ispring: 'no', moodle: 'yes' },
  { category: 'Тарифы', feature: 'Стартовая цена', sintagma: '990 ₽/мес', getcourse: '4 990 ₽/мес', ispring: '27 000 ₽/год', moodle: 'Бесплатно (self-hosted)' },
  { category: 'Тарифы', feature: 'Макс. учеников', sintagma: 'Без ограничений', getcourse: 'По тарифу', ispring: 'По тарифу', moodle: 'Без ограничений' },
  // Поддержка
  { category: 'Поддержка', feature: 'Техподдержка', sintagma: 'yes', getcourse: 'yes', ispring: 'yes', moodle: 'Сообщество' },
  { category: 'Поддержка', feature: 'Обучение работе', sintagma: 'yes', getcourse: 'partial', ispring: 'yes', moodle: 'no' },
  { category: 'Поддержка', feature: 'Документация', sintagma: 'yes', getcourse: 'yes', ispring: 'yes', moodle: 'yes' },
];

type Competitor = 'getcourse' | 'ispring' | 'moodle';

const competitorLabels: Record<Competitor, string> = {
  getcourse: 'GetCourse',
  ispring: 'iSpring',
  moodle: 'Moodle',
};

function StatusBadge({ value, isUs }: { value: Status; isUs?: boolean }) {
  if (value === 'yes') return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isUs ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>✅ Есть</span>;
  if (value === 'no') return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${!isUs ? 'bg-red-500/15 text-red-600' : 'bg-muted text-muted-foreground'}`}>❌ Нет</span>;
  if (value === 'partial') return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">⚠️ Частично</span>;
  return <span className="text-xs font-medium text-foreground">{value}</span>;
}

export function CompetitorComparison() {
  const [competitor, setCompetitor] = useState<Competitor>('getcourse');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const categories = [...new Set(data.map(r => r.category))];

  const handleCopy = () => {
    const lines = ['Критерий\tСинтагма\t' + competitorLabels[competitor]];
    for (const row of data) {
      const fmt = (v: Status) => v === 'yes' ? '✅' : v === 'no' ? '❌' : v === 'partial' ? '⚠️' : v;
      lines.push(`${row.feature}\t${fmt(row.sintagma)}\t${fmt(row[competitor])}`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    toast({ title: 'Скопировано в буфер обмена' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Сравнить с:</span>
          <Select value={competitor} onValueChange={(v) => setCompetitor(v as Competitor)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="getcourse">GetCourse</SelectItem>
              <SelectItem value="ispring">iSpring</SelectItem>
              <SelectItem value="moodle">Moodle</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Скопировано' : 'Скопировать для КП'}
        </Button>
      </div>

      <ScrollArea className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px] min-w-[140px]">Критерий</TableHead>
              <TableHead className="w-[180px] min-w-[140px] bg-emerald-500/5 font-semibold">Синтагма</TableHead>
              <TableHead className="w-[180px] min-w-[140px]">{competitorLabels[competitor]}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => {
              const rows = data.filter(r => r.category === cat);
              return rows.map((row, i) => (
                <TableRow key={row.feature}>
                  {i === 0 && (
                    <TableCell rowSpan={rows.length} className="font-semibold text-xs text-muted-foreground align-top border-r bg-muted/30">
                      {cat}
                    </TableCell>
                  )}
                  <TableCell className="bg-emerald-500/5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{row.feature}</span>
                      <StatusBadge value={row.sintagma} isUs />
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={row[competitor]} />
                  </TableCell>
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
