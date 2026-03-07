import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface CommissionMember {
  name: string;
  position: string;
  role: "chairman" | "member" | "secretary";
}

interface DocumentPreviewData {
  orgName?: string;
  studentName?: string;
  courseName?: string;
  hours?: string;
  series?: string;
  number?: number;
  city?: string;
  regNumberFormat?: string;
  commissionMembers?: CommissionMember[];
  directorName?: string;
  inn?: string;
  ogrn?: string;
  address?: string;
  qualification?: string;
}

interface DocumentPreviewProps {
  type: "certificate" | "diploma" | "protocol" | "consent";
  data?: DocumentPreviewData;
}

const defaults: DocumentPreviewData = {
  orgName: 'ООО «Учебный Центр»',
  studentName: "Иванов Иван Иванович",
  courseName: "Охрана труда для руководителей",
  hours: "72",
  series: "ПК",
  number: 1,
  city: "г. Москва",
  regNumberFormat: "{{year}}-{{number}}",
  directorName: "Петров П.П.",
  inn: "7701234567",
  ogrn: "1027700132195",
  address: "г. Москва, ул. Примерная, д. 1",
  qualification: "Специалист по охране труда",
  commissionMembers: [
    { name: "Петров П.П.", position: "Директор", role: "chairman" },
    { name: "Сидорова А.В.", position: "Зам. директора", role: "member" },
  ],
};

const today = () => format(new Date(), "«dd» MMMM yyyy", { locale: ru });

const regNumber = (fmt: string, num: number) =>
  fmt
    .replace("{{year}}", new Date().getFullYear().toString())
    .replace("{{number}}", num.toString().padStart(4, "0"));

function CertificatePreview({ d }: { d: DocumentPreviewData }) {
  return (
    <>
      <div className="text-center space-y-1 mb-4">
        <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Российская Федерация</p>
        <p className="text-[8px] font-bold">{d.orgName}</p>
      </div>
      <div className="border-t border-b border-border py-3 my-3 text-center">
        <p className="text-[10px] font-bold tracking-wide uppercase">Удостоверение</p>
        <p className="text-[9px] uppercase">о повышении квалификации</p>
      </div>
      <div className="space-y-1.5 text-[8px]">
        <div className="flex justify-between">
          <span>Серия {d.series}</span>
          <span>№ {d.number?.toString().padStart(4, "0")}</span>
        </div>
        <p>Рег. номер: {regNumber(d.regNumberFormat!, d.number!)}</p>
      </div>
      <div className="mt-3 space-y-1 text-[8px]">
        <p>Настоящее удостоверение свидетельствует о том, что</p>
        <p className="font-bold text-[9px] text-center py-1">{d.studentName}</p>
        <p>прошёл(а) повышение квалификации в {d.orgName}</p>
        <p>по дополнительной профессиональной программе</p>
        <p className="font-bold text-center py-1">«{d.courseName}»</p>
        <p>в объёме {d.hours} часов</p>
      </div>
      <div className="mt-auto pt-4 flex justify-between items-end text-[7px]">
        <div>
          <p>{d.city}</p>
          <p>{today()}</p>
        </div>
        <div className="flex gap-6 items-end">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center mb-0.5">
              <span className="text-[5px] text-muted-foreground">М.П.</span>
            </div>
          </div>
          <div className="text-center">
            <div className="border-b border-muted-foreground/40 w-16 mb-0.5" />
            <span className="text-[6px] text-muted-foreground">подпись</span>
          </div>
        </div>
      </div>
    </>
  );
}

function DiplomaPreview({ d }: { d: DocumentPreviewData }) {
  return (
    <>
      <div className="text-center space-y-1 mb-4">
        <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Российская Федерация</p>
        <p className="text-[8px] font-bold">{d.orgName}</p>
      </div>
      <div className="border-t border-b border-border py-3 my-3 text-center">
        <p className="text-[10px] font-bold tracking-wide uppercase">Диплом</p>
        <p className="text-[9px] uppercase">о профессиональной переподготовке</p>
      </div>
      <div className="space-y-1.5 text-[8px]">
        <div className="flex justify-between">
          <span>Серия {d.series || "ДПП"}</span>
          <span>№ {d.number?.toString().padStart(4, "0")}</span>
        </div>
        <p>Рег. номер: {regNumber(d.regNumberFormat!, d.number!)}</p>
      </div>
      <div className="mt-3 space-y-1 text-[8px]">
        <p>Настоящий диплом свидетельствует о том, что</p>
        <p className="font-bold text-[9px] text-center py-1">{d.studentName}</p>
        <p>прошёл(а) профессиональную переподготовку в {d.orgName}</p>
        <p>по программе</p>
        <p className="font-bold text-center py-1">«{d.courseName}»</p>
        <p>в объёме {d.hours} часов</p>
        <p className="mt-1">и имеет право на ведение профессиональной деятельности в сфере</p>
        <p className="font-bold text-center">«{d.qualification}»</p>
      </div>
      <div className="mt-auto pt-4 flex justify-between items-end text-[7px]">
        <div>
          <p>{d.city}</p>
          <p>{today()}</p>
        </div>
        <div className="flex gap-6 items-end">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center mb-0.5">
              <span className="text-[5px] text-muted-foreground">М.П.</span>
            </div>
          </div>
          <div className="text-center">
            <div className="border-b border-muted-foreground/40 w-16 mb-0.5" />
            <span className="text-[6px] text-muted-foreground">подпись</span>
          </div>
        </div>
      </div>
    </>
  );
}

function ProtocolPreview({ d }: { d: DocumentPreviewData }) {
  const roleLabels: Record<string, string> = {
    chairman: "Председатель",
    member: "Член комиссии",
    secretary: "Секретарь",
  };
  return (
    <>
      <div className="text-center space-y-1 mb-3">
        <p className="text-[10px] font-bold uppercase">Протокол</p>
        <p className="text-[9px] uppercase">заседания аттестационной комиссии</p>
        <p className="text-[8px]">№ 1 от {today()}</p>
      </div>
      <p className="text-[8px] font-bold text-center mb-2">{d.orgName}</p>
      <div className="text-[7px] space-y-1 mb-3">
        <p>Программа обучения: «{d.courseName}»</p>
        <p>Объём программы: {d.hours} часов</p>
      </div>
      <div className="text-[7px] mb-3">
        <p className="font-bold mb-1">Состав комиссии:</p>
        {d.commissionMembers?.map((m, i) => (
          <p key={i}>
            {roleLabels[m.role] || m.role}: {m.name || "___________"}{m.position ? ` — ${m.position}` : ""}
          </p>
        ))}
      </div>
      <div className="text-[7px] space-y-1 mb-3">
        <p className="font-bold">Повестка дня:</p>
        <p>Итоговая аттестация слушателей по результатам освоения дополнительной профессиональной программы.</p>
      </div>
      <div className="border border-border rounded text-[6px] mb-3">
        <div className="grid grid-cols-4 gap-px bg-border">
          {["№", "ФИО", "Результат", "Оценка"].map(h => (
            <div key={h} className="bg-muted p-1 font-bold text-center">{h}</div>
          ))}
          {["1", d.studentName!, "Аттестован(а)", "Зачёт"].map((c, i) => (
            <div key={i} className="bg-card p-1 text-center">{c}</div>
          ))}
        </div>
      </div>
      <div className="text-[7px] space-y-1">
        <p className="font-bold">РЕШИЛИ:</p>
        <p>Признать слушателей успешно прошедшими итоговую аттестацию. Выдать документы о квалификации установленного образца.</p>
      </div>
      <div className="mt-auto pt-3 text-[7px] space-y-1">
        {d.commissionMembers?.filter(m => m.role === "chairman").map((m, i) => (
          <div key={i} className="flex justify-between">
            <span>Председатель комиссии:</span>
            <span>_________ / {m.name || "___________"} /</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ConsentPreview({ d }: { d: DocumentPreviewData }) {
  return (
    <>
      <p className="text-[10px] font-bold text-center uppercase mb-3">
        Согласие на обработку персональных данных
      </p>
      <div className="text-[7px] space-y-2">
        <p>
          Я, <span className="font-bold">{d.studentName}</span>, паспорт: ________________, адрес: ________________, настоящим даю согласие{" "}
          <span className="font-bold">{d.orgName}</span>, ИНН {d.inn}, ОГРН {d.ogrn}, адрес: {d.address}, на обработку моих персональных данных.
        </p>
        <p className="font-bold text-[7px]">Цель обработки:</p>
        <p>Заключение и исполнение договора об оказании платных образовательных услуг; организация образовательного процесса; ведение учета обучающихся.</p>
        <p className="font-bold text-[7px]">Перечень персональных данных:</p>
        <ul className="list-disc ml-3 space-y-0.5">
          <li>фамилия, имя, отчество</li>
          <li>дата и место рождения</li>
          <li>паспортные данные</li>
          <li>адрес регистрации / проживания</li>
          <li>контактные данные (телефон, e-mail)</li>
          <li>сведения об образовании</li>
        </ul>
        <p>Настоящее согласие действует с даты подписания и до достижения целей обработки.</p>
      </div>
      <div className="mt-auto pt-4 flex justify-between items-end text-[7px]">
        <p>Дата: {today()}</p>
        <div className="text-center">
          <div className="border-b border-muted-foreground/40 w-20 mb-0.5" />
          <span className="text-[6px] text-muted-foreground">/ {d.studentName} /</span>
        </div>
      </div>
    </>
  );
}

export function DocumentPreview({ type, data }: DocumentPreviewProps) {
  const d = { ...defaults, ...data };

  return (
    <div className="max-w-md mx-auto">
      <div className="aspect-[210/297] bg-white dark:bg-card border border-border shadow-sm rounded-lg p-6 flex flex-col text-foreground font-serif leading-tight overflow-hidden">
        {type === "certificate" && <CertificatePreview d={d} />}
        {type === "diploma" && <DiplomaPreview d={d} />}
        {type === "protocol" && <ProtocolPreview d={d} />}
        {type === "consent" && <ConsentPreview d={d} />}
      </div>
    </div>
  );
}
