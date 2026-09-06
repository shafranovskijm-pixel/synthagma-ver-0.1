import { useSearchParams } from 'react-router-dom';
import type { State, Lesson, DrivingAdapter } from '@/lib/driving-school/types';
import { schoolDateTime, schoolTimeToUtc, rublesToKopecks, safeCsvCell } from '@/lib/driving-school/time';
import './driving-school.css';
import {
  useCallback,
  useEffect,
  useState,
  type SyntheticEvent,
  type ReactNode,
} from 'react';
import {
  Home,
  CalendarDays,
  Users,
  Car,
  BookOpen,
  Wallet,
  Settings,
  CircleHelp,
  Plus,
  ArrowUpRight,
  Clock,
  Check,
  LogOut,
  ArrowLeft,
  Download,
  Printer,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from './sidebar';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import type {
  Row,
  Kind,
  Entry,
  Question,
  WindowSlot,
} from '@/lib/driving-school/types';
type Field = {
  key: string;
  label: string;
  type?: string;
  value?: string;
  options?: { id: string; name: string }[];
  required?: boolean;
  hint?: string;
};
type Modal = {
  title: string;
  description?: string;
  fields: Field[];
  path: string;
  payload?: Record<string, unknown>;
  submit?: string;
  transform?: (x: Record<string, unknown>) => Record<string, unknown>;
};
const labels: Record<string, string> = {
  today: 'Сегодня',
  schedule: 'Расписание',
  students: 'Ученики',
  team: 'Команда и автомобили',
  learning: 'Обучение и выпуск',
  finance: 'Финансы',
  settings: 'Настройки',
  help: 'Помощь',
  documents: 'Документы',
};
const statusLabel: Record<string, string> = {
  booked: 'Запланировано',
  completed: 'Проведено',
  cancelled: 'Отменено',
  no_show: 'Неявка',
};
const hours = (m: number) =>
  `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}`;
const money = (k: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(
    k / 100,
  );
function Brand() {
  return (
    <div className="brand">
      <b>Σ</b>
      <span>
        СИНТАГМА<small>Автошколы</small>
      </span>
    </div>
  );
}
function Choice({
  label,
  options,
  value,
  onChange,
  required = true,
  name,
}: {
  name: string;
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (s: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <select name={name} value={value} onChange={e=>onChange(e.target.value)} required={required} className="choice">
        {!options.some(o=>o.id==='') && <option value="">Выберите…</option>}
        {options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return rows.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j}>{c}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ) : (
    <div className="empty">
      <BookOpen />
      <h3>Здесь пока нет записей</h3>
      <p>Записей по выбранным условиям пока нет.</p>
    </div>
  );
}
function Nav({
  role,
  view,
  go,
}: {
  role: string;
  view: string;
  go: (v: string) => void;
}) {
  const { setOpenMobile } = useSidebar();
  const menu: [string, string, LucideIcon][] =
    role === 'student'
      ? [
          ['today', 'Главная', Home],
          ['schedule', 'Записаться', CalendarDays],
          ['learning', 'Моё обучение', BookOpen],
          ['documents', 'Документы', BookOpen],
        ]
      : role === 'instructor'
        ? [
            ['today', 'Мой день', Home],
            ['schedule', 'Расписание', CalendarDays],
            ['students', 'Мои ученики', Users],
          ]
        : [
            ['today', 'Сегодня', Home],
            ['schedule', 'Расписание', CalendarDays],
            ['students', 'Ученики', Users],
            ['team', 'Команда и автомобили', Car],
            ['learning', 'Обучение и выпуск', BookOpen],
            ['finance', 'Финансы', Wallet],
          ];
  const item = (key: string, name: string, Icon: LucideIcon) => (
    <Button
      key={key}
      variant="ghost"
      className={'nav-item ' + (view === key ? 'active' : '')}
      onClick={() => {
        go(key);
        setOpenMobile(false);
      }}
    >
      <Icon />
      <span>{name}</span>
    </Button>
  );
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Brand />
        <span className="sidebar-label">РАБОЧИЙ КАБИНЕТ</span>
      </SidebarHeader>
      <SidebarContent>
        {menu.map(([k, n, I]) => item(k as string, n as string, I))}
      </SidebarContent>
      <SidebarFooter>
        {role === 'owner' && item('settings', 'Настройки', Settings)}
        {item('help', 'Помощь', CircleHelp)}
        <small className="muted local-note">
          Автошколы · Beta
        </small>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function DrivingApp({adapter,onExit,preview=false}:{adapter:DrivingAdapter;onExit:()=>void;preview?:boolean}) {
  const [params,setParams]=useSearchParams();
  const [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [view, setView] = useState('today'),
    [studentId, setStudentId] = useState(''),
    [modal, setModal] = useState<Modal | null>(null),
    [form, setForm] = useState<Record<string, string>>({}),
    [search, setSearch] = useState(''),
    [day, setDay] = useState(''),
    [answers, setAnswers] = useState<Record<string, number[]>>({}),
    [inviteLink, setInviteLink] = useState('');
  const [accountReceipt,setAccountReceipt]=useState<{login:string|null;isExisting:boolean}|null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const reload = useCallback(async () => { const s=await adapter.load();setData(s);return s; }, [adapter]);
  useEffect(()=>{let active=true;setLoading(true);setData(null);setError('');adapter.load().then(s=>{if(active)setData(s);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[adapter]);
  useEffect(()=>{setView(params.get('view')||'today');setStudentId(params.get('student')||'');},[params]);
  function go(v:string,s=''){setView(v);setStudentId(s);setSearch('');const next=new URLSearchParams();next.set('view',v);if(s)next.set('student',s);setParams(next);}
  function open(m: Modal) {
    setModal(m);
    setForm(Object.fromEntries(m.fields.map((f) => [f.key, f.value || ''])));
    setError('');
  }
  async function act(
    path: string,
    payload: Record<string, unknown>,
    message = 'Сохранено',
  ) {
    if(busy)throw new Error('Предыдущее сохранение ещё выполняется');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if(!data)throw new Error('Данные школы не загружены');
      const out = await adapter.mutate(path,payload,data);
      try {await reload();} catch {setError('Операция подтверждена сервером, но список не обновлён. Нажмите «Обновить данные» перед следующей записью.');}
      setNotice(preview?message+' · только в памяти стенда':message);
      return out;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    try {
      const values = {
        ...modal.payload,
        ...form,
        ...Object.fromEntries(new FormData(e.currentTarget)),
      };
      const result=await act(modal.path, modal.transform ? modal.transform(values) : values);
      if(result.account&&typeof result.account==='object'){const a=result.account as {login?:unknown;isExisting?:unknown};setAccountReceipt({login:typeof a.login==='string'?a.login:null,isExisting:a.isExisting===true});}
      setModal(null);
      setForm({});
    } catch (e) {
      setError((e as Error).message || 'Проверьте заполнение формы');
    }
  }
  if (loading) return <main className="driving-school-root loading"><Brand/><p>{preview?'Загружаем синтетический стенд…':'Загружаем автошколу…'}</p></main>;
  if (!data) return <main className="driving-school-root loading"><Brand/><div role="alert" className="error">{error||'Данные автошколы не загружены'}</div><Button onClick={()=>{setLoading(true);reload().catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Повторить загрузку</Button><Button variant="outline" onClick={onExit}>Вернуться в СИНТАГМУ</Button></main>;
  const state = data;
  const owner = state.user.role === 'owner',
    canCreateStudents = owner && adapter.canCreateStudents===true,
    isStudent = state.user.role === 'student',
    settings = JSON.parse(state.school.settings),
    zone = settings.timezone;
  const localInput=(d:Date)=>schoolDateTime(d,zone);
  const todayDate=()=>schoolDateTime(Date.now(),zone).slice(0,10);
  const date = (n: number) =>
    new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone,
    }).format(n);
  const time = (n: number) =>
    new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone,
    }).format(n);
  const dateKey = (n: number) => schoolDateTime(n,zone).slice(0,10);
  const rows = <K extends Kind>(kind: K): Extract<Row, { kind: K }>[] =>
    state.resources.filter(
      (r): r is Extract<Row, { kind: K }> => r.kind === kind,
    );
  const name = (id: string | null | undefined) =>
    state.resources.find((r) => r.id === id)?.name || '—';
  const pick = <K extends Kind>(kind: K) => rows(kind).filter((r) => r.active);
  const currentStudent = isStudent
    ? rows('student').find(s=>s.id===state.user.resource_id)
    : rows('student').find((s) => s.id === studentId);
  const pending = state.lessons.filter(
    (l) => l.status === 'booked' && l.end < now,
  );
  const todays = state.lessons.filter(
    (l) => dateKey(l.start) === dateKey(now) && l.status !== 'cancelled',
  );
  function resourceForm(kind: Kind) {
    if(kind==='student'&&!canCreateStudents){setError('В первом пилоте новых учеников добавляет владелец организации');return;}
    const fields: Field[] = [
      {
        key: 'name',
        label: kind === 'student' || kind === 'instructor' ? 'ФИО' : 'Название',
      },
    ];
    if (kind === 'program')
      fields.push(
        { key: 'version', label: 'Версия / дата утверждения' },
        {
          key: 'transmission',
          label: 'Трансмиссия',
          options: [
            { id: 'MT', name: 'Механика' },
            { id: 'AT', name: 'Автомат' },
          ],
          value: 'MT',
        },
        {
          key: 'practiceMinutes',
          label: 'План практики в минутах',
          type: 'number',
          hint: 'Укажите по программе школы. Это не универсальная законодательная норма.',
        },
      );
    if (kind === 'car')
      fields.push(
        { key: 'number', label: 'Государственный номер' },
        {
          key: 'transmission',
          label: 'Трансмиссия',
          options: [
            { id: 'MT', name: 'Механика' },
            { id: 'AT', name: 'Автомат' },
          ],
          value: 'MT',
        },
      );
    if (['student', 'group', 'course'].includes(kind))
      fields.push({
        key: 'programId',
        label: 'Программа',
        options: pick('program'),
      });
    if (kind === 'instructor')
      fields.push(
        { key: 'email', label: 'Email для входа существующего аккаунта', type: 'email', hint:'Должен совпасть с подтверждённым email учётной записи. Контактная почта может отличаться от него.' },
        { key: 'carId', label: 'Автомобиль', options: pick('car') },
      );
    if (kind === 'student')
      fields.push(
        {key:'password',label:'Начальный пароль для нового аккаунта СИНТАГМЫ',type:'password',hint:'Не менее 10 символов. У существующего ученика пароль не меняется. Письмо автоматически не отправляется.'},
        { key: 'email', label: 'Контактная почта (не логин)', type: 'email' },
        { key: 'phone', label: 'Телефон', required: false },
        {
          key: 'groupId',
          label: 'Группа (можно позже)',
          required: false,
          options: [{ id: '', name: 'Без группы' }, ...pick('group')],
        },
        {
          key: 'instructorId',
          label: 'Инструктор (можно позже)',
          required: false,
          options: [{ id: '', name: 'Назначить позже' }, ...pick('instructor')],
        },
      );
    open({
      title: (
        {
          student: 'Добавить ученика',
          group: 'Создать группу',
          program: 'Создать программу',
          car: 'Добавить автомобиль',
          instructor: 'Добавить инструктора',
        } as Record<string, string>
      )[kind],
      description:kind==='student'?'Ученик создаётся штатной регистрацией СИНТАГМЫ с проверкой лимита и сразу получает привязку к автошколе. После сохранения будет показан логин для общего входа «По логину». Контактная почта не является логином.':kind==='program'||kind==='car'?'Первый пилот поддерживает категорию B. Для другой категории подключение ещё не подготовлено.':kind==='instructor'?'Создаётся запись инструктора, без новой учётной записи и без глобальной роли организации. Приглашение доступно для действующего общего аккаунта этой организации; новая организация при регистрации не подходит.':undefined,
      fields,
      path: 'resources',
      payload: { kind },
    });
  }
  function book(sid = '', start = '', end = '') {
    const s = rows('student').find(
      (r) => r.id === (sid || state.user.resource_id),
    );
    const i = rows('instructor').find((r) => r.id === s?.data.instructorId);
    open({
      title: 'Записать на вождение',
      description:
        'Время вводится и отображается в часовом поясе автошколы: ' +
        zone,
      fields: [
        {
          key: 'studentId',
          label: 'Ученик',
          options: pick('student'),
          value: s?.id,
        },
        {
          key: 'instructorId',
          label: 'Назначенный инструктор',
          options: pick('instructor'),
          value: i?.id,
        },
        {
          key: 'carId',
          label: 'Автомобиль инструктора',
          options: pick('car'),
          value: i?.data.carId,
        },
        { key: 'start', label: 'Начало', type: 'datetime-local', value: start },
        { key: 'end', label: 'Окончание', type: 'datetime-local', value: end },
      ],
      path: 'lessons',
      transform: (b) => ({
        ...b,
        start: schoolTimeToUtc(String(b.start),zone),
        end: schoolTimeToUtc(String(b.end),zone),
      }),
    });
  }
  function lessonAction(l: Lesson, action: string) {
    if (action === 'reschedule') {
      open({
        title: 'Перенести занятие',
        description:
          'Ученик, инструктор и автомобиль сохранятся. Часовой пояс: '+zone,
        path: 'lesson-action',
        payload: { id: l.id, action },
        fields: [
          {
            key: 'start',
            label: 'Новое начало',
            type: 'datetime-local',
            value: localInput(new Date(l.start)),
          },
          {
            key: 'end',
            label: 'Новое окончание',
            type: 'datetime-local',
            value: localInput(new Date(l.end)),
          },
        ],
        transform: (b) => ({
          ...b,
          start: schoolTimeToUtc(String(b.start),zone),
          end: schoolTimeToUtc(String(b.end),zone),
        }),
      });
      return;
    }
    open({
      title:
        action === 'cancel'
          ? 'Отменить занятие'
          : action === 'no_show'
            ? 'Зафиксировать неявку'
            : action === 'correct'
              ? 'Исправить факт занятия'
              : 'Подтвердить проведённое занятие',
      description:
        'Часы учитываются только по подтверждённому факту. Действие сохраняется в истории.',
      path: 'lesson-action',
      payload: { id: l.id, action },
      fields:
        action === 'complete' || action === 'correct'
          ? [
              {
                key: 'actualMinutes',
                label: 'Фактически проведено, минут',
                type: 'number',
                value: String(l.actual_minutes || (l.end - l.start) / 60000),
              },
              { key: 'topic', label: 'Тема занятия', value: l.topic },
              {
                key: 'reason',
                label:
                  action === 'correct' ? 'Причина исправления' : 'Комментарий',
                required: action === 'correct',
              },
            ]
          : [{ key: 'reason', label: 'Причина' }],
      submit: action === 'cancel' ? 'Отменить занятие' : 'Сохранить факт',
    });
  }
  function lessonList(lessons: Lesson[]) {
    return lessons.length ? (
      <div className="lesson-list">
        {lessons.map((l) => (
          <article key={l.id} className="lesson-row">
            <div className="lesson-time">
              <strong>{time(l.start)}</strong>
              <small>{date(l.start).split(',')[0]}</small>
            </div>
            <div className="lesson-body">
              <h3>{name(l.student_id)}</h3>
              <p>
                {name(l.instructor_id)} · {name(l.car_id)}
              </p>
              <small>
                {time(l.start)}–{time(l.end)} ·{' '}
                {hours((l.end - l.start) / 60000)}
                {l.topic ? ' · ' + l.topic : ''}
              </small>
            </div>
            <div className="lesson-status">
              <span className={'status ' + l.status}>
                {statusLabel[l.status]}
              </span>
              {l.status === 'completed' && (
                <small>В зачёт: {hours(l.actual_minutes)}</small>
              )}
              <div className="actions">
                {l.status === 'booked' &&
                  ((owner || !isStudent) && l.end < now ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => lessonAction(l, 'complete')}
                      >
                        Проведено
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => lessonAction(l, 'no_show')}
                      >
                        Неявка
                      </Button>
                    </>
                  ) : null)}
                {l.status === 'booked' && (owner || isStudent) && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => lessonAction(l, 'reschedule')}
                    >
                      Перенести
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => lessonAction(l, 'cancel')}
                    >
                      Отменить
                    </Button>
                  </>
                )}
                {l.status === 'completed' && owner && (
                  <Button
                    variant="ghost"
                    onClick={() => lessonAction(l, 'correct')}
                  >
                    Исправить
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="empty">
        <CalendarDays />
        <h3>Занятий пока нет</h3>
        <p>Добавьте рабочую смену и запишите ученика на удобное время.</p>
      </div>
    );
  }
  function financial(sid?: string) {
    const entries = state.entries.filter(
      (e): e is Extract<Entry, { kind: 'charge' | 'payment' }> =>
        ['charge', 'payment'].includes(e.kind) &&
        (!sid || e.student_id === sid),
    );
    const charges = entries
        .filter((e) => e.kind === 'charge' && !e.reversal)
        .reduce((n, e) => n + e.data.kopecks, 0),
      paid = entries
        .filter((e) => e.kind === 'payment' && !e.reversal)
        .reduce((n, e) => n + e.data.kopecks, 0);
    return (
      <>
        <div className="stat-grid three">
          <div className="stat">
            <span>Начислено</span>
            <strong>{money(charges)}</strong>
          </div>
          <div className="stat">
            <span>Внесено вручную</span>
            <strong>{money(paid)}</strong>
          </div>
          <div className="stat">
            <span>{charges >= paid ? 'Остаток к оплате' : 'Аванс'}</span>
            <strong>{money(Math.abs(charges - paid))}</strong>
          </div>
        </div>
        <div className="callout">
          Ручной учёт. Запись платежа не означает подтверждение банка или выдачу
          кассового чека.
        </div>
        {owner && (
          <div className="actions">
            <Button onClick={() => entry('charge', sid)}>Начислить</Button>
            <Button variant="outline" onClick={() => entry('payment', sid)}>
              Записать оплату
            </Button>
          </div>
        )}
        <DataTable
          columns={[
            'Дата',
            'Ученик',
            'Операция',
            'Сумма',
            'Основание',
            'Исправление',
          ]}
          rows={entries.map((e) => [
            e.data.date,
            name(e.student_id),
            e.kind === 'charge' ? 'Начисление' : 'Оплата',
            money(e.data.kopecks),
            e.data.note,
            e.reversal ? (
              'Аннулировано: ' + e.reversal.reason
            ) : owner ? (
              <Button
                key={e.id}
                variant="outline"
                onClick={() =>
                  open({
                    title: 'Аннулировать ошибочную запись',
                    description:
                      'Оригинал сохранится в истории, сумма исключится из баланса. Для новой суммы добавьте новую запись.',
                    path: 'reverse-entry',
                    payload: { id: e.id },
                    fields: [{ key: 'reason', label: 'Причина исправления' }],
                  })
                }
              >
                Исправить
              </Button>
            ) : (
              '—'
            ),
          ])}
        />
      </>
    );
  }
  function entry(kind: string, sid?: string) {
    open({
      title:
        kind === 'exam'
          ? 'Записать результат экзамена'
          : kind === 'charge'
            ? 'Начислить стоимость обучения'
            : 'Записать оплату',
      path: 'entries',
      payload: { kind, operationId: crypto.randomUUID() },
      fields: [
        {
          key: 'studentId',
          label: 'Ученик',
          options: pick('student'),
          value: sid || '',
        },
        { key: 'date', label: 'Дата', type: 'date', value: todayDate() },
        ...(kind === 'exam'
          ? [
              {
                key: 'examType',
                label: 'Экзамен',
                options: [
                  { id: 'internal', name: 'Внутренний' },
                  {
                    id: 'external',
                    name: 'Госавтоинспекция (только ручной учёт)',
                  },
                ],
                value: 'internal',
              },
              {
                key: 'result',
                label: 'Результат',
                options: [
                  { id: 'passed', name: 'Сдан' },
                  { id: 'failed', name: 'Не сдан' },
                ],
              },
              { key: 'protocol', label: 'Номер протокола' },
            ]
          : [{ key: 'amount', label: 'Сумма, ₽', type: 'number' }]),
        {
          key: 'note',
          label: 'Основание / комментарий',
          required: kind !== 'exam',
        },
      ],
      transform: (b) => ({
        ...b,
        ...(kind !== 'exam'
          ? { kopecks: rublesToKopecks(b.amount) }
          : {}),
      }),
    });
  }
  function exportCsv(sid?: string) {
    const records = state.lessons.filter((l) => !sid || l.student_id === sid);
    const cells = [
      ['ФИО', 'Email', 'Программа', 'Начало', 'Статус', 'Факт минут', 'Тема'],
      ...records.map((l) => {
        const s = rows('student').find((r) => r.id === l.student_id);
        return [
          name(l.student_id),
          s?.data.email || '',
          name(s?.data.programId),
          date(l.start),
          statusLabel[l.status],
          l.actual_minutes,
          l.topic,
        ];
      }),
    ];
    download(
      'zhurnal-praktiki.csv',
      '\uFEFF' +
        cells
          .map((r) =>
            r
              .map(safeCsvCell)
              .join(';'),
          )
          .join('\r\n'),
      'text/csv;charset=utf-8',
    );
  }
  function download(filename: string, content: string, type: string) {
    const u = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = u;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function documents(s: Row<'student'>) {
    const ls = state.lessons.filter((l) => l.student_id === s.id);
    return (
      <>
        <div className="callout">
          Черновые формы для проверки интерфейса. Оригинальные шаблоны вашей
          автошколы ещё не подключены. Автоматической отправки в государственные
          системы нет.
        </div>
        <div className="actions no-print">
          <Button onClick={() => window.print()}>
            <Printer />
            Печать журнала и результатов
          </Button>
          <Button variant="outline" onClick={() => exportCsv(s.id)}>
            <Download />
            Журнал CSV
          </Button>
        </div>
        <section className="print-document">
          <span className="tag">ЧЕРНОВИК · НЕ УТВЕРЖДЁН</span>
          <h2>{state.school.name}</h2>
          <h3>Журнал практического обучения</h3>
          <p>
            Ученик: {s.name}
            <br />
            Программа: {name(s.data.programId)}
          </p>
          <DataTable
            columns={['Дата', 'Инструктор', 'Тема', 'Статус', 'Факт, мин']}
            rows={ls.map((l) => [
              date(l.start),
              name(l.instructor_id),
              l.topic || '—',
              statusLabel[l.status],
              l.actual_minutes,
            ])}
          />
          <h3>Результаты аттестаций</h3>
          <DataTable
            columns={['Дата', 'Экзамен', 'Протокол', 'Результат']}
            rows={state.entries
              .filter(
                (e): e is Extract<Entry, { kind: 'exam' }> =>
                  e.student_id === s.id && e.kind === 'exam',
              )
              .map((e) => [
                e.data.date,
                e.data.examType === 'internal'
                  ? 'Внутренний'
                  : 'Госавтоинспекция',
                e.data.protocol,
                e.data.result === 'passed' ? 'Сдан' : 'Не сдан',
              ])}
          />
          <p className="signature">
            Ответственный ____________________ / ____________________
          </p>
        </section>
      </>
    );
  }
  function theory(s?: Row<'student'>) {
    const courses = rows('course').filter(
      (c) => !s || c.data.programId === s.data.programId,
    );
    return (
      <div className="stack">
        {owner && (
          <Button
            className="fit"
            onClick={() =>
              open({
                title: 'Добавить теоретический урок и тест',
                description:
                  'Материалы вашей школы. Тестовый движок не содержит официальных билетов ПДД.',
                path: 'resources',
                payload: { kind: 'course', passPercent: 100 },
                fields: [
                  { key: 'name', label: 'Название урока' },
                  {
                    key: 'programId',
                    label: 'Программа',
                    options: pick('program'),
                  },
                  {
                    key: 'material',
                    label: 'Учебный материал',
                    type: 'textarea',
                  },
                  { key: 'question', label: 'Контрольный вопрос' },
                  { key: 'a', label: 'Вариант 1' },
                  { key: 'b', label: 'Вариант 2' },
                  { key: 'c', label: 'Вариант 3' },
                  {
                    key: 'correct',
                    label: 'Верный ответ',
                    options: [
                      { id: '0', name: 'Вариант 1' },
                      { id: '1', name: 'Вариант 2' },
                      { id: '2', name: 'Вариант 3' },
                    ],
                  },
                ],
                transform: (b) => ({
                  ...b,
                  questions: [
                    {
                      text: b.question,
                      options: [b.a, b.b, b.c],
                      correct: Number(b.correct),
                    },
                  ],
                }),
              })
            }
          >
            <Plus />
            Добавить урок и тест
          </Button>
        )}
        {!courses.length && (
          <div className="empty">
            <BookOpen />
            <h3>Материалы ещё не добавлены</h3>
            <p>
              Администратор может создать урок и контрольный тест для программы.
            </p>
          </div>
        )}
        {courses.map((c) => (
          <article className="panel" key={c.id}>
            <span className="tag">{name(c.data.programId)}</span>
            <h3>{c.name}</h3>
            <p className="material">{c.data.material}</p>
            {isStudent && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const r = await act('attempts', {
                      courseId: c.id,
                      answers: answers[c.id] || [],
                    });
                    setNotice(
                      `Результат: ${Number(r.score)}%. ${r.passed ? 'Тест сдан' : 'Повторите материал'}`,
                    );
                  } catch {}
                }}
              >
                {c.data.questions.map((q: Question, i: number) => (
                  <fieldset key={i}>
                    <legend>
                      {i + 1}. {q.text}
                    </legend>
                    {q.options.map((o: string, j: number) => (
                      <label className="radio" key={j}>
                        <input
                          type="radio"
                          name={c.id + i}
                          required
                          checked={answers[c.id]?.[i] === j}
                          onChange={() =>
                            setAnswers((a) => {
                              const v = [...(a[c.id] || [])];
                              v[i] = j;
                              return { ...a, [c.id]: v };
                            })
                          }
                        />
                        {o}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <Button type="submit" disabled={busy}>
                  Проверить ответы
                </Button>
              </form>
            )}
            <DataTable
              columns={['Ученик', 'Попытка', 'Результат']}
              rows={state.entries
                .filter(
                  (e): e is Extract<Entry, { kind: 'attempt' }> =>
                    e.kind === 'attempt' &&
                    e.data.courseId === c.id &&
                    (!s || e.student_id === s.id),
                )
                .map((e) => [
                  name(e.student_id),
                  date(e.created),
                  `${e.data.score}% · ${e.data.passed ? 'Сдан' : 'Не сдан'}`,
                ])}
            />
          </article>
        ))}
      </div>
    );
  }
  function balance(s: Row<'student'>) {
    const b = state.balances.find((x) => x.id === s.id)!;
    return (
      <div className="stat-grid three">
        <div className="stat">
          <span>Предусмотрено</span>
          <strong>{hours(b.planned)}</strong>
          <small>По выбранной программе</small>
        </div>
        <div className="stat">
          <span>Забронировано</span>
          <strong>{hours(b.reserved)}</strong>
          <small>Ещё не засчитано в обучение</small>
        </div>
        <div className="stat mint">
          <span>Проведено</span>
          <strong>{hours(b.completed)}</strong>
          <small>
            Свободно для записи: {hours(b.planned - b.completed - b.reserved)}
          </small>
        </div>
      </div>
    );
  }
  const layoutTitle = isStudent
    ? (
        {
          today: 'Мой учебный день',
          schedule: 'Записаться на вождение',
          learning: 'Моё обучение',
          documents: 'Мои документы',
        } as Record<string, string>
      )[view] || labels[view]
    : currentStudent
      ? currentStudent.name
      : view === 'today'
        ? 'Рабочий день автошколы'
        : labels[view] || 'Сегодня';
  let content: ReactNode;
  if (currentStudent && view === 'students') {
    const s = currentStudent;
    content = (
      <>
        <Button
          className="fit no-print"
          variant="ghost"
          onClick={() => go('students')}
        >
          <ArrowLeft />
          Все ученики
        </Button>
        {balance(s)}
        <Tabs defaultValue="overview">
          <TabsList className="student-tabs no-print">
            {[
              ['overview', 'Обзор'],
              ['lessons', 'Занятия'],
              ['theory', 'Теория и тесты'],
              ['payments', 'Оплаты'],
              ['docs', 'Документы'],
            ]
              .filter(([k]) => owner || k !== 'payments')
              .map(([v, n]) => (
                <TabsTrigger key={v} value={v}>
                  {n}
                </TabsTrigger>
              ))}
          </TabsList>
          <TabsContent value="overview">
            <div className="panel stack">
              <h3>Карточка ученика</h3>
              <p>
                {s.data.email} · {s.data.phone || 'Телефон не указан'}
              </p>
              <p>
                Группа: {name(s.data.groupId)}
                <br />
                Программа: {name(s.data.programId)}
                <br />
                Инструктор: {name(s.data.instructorId)}
              </p>
              {owner && (
                <div className="actions">
                  <Button onClick={() => book(s.id)}>
                    Записать на вождение
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      open({
                        title: 'Назначение ученика',
                        path: 'assign-student',
                        payload: { id: s.id },
                        fields: [
                          {
                            key: 'instructorId',
                            label: 'Инструктор',
                            options: pick('instructor'),
                            value: s.data.instructorId || '',
                          },
                          {
                            key: 'groupId',
                            label: 'Группа',
                            options: pick('group'),
                            required: false,
                            value: s.data.groupId || '',
                          },
                        ],
                      })
                    }
                  >
                    Группа и инструктор
                  </Button>
                  <p className="muted">Доступ ученика связан при добавлении. Используйте общий вход СИНТАГМЫ; отдельное приглашение не требуется.</p>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="lessons">
            {lessonList(state.lessons.filter((l) => l.student_id === s.id))}
          </TabsContent>
          <TabsContent value="theory">{theory(s)}</TabsContent>
          <TabsContent value="payments">{financial(s.id)}</TabsContent>
          <TabsContent value="docs">{documents(s)}</TabsContent>
        </Tabs>
      </>
    );
  } else if (view === 'today') {
    content = (
      <>
        {owner && state.resources.length === 0 && (
          <section className="onboarding panel">
            <span className="tag">ПЕРВЫЙ ЗАПУСК</span>
            <h2>Настроим вашу автошколу</h2>
            <p>
              Начните с программы обучения, автомобиля и инструктора. Затем
              добавьте ученика и рабочую смену.
            </p>
            <div className="actions">
              <Button onClick={() => resourceForm('program')}>
                1. Создать программу
              </Button>
            </div>
          </section>
        )}
        {isStudent && rows('student').find(s=>s.id===state.user.resource_id) && balance(rows('student').find(s=>s.id===state.user.resource_id))}
        {!isStudent && (
          <div className="stat-grid">
            <div className="stat">
              <CalendarDays />
              <span>Занятий сегодня</span>
              <strong>{todays.length}</strong>
            </div>
            <div className="stat">
              <Users />
              <span>Активных учеников</span>
              <strong>{pick('student').length}</strong>
            </div>
            <div className="stat">
              <Clock />
              <span>Ждут подтверждения</span>
              <strong>{pending.length}</strong>
            </div>
            <div className="stat mint">
              <Check />
              <span>Проведено занятий</span>
              <strong>
                {state.lessons.filter((l) => l.status === 'completed').length}
              </strong>
            </div>
          </div>
        )}
        <div className="dashboard-grid">
          <section className="panel">
            <div className="section-heading">
              <h2>
                {isStudent ? 'Ближайшие занятия' : 'Расписание на сегодня'}
              </h2>
              <Button variant="ghost" onClick={() => go('schedule')}>
                Всё расписание <ArrowUpRight />
              </Button>
            </div>
            {lessonList(
              isStudent
                ? state.lessons
                    .filter((l) => l.status === 'booked' && l.start > now)
                    .slice(0, 5)
                : todays,
            )}
          </section>
          <aside className="panel tasks">
            <span className="eyebrow">СЛЕДУЮЩИЙ ШАГ</span>
            <h2>Всё под контролем</h2>
            {pending.length > 0 && (
              <div className="task">
                <Clock />
                <div>
                  <strong>{isStudent?'Ожидает подтверждения инструктором':'Ожидают подтверждения'}: {pending.length}</strong>
                  <p>{isStudent?'Инструктор внесёт фактические минуты после занятия.':'Укажите факт, чтобы часы попали в журнал.'}</p>
                  <Button
                    variant="link"
                    onClick={() => {
                      go('schedule');
                      setDay('pending');
                    }}
                  >
                    Открыть занятия
                  </Button>
                </div>
              </div>
            )}
            {owner && (
              <>
                <div className="task">
                  <Users />
                  <div>
                    <strong>Сначала — ученики и программа</strong>
                    <p>
                      Карточка объединяет практику, теорию, оплаты и документы.
                    </p>
                    <Button variant="link" onClick={() => go('students')}>
                      Открыть учеников
                    </Button>
                  </div>
                </div>
                <div className="task">
                  <Car />
                  <div>
                    <strong>Проверьте рабочие смены</strong>
                    <p>Без смены самостоятельная запись закрыта.</p>
                    <Button variant="link" onClick={() => go('team')}>
                      Команда и автомобили
                    </Button>
                  </div>
                </div>
              </>
            )}
            {isStudent && (
              <>
                <p>В зачёт идут только проведённые и подтверждённые занятия.</p>
                <Button onClick={() => go('schedule')}>
                  Выбрать время вождения
                </Button>
              </>
            )}
            <div className="callout">Часовой пояс расписания: {zone}</div>
          </aside>
        </div>
      </>
    );
  } else if (view === 'schedule') {
    let slots: {
      start: number;
      end: number;
      instructorId: string;
      carId: string;
    }[] = [];
    if (isStudent) {
      const s = rows('student').find(s=>s.id===state.user.resource_id),
        i = rows('instructor').find((r) => r.id === s?.data.instructorId);
      if (i && i.active && s?.active)
        for (const w of i.data.windows || [])
          for (
            let a = Date.parse(w.start);
            a + 3600000 <= Date.parse(w.end);
            a += 3600000
          ) {
            if (
              a > now &&
              a < now + (settings.horizonDays || 30) * 86400000 &&
              !state.busy.some((b) => a < b.end && b.start < a + 3600000)
            )
              slots.push({
                start: a,
                end: a + 3600000,
                instructorId: i.id,
                carId: i.data.carId,
              });
          }
      slots = slots
        .filter((s) => !day || dateKey(s.start) === day)
        .slice(0, 40);
    }
    content = (
      <>
        <div className="toolbar">
          <label htmlFor="date-filter">
            Период
            <Input
              id="date-filter"
              type="date"
              value={day === 'pending' ? '' : day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <Button variant="outline" onClick={() => setDay('')}>
            Все даты
          </Button>
          {!isStudent && (
            <Button variant="outline" onClick={() => setDay('pending')}>
              Ждут подтверждения ({pending.length})
            </Button>
          )}
          {owner && (
            <Button onClick={() => book()}>
              <Plus />
              Записать на вождение
            </Button>
          )}
        </div>
        {isStudent && (
          <section className="panel">
            <h2>Свободные окна</h2>
            <p>
              Занятия по 60 минут · Отмена не позже чем за{' '}
              {settings.cancelHours} ч · {zone}
            </p>
            <div className="slots">
              {slots
                .filter((s) => !day || dateKey(s.start) === day)
                .map((s) => (
                  <Button
                    variant="outline"
                    key={s.start}
                    onClick={() =>
                      book(
                        state.user.resource_id,
                        localInput(new Date(s.start)),
                        localInput(new Date(s.end)),
                      )
                    }
                  >
                    {date(s.start)} <Plus />
                  </Button>
                ))}
            </div>
            {!slots.length && (
              <p>
                Свободных окон нет. Попросите администратора назначить
                инструктора и добавить смену.
              </p>
            )}
          </section>
        )}
        <section className="panel">
          <h2>{day === 'pending' ? 'Ожидают подтверждения' : 'Занятия'}</h2>
          {lessonList(
            state.lessons.filter((l) =>
              day === 'pending'
                ? l.status === 'booked' && l.end < now
                : !day || dateKey(l.start) === day,
            ),
          )}
        </section>
      </>
    );
  } else if (view === 'students') {
    content = (
      <>
        <div className="toolbar">
          <Input
            aria-label="Поиск ученика"
            placeholder="Поиск по имени или почте…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {owner && (
            <>
              <Button disabled={!canCreateStudents} title={!canCreateStudents?'Доступно владельцу организации':undefined} onClick={() => resourceForm('student')}>
                <Plus />
                Добавить ученика
              </Button>
              <Button variant="outline" onClick={() => resourceForm('group')}>
                Создать группу
              </Button>
            </>
          )}
        </div>
        {owner&&!canCreateStudents&&<div className="callout">В первом пилоте новых учеников добавляет владелец организации.</div>}
        <section className="panel">
          <DataTable
            columns={['Ученик', 'Группа', 'Практика', 'Инструктор', '']}
            rows={rows('student')
              .filter((s) =>
                (s.name + ' ' + s.data.email)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((s) => {
                const b = state.balances.find((x) => x.id === s.id)!;
                return [
                  <>
                    <strong>{s.name}</strong>
                    <small className="block muted">{s.data.email}</small>
                  </>,
                  name(s.data.groupId),
                  `${hours(b.completed)} / ${hours(b.planned)}`,
                  name(s.data.instructorId),
                  <Button
                    key={s.id}
                    variant="outline"
                    onClick={() => go('students', s.id)}
                  >
                    Открыть <ArrowUpRight />
                  </Button>,
                ];
              })}
          />
        </section>
        <section className="panel">
          <h2>Группы</h2>
          <DataTable
            columns={['Группа', 'Программа', 'Учеников']}
            rows={rows('group').map((g) => [
              g.name,
              name(g.data.programId),
              rows('student').filter((s) => s.data.groupId === g.id).length,
            ])}
          />
        </section>
      </>
    );
  } else if (view === 'team' && owner) {
    content = (
      <>
        <div className="actions">
          <Button onClick={() => resourceForm('instructor')}>
            <Plus />
            Инструктор
          </Button>
          <Button variant="outline" onClick={() => resourceForm('car')}>
            <Plus />
            Автомобиль
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              open({
                title: 'Добавить рабочую смену',
                description:
                  'Время вводится по часовому поясу автошколы: '+zone+'. Ученики смогут выбрать свободные окна внутри смены.',
                path: 'shifts',
                fields: [
                  {
                    key: 'instructorId',
                    label: 'Инструктор',
                    options: pick('instructor'),
                  },
                  { key: 'start', label: 'Начало', type: 'datetime-local' },
                  { key: 'end', label: 'Конец', type: 'datetime-local' },
                ],
                transform: (b) => ({
                  ...b,
                  start: schoolTimeToUtc(String(b.start),zone),
                  end: schoolTimeToUtc(String(b.end),zone),
                }),
              })
            }
          >
            Рабочая смена
          </Button>
        </div>
        <section className="panel">
          <h2>Инструкторы</h2>
          <DataTable
            columns={['Инструктор', 'Автомобиль', 'Смены', 'Доступ', 'Кабинет']}
            rows={rows('instructor').map((i) => [
              <>
                {i.name}
                <small className="block muted">{i.data.email}</small>
              </>,
              name(i.data.carId),
              <details key={i.id + '-shifts'}>
                <summary>{i.data.windows.length} смен · показать</summary>
                {i.data.windows.map((w: WindowSlot) => (
                  <p key={w.id}>
                    {date(Date.parse(w.start))}–{time(Date.parse(w.end))}
                  </p>
                ))}
              </details>,
              <Button
                key={i.id + '-availability'}
                variant="outline"
                onClick={() =>
                  open({
                    title: i.active
                      ? 'Приостановить запись'
                      : 'Возобновить запись',
                    description:
                      'Существующие занятия сохранятся. При отпуске / ремонте перенесите их отдельно.',
                    path: 'resource-status',
                    payload: { id: i.id, active: !i.active },
                    fields: [{ key: 'reason', label: 'Причина' }],
                  })
                }
              >
                {i.active ? 'Доступен' : 'Пауза'}
              </Button>,
              <Button
                key={i.id + '-invite'}
                variant="outline"
                onClick={async () => {
                  try {
                    const r = await act(
                      'invites',
                      { resourceId: i.id },
                      'Приглашение создано',
                    );
                    setInviteLink(typeof r.url === 'string' ? r.url : '');
                  } catch {}
                }}
              >
                Пригласить
              </Button>,
            ])}
          />
        </section>
        <section className="panel">
          <h2>Автомобили</h2>
          <DataTable
            columns={['Автомобиль', 'Госномер', 'Коробка', 'Доступ']}
            rows={rows('car').map((c) => [
              c.name,
              c.data.number,
              c.data.transmission === 'MT' ? 'Механика' : 'Автомат',
              <Button
                key={c.id}
                variant="outline"
                onClick={() =>
                  open({
                    title: c.active
                      ? 'Автомобиль недоступен'
                      : 'Вернуть автомобиль',
                    path: 'resource-status',
                    payload: { id: c.id, active: !c.active },
                    fields: [{ key: 'reason', label: 'Причина' }],
                  })
                }
              >
                {c.active ? 'Доступен' : 'Ремонт / пауза'}
              </Button>,
            ])}
          />
        </section>
      </>
    );
  } else if (view === 'learning') {
    content = (
      <>
        {owner && (
          <section className="panel">
            <div className="section-heading">
              <h2>Программы обучения</h2>
              <Button variant="outline" onClick={() => resourceForm('program')}>
                Добавить программу
              </Button>
            </div>
            <DataTable
              columns={['Программа', 'Версия', 'Практика', 'Коробка']}
              rows={rows('program').map((p) => [
                p.name,
                p.data.version,
                hours(p.data.practiceMinutes),
                p.data.transmission,
              ])}
            />
          </section>
        )}
        {theory(currentStudent)}
        {owner && (
          <section className="panel">
            <div className="section-heading">
              <h2>Готовность к выпуску</h2>
              <Button onClick={() => entry('exam')}>Результат экзамена</Button>
            </div>
            <p className="muted">
              Подсказка по данным, не автоматическое решение о выпуске. Внешний
              экзамен фиксируется отдельно.
            </p>
            <DataTable
              columns={[
                'Ученик',
                'Практика',
                'Теоретические тесты',
                'Внутренний экзамен',
                'Карточка',
              ]}
              rows={rows('student').map((s) => {
                const b = state.balances.find((x) => x.id === s.id)!;
                const courses = rows('course').filter(
                  (c) => c.data.programId === s.data.programId,
                );
                const tests =
                  courses.length > 0 &&
                  courses.every((c) =>
                    state.entries.some(
                      (e) =>
                        e.kind === 'attempt' &&
                        e.student_id === s.id &&
                        e.data.courseId === c.id &&
                        e.data.passed,
                    ),
                  );
                const exam = state.entries.find(
                  (e): e is Extract<Entry, { kind: 'exam' }> =>
                    e.kind === 'exam' &&
                    e.student_id === s.id &&
                    e.data.examType === 'internal',
                );
                return [
                  s.name,
                  b.completed >= b.planned
                    ? 'Выполнена'
                    : `${hours(b.completed)} / ${hours(b.planned)}`,
                  tests
                    ? 'Сданы'
                    : courses.length
                      ? 'Не все сданы'
                      : 'Не назначены',
                  exam
                    ? exam.data.result === 'passed'
                      ? 'Сдан'
                      : 'Не сдан'
                    : 'Не внесён',
                  <Button
                    key={s.id}
                    variant="outline"
                    onClick={() => go('students', s.id)}
                  >
                    Открыть
                  </Button>,
                ];
              })}
            />
          </section>
        )}
      </>
    );
  } else if (view === 'finance' && owner) {
    content = <section className="panel stack">{financial()}</section>;
  } else if (view === 'documents' && isStudent && currentStudent) {
    content = documents(currentStudent);
  } else if (view === 'settings' && owner) {
    content = (
      <>
        <section className="panel stack">
          <h2>Правила автошколы</h2>
          <p>
            {state.school.name} · Горизонт записи: {settings.horizonDays} дней ·
            Отмена за {settings.cancelHours} ч · {zone}
          </p>
          <Button
            className="fit"
            onClick={() =>
              open({
                title: 'Настройки автошколы',
                path: 'settings',
                fields: [
                  { key: 'name', label: 'Название', value: state.school.name },
                  {
                    key: 'horizonDays',
                    label: 'Запись вперёд, дней',
                    type: 'number',
                    value: String(settings.horizonDays),
                  },
                  {
                    key: 'cancelHours',
                    label: 'Самостоятельная отмена за N часов',
                    type: 'number',
                    value: String(settings.cancelHours),
                  },
                  {
                    key: 'timezone',
                    label: 'Часовой пояс IANA',
                    value: zone,
                    hint: 'Например: Europe/Moscow, Asia/Vladivostok',
                  },
                ],
              })
            }
          >
            Изменить правила
          </Button>
          <div className="callout">
            Программы версионные: создавайте новую версию для нового набора.
            Старые назначения и фактические часы не переписываются.
          </div>
        </section>
        <section className="panel">
          <h2>История действий</h2>
          <DataTable
            columns={['Время', 'Действие', 'Запись']}
            rows={state.audit.map((a) => [
              date(a.created),
              a.action,
              a.target.slice(0, 8),
            ])}
          />
        </section>
      </>
    );
  } else {
    content = (
      <section className="panel help">
        <span className="tag">РУКОВОДСТВО ПО ПИЛОТУ</span>
        <h2>Первое занятие — за шесть шагов</h2>
        <ol>
          <li>
            «Обучение и выпуск» → создайте программу, версию и план практики по
            документам вашей школы.
          </li>
          <li>
            «Команда и автомобили» → автомобиль, инструктор и рабочая смена.
          </li>
          <li>
            «Ученики» → добавьте ученика, выберите программу, группу и
            инструктора.
          </li>
          <li>
            После добавления ученика сохраните показанный логин. Он входит через общий вход «По логину»; приглашение ему не требуется. Для инструктора приглашение действует 72 часа и требует существующего аккаунта этой организации с подтверждённым email для входа. Контактная почта может отличаться от него.
          </li>
          <li>
            Запишите ученика на вождение. После окончания инструктор
            подтверждает факт; бронирование само по себе не засчитывает часы.
          </li>
          <li>
            В карточке смотрите занятия, результаты, оплаты и черновик журнала.
            Материалы и тесты добавляются в «Обучение и выпуск».
          </li>
        </ol>
        <h3>Что важно знать</h3>
        <p>
          Вход выполняется общей учётной записью СИНТАГМЫ.
          Часы в интерфейсе — астрономические (60 минут); план вводится в
          минутах по программе школы. Нет автоматических писем, СМС, банка или
          отправки в Госавтоинспекцию. Документы — черновики до подключения
          оригиналов школы.
        </p>
        <p>
          Пилот находится на проверке. Связь с курсами основной LMS и утверждённые формы документов ещё не подключены.
        </p>
      </section>
    );
  }
  return (
    <SidebarProvider>
      <Nav role={state.user.role} view={view} go={go} />
      <SidebarInset className="workspace">
        <header className="topbar no-print">
          <div className="actions">
            <SidebarTrigger aria-label="Открыть меню" />
            <strong>{state.school.name}</strong>
          </div>
          <div className="actions">
            <span className="tag">
              {owner ? 'Администратор' : isStudent ? 'Ученик' : 'Инструктор'}
            </span>
            <Button
              variant="ghost"
              aria-label="Обновить данные"
              onClick={() => {
                void reload().catch((e) => setError(e.message));
              }}
            >
              <RefreshCw />
            </Button>
            <Button
              variant="ghost"
              aria-label="Вернуться в СИНТАГМУ"
              onClick={onExit}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="page-content">
          {preview&&<div role="status" className="callout no-print">ЛОКАЛЬНЫЙ СТЕНД · Все имена и записи вымышлены. Данные только в памяти, обновление страницы сбрасывает изменения. Облачные запросы отсутствуют.</div>}
          <div className="page-heading no-print">
            <div>
              <span className="eyebrow">
                {owner ? 'АВТОШКОЛА' : state.user.name}
              </span>
              <h1>{layoutTitle}</h1>
              <p className="muted">
                {view === 'today'
                  ? 'Расписание, ученики и результаты — в одном рабочем дне.'
                  : preview?'Синтетические данные только в памяти стенда.':'Изменения сохраняются в общей СИНТАГМЕ после ответа сервера.'}
              </p>
            </div>
            {owner && view === 'today' && (
              <div className="actions">
                <Button
                  variant="outline"
                  disabled={!canCreateStudents}
                  title={!canCreateStudents?'Доступно владельцу организации':undefined}
                  onClick={() => resourceForm('student')}
                >
                  <Plus />
                  Добавить ученика
                </Button>
                <Button onClick={() => book()}>
                  <CalendarDays />
                  Записать на вождение
                </Button>
              </div>
            )}
          </div>
          {error && !modal && (
            <div role="alert" className="error no-print">
              {error}
            </div>
          )}
          {notice && (
            <output className="success no-print">
              {notice}
              <Button
                variant="ghost"
                aria-label="Закрыть уведомление"
                onClick={() => setNotice('')}
              >
                ×
              </Button>
            </output>
          )}
          {content}
          <footer className="page-footer no-print">
            СИНТАГМА Автошколы · Beta · Часовой пояс: {zone}
          </footer>
        </main>
      </SidebarInset>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!v && !busy) {setModal(null);setForm({});}
        }}
      >
        <DialogContent className="driving-school-root edit-dialog">
          <DialogHeader>
            <DialogTitle>{modal?.title}</DialogTitle>
            <DialogDescription>
              {modal?.description ||
                'Заполните поля. Успех появится только после подтверждения операции.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <form onSubmit={submit}>
            {modal?.fields.map((f) =>
              f.options ? (
                <Choice
                  key={f.key}
                  name={f.key}
                  label={f.label}
                  options={f.options}
                  value={form[f.key] || ''}
                  required={f.required !== false}
                  onChange={(v) => setForm((x) => ({ ...x, [f.key]: v }))}
                />
              ) : (
                <label key={f.key}>
                  {f.label}
                  {f.type === 'textarea' ? (
                    <textarea
                      name={f.key}
                      required={f.required !== false}
                      defaultValue={form[f.key] || ''}
                    />
                  ) : (
                    <Input
                      name={f.key}
                      type={f.type || 'text'}
                      required={f.required !== false}
                      minLength={f.type === 'password' ? 10 : undefined}
                      step={f.type === 'number' ? 'any' : undefined}
                      defaultValue={form[f.key] || ''}
                    />
                  )}
                  {f.hint && <small>{f.hint}</small>}
                </label>
              ),
            )}
            <div className="actions">
              <Button disabled={busy} type="submit">
                {busy ? 'Сохраняем…' : modal?.submit || 'Сохранить'}
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                onClick={() => {setModal(null);setForm({});}}
              >
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!accountReceipt} onOpenChange={open=>{if(!open)setAccountReceipt(null);}}>
        <DialogContent className="driving-school-root">
          <DialogTitle>Доступ ученика подтверждён</DialogTitle>
          <DialogDescription>Общий аккаунт СИНТАГМЫ связан с автошколой. Письмо не отправлено. Отдельное приглашение ученику не требуется.</DialogDescription>
          {accountReceipt?.login?<><label>Подтверждённый логин<Input aria-label="Логин ученика" readOnly value={accountReceipt.login} onFocus={e=>e.target.select()}/></label><p>В общем входе СИНТАГМЫ выберите «По логину». Контактная почта из карточки не заменяет этот логин.</p></>:<p>Используйте обычный способ входа существующего аккаунта СИНТАГМЫ.</p>}
          <p>{accountReceipt?.isExisting?'Аккаунт уже существовал. Пароль не менялся и не отображается.':'Пароль — тот, который вы указали при создании. Он не сохраняется этим модулем в браузере.'}</p>
          <p>После входа откройте раздел «Автошколы» и выберите свою школу.</p>
          <Button onClick={()=>setAccountReceipt(null)}>Понятно</Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!inviteLink}
        onOpenChange={(v) => {
          if (!v) setInviteLink('');
        }}
      >
        <DialogContent className="driving-school-root">
          <DialogTitle>Приглашение готово</DialogTitle>
          <DialogDescription>
            Одноразовая ссылка, 72 часа. Письмо не отправлено. Только для действующего общего аккаунта этой организации с подтверждённой почтой; новая организация при регистрации не подходит.
          </DialogDescription>
          <Input
            aria-label="Ссылка приглашения"
            readOnly
            value={inviteLink}
            onFocus={(e) => e.target.select()}
          />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteLink);
                setNotice('Ссылка скопирована');
                setInviteLink('');
              } catch {
                setError('Выделите ссылку и скопируйте вручную');
              }
            }}
          >
            Скопировать ссылку
          </Button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}






