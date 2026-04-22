import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Minus } from "lucide-react";
import {
  ORG_ROLE_PERMISSIONS,
  ADMIN_ROLE_SECTIONS,
  type OrgStaffRole,
  type AdminStaffRole,
  type Permission,
  type AdminSection,
} from "@/constants/rolePermissions";

const ORG_ROLE_LABELS: Record<OrgStaffRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  school_editor: "Редактор школы",
  course_editor: "Редактор курсов",
  teacher: "Преподаватель",
};

const ADMIN_ROLE_LABELS: Record<AdminStaffRole, string> = {
  super_admin: "Супер-админ",
  admin: "Администратор",
  sales_manager: "Менеджер по продажам",
  viewer: "Наблюдатель",
};

// Группы прав для красивого отображения
const ORG_PERMISSION_GROUPS: { title: string; perms: { key: Permission; label: string }[] }[] = [
  {
    title: "Контент",
    perms: [
      { key: "courses.write", label: "Курсы" },
      { key: "library.write", label: "Библиотека" },
      { key: "webinars.write", label: "Вебинары" },
      { key: "homework.write", label: "Проверка ДЗ" },
    ],
  },
  {
    title: "Ученики и компании",
    perms: [
      { key: "students.write", label: "Ученики" },
      { key: "companies.write", label: "Компании-клиенты" },
      { key: "chats.write", label: "Чаты" },
    ],
  },
  {
    title: "Документы и журналы",
    perms: [
      { key: "documents.write", label: "Документы об образовании" },
      { key: "journals.write", label: "Журналы" },
      { key: "frdo.write", label: "ФРДО" },
      { key: "labor_safety.write", label: "Охрана труда" },
    ],
  },
  {
    title: "Управление",
    perms: [
      { key: "services.write", label: "Услуги/прайс" },
      { key: "staff.write", label: "Сотрудники" },
      { key: "billing.write", label: "Биллинг" },
      { key: "settings.write", label: "Настройки школы" },
      { key: "sales.write", label: "Продажи (CRM)" },
    ],
  },
];

const ADMIN_SECTION_LABELS: Partial<Record<AdminSection, string>> = {
  organizations: "Организации",
  users: "Пользователи",
  marketplace: "Маркетплейс",
  sales: "Продажи / CRM",
  finance: "Финансы",
  "webinars-admin": "Вебинары",
  chats: "Чаты",
  billing: "Биллинг",
  broadcast: "Рассылка",
  "support-chats": "Чаты поддержки",
  referrals: "Реферальная программа",
  support: "Поддержка",
  devtools: "Инструменты разработчика",
  updates: "Обновления",
  staff: "Сотрудники платформы",
  settings: "Настройки",
  analytics: "Аналитика",
  content: "Контент",
  ai: "ИИ-настройки",
};

interface OrgPermissionMatrixProps {
  highlightRole?: OrgStaffRole | null;
}

export function OrgPermissionMatrix({ highlightRole }: OrgPermissionMatrixProps) {
  const roles: OrgStaffRole[] = ["owner", "admin", "school_editor", "course_editor", "teacher"];

  return (
    <div className="space-y-4">
      {ORG_PERMISSION_GROUPS.map(group => (
        <div key={group.title} className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Возможность</TableHead>
                {roles.map(r => (
                  <TableHead
                    key={r}
                    className={`text-center text-xs ${highlightRole === r ? "text-primary font-semibold" : ""}`}
                  >
                    {ORG_ROLE_LABELS[r]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.perms.map(p => (
                <TableRow key={p.key}>
                  <TableCell className="text-sm">{p.label}</TableCell>
                  {roles.map(r => {
                    const has = ORG_ROLE_PERMISSIONS[r].includes(p.key);
                    return (
                      <TableCell key={r} className="text-center">
                        {has ? (
                          <Check className="w-4 h-4 mx-auto text-emerald-600" />
                        ) : (
                          <Minus className="w-3.5 h-3.5 mx-auto text-muted-foreground/40" />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

interface AdminPermissionMatrixProps {
  highlightRole?: AdminStaffRole | null;
}

export function AdminPermissionMatrix({ highlightRole }: AdminPermissionMatrixProps) {
  const roles: AdminStaffRole[] = ["super_admin", "admin", "sales_manager", "viewer"];
  const sections = (Object.keys(ADMIN_SECTION_LABELS) as AdminSection[]);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Раздел админ-панели</TableHead>
            {roles.map(r => (
              <TableHead
                key={r}
                className={`text-center text-xs ${highlightRole === r ? "text-primary font-semibold" : ""}`}
              >
                {ADMIN_ROLE_LABELS[r]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map(s => (
            <TableRow key={s}>
              <TableCell className="text-sm">{ADMIN_SECTION_LABELS[s]}</TableCell>
              {roles.map(r => {
                const has = ADMIN_ROLE_SECTIONS[r].includes(s);
                return (
                  <TableCell key={r} className="text-center">
                    {has ? (
                      <Check className="w-4 h-4 mx-auto text-emerald-600" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 mx-auto text-muted-foreground/40" />
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
