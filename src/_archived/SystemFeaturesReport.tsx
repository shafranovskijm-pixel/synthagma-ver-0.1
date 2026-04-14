import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Download,
  BookOpen,
  Users,
  Building2,
  FileCheck,
  ClipboardList,
  Database,
  Link,
  Library,
  ShoppingBag,
  Settings,
  GraduationCap,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface FeatureCategory {
  title: string;
  icon: React.ElementType;
  color: string;
  features: string[];
}

const SYSTEM_FEATURES: FeatureCategory[] = [
  {
    title: "Управление курсами",
    icon: BookOpen,
    color: "#6366f1",
    features: [
      "Создание и редактирование курсов",
      "Публикация и снятие с публикации",
      "Категории курсов с цветовой маркировкой",
      "Конструктор уроков (лекции, тесты, видео)",
      "Импорт курсов из внешних источников",
      "ИИ-генерация контента курсов",
      "Предпросмотр курса перед публикацией",
      "Управление продолжительностью обучения",
    ],
  },
  {
    title: "Управление слушателями",
    icon: Users,
    color: "#10b981",
    features: [
      "Добавление слушателей вручную",
      "Массовый импорт из Excel",
      "Зачисление на курсы (индивидуально и массово)",
      "Отслеживание прогресса обучения",
      "Карточка слушателя с полной информацией",
      "Генерация логинов и паролей",
      "Отправка учётных данных по Email",
      "Привязка к компаниям-заказчикам",
      "Массовые операции (отчисление, рассылка)",
      "Фильтрация по статусу, курсу, документам",
    ],
  },
  {
    title: "Компании (юридические лица)",
    icon: Building2,
    color: "#f59e0b",
    features: [
      "Справочник компаний-заказчиков",
      "Полные реквизиты (ИНН, КПП, ОГРН)",
      "Банковские реквизиты",
      "Загрузка печати и подписи",
      "Документы компаний (договоры, счета)",
      "Привязка слушателей к компаниям",
    ],
  },
  {
    title: "Документооборот",
    icon: FileCheck,
    color: "#ec4899",
    features: [
      "Генератор договоров с шаблонами",
      "Редактор шаблонов с переменными",
      "Генератор согласий на обработку ПДн",
      "Генератор актов выполненных работ",
      "Генератор счетов на оплату",
      "Журнал выдачи документов",
      "Архив приказов (зачисление, отчисление)",
      "Массовая загрузка документов",
      "Управление документами слушателей",
      "Экспорт классного журнала",
    ],
  },
  {
    title: "Журналы учёта",
    icon: ClipboardList,
    color: "#8b5cf6",
    features: [
      "Журнал посещаемости (автоматический)",
      "Журнал посещаемости (ручной)",
      "Журнал текущего контроля успеваемости",
      "Журнал итоговой аттестации",
      "Журнал регистрации документов",
      "Журнал учёта бланков строгой отчётности",
      "Журнал выдачи копий/дубликатов",
      "Журнал входного контроля",
      "Журнал индивидуальных планов",
      "Журнал стажировки/практики",
      "Журнал инструктажей по ТБ",
      "Создание пользовательских журналов",
      "Экспорт журналов в Excel",
    ],
  },
  {
    title: "ФРДО (Федеральный реестр)",
    icon: Database,
    color: "#06b6d4",
    features: [
      "Управление данными для ФРДО",
      "Проверка полноты данных",
      "Массовый экспорт в формате ФРДО",
      "Индивидуальный экспорт данных",
    ],
  },
  {
    title: "Ссылки регистрации",
    icon: Link,
    color: "#14b8a6",
    features: [
      "Генерация уникальных ссылок",
      "Привязка к курсам",
      "Привязка к компаниям",
      "Отслеживание использования",
      "Срок действия ссылок",
    ],
  },
  {
    title: "Библиотека",
    icon: Library,
    color: "#f97316",
    features: [
      "Хранение учебных материалов",
      "Организация по папкам",
      "Загрузка файлов различных форматов",
      "Доступ для слушателей",
    ],
  },
  {
    title: "Услуги",
    icon: ShoppingBag,
    color: "#84cc16",
    features: [
      "Каталог дополнительных услуг",
      "Заказ услуг организациями",
      "Отслеживание статусов заказов",
    ],
  },
  {
    title: "Настройки системы",
    icon: Settings,
    color: "#64748b",
    features: [
      "Реквизиты организации",
      "Тёмная и светлая тема",
      "Настройки видимости меню",
      "Настройки кабинета слушателя",
      "Управление уведомлениями",
    ],
  },
  {
    title: "Кабинет слушателя",
    icon: GraduationCap,
    color: "#0ea5e9",
    features: [
      "Прохождение курсов онлайн",
      "Интерактивное тестирование",
      "Загрузка документов",
      "Подписание согласий на ПДн",
      "Видеоидентификация",
      "Система достижений и бейджей",
      "ИИ-помощник (чат-бот)",
      "Просмотр прогресса обучения",
    ],
  },
];

export function SystemFeaturesReport() {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async () => {
    setIsGenerating(true);

    try {
      // Create printable HTML content
      const printContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Синтагма — Функциональные возможности</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1f2937;
      line-height: 1.6;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #6366f1;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #6b7280;
      font-size: 14px;
    }
    .date {
      color: #9ca3af;
      font-size: 12px;
      margin-top: 8px;
    }
    .category {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .category-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-left: 4px solid var(--color);
    }
    .category-title {
      font-size: 16px;
      font-weight: 600;
    }
    .category-count {
      font-size: 12px;
      color: #6b7280;
      margin-left: auto;
    }
    .features-list {
      list-style: none;
      padding-left: 20px;
    }
    .feature-item {
      padding: 6px 0;
      padding-left: 20px;
      position: relative;
      font-size: 14px;
      color: #374151;
    }
    .feature-item::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #10b981;
      font-weight: bold;
    }
    .summary {
      margin-top: 40px;
      padding: 20px;
      background: #f8fafc;
      border-radius: 12px;
      text-align: center;
    }
    .summary-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .summary-stats {
      display: flex;
      justify-content: center;
      gap: 40px;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: #6366f1;
    }
    .stat-label {
      font-size: 12px;
      color: #6b7280;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 11px;
      color: #9ca3af;
    }
    @media print {
      body { padding: 20px; }
      .category { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Σ Синтагма</div>
    <div class="subtitle">Платформа дополнительного профессионального образования</div>
    <div class="date">Сформировано: ${new Date().toLocaleDateString('ru-RU', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}</div>
  </div>

  <h1 style="font-size: 22px; margin-bottom: 24px; text-align: center;">Функциональные возможности системы</h1>

  ${SYSTEM_FEATURES.map(category => `
    <div class="category">
      <div class="category-header" style="--color: ${category.color}">
        <span class="category-title">${category.title}</span>
        <span class="category-count">${category.features.length} функций</span>
      </div>
      <ul class="features-list">
        ${category.features.map(feature => `
          <li class="feature-item">${feature}</li>
        `).join('')}
      </ul>
    </div>
  `).join('')}

  <div class="summary">
    <div class="summary-title">Итого</div>
    <div class="summary-stats">
      <div class="stat">
        <div class="stat-value">${SYSTEM_FEATURES.length}</div>
        <div class="stat-label">модулей</div>
      </div>
      <div class="stat">
        <div class="stat-value">${SYSTEM_FEATURES.reduce((sum, cat) => sum + cat.features.length, 0)}</div>
        <div class="stat-label">функций</div>
      </div>
    </div>
  </div>

  <div class="footer">
    © ${new Date().getFullYear()} Синтагма — Система управления образовательным процессом
  </div>
</body>
</html>
      `;

      // Open print dialog
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        // Wait for content to load then print
        printWindow.onload = () => {
          printWindow.print();
        };
        
        toast.success("PDF готов к сохранению");
      } else {
        toast.error("Не удалось открыть окно печати");
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Ошибка при генерации PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  const totalFeatures = SYSTEM_FEATURES.reduce((sum, cat) => sum + cat.features.length, 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-xl">
          <FileText className="w-4 h-4 mr-2" />
          Функции системы
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Функциональные возможности Синтагмы
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between bg-secondary/30 rounded-xl p-4 mb-4">
          <div>
            <p className="font-medium">{SYSTEM_FEATURES.length} модулей</p>
            <p className="text-sm text-muted-foreground">{totalFeatures} функций</p>
          </div>
          <Button onClick={generatePDF} disabled={isGenerating} className="rounded-xl">
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Скачать PDF
          </Button>
        </div>

        <ScrollArea className="h-[50vh] pr-4">
          <div className="space-y-4">
            {SYSTEM_FEATURES.map((category) => {
              const Icon = category.icon;
              return (
                <div key={category.title} className="border border-border rounded-xl overflow-hidden">
                  <div 
                    className="flex items-center gap-3 p-3 bg-secondary/30"
                    style={{ borderLeft: `4px solid ${category.color}` }}
                  >
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}20` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: category.color }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{category.title}</h3>
                      <p className="text-xs text-muted-foreground">{category.features.length} функций</p>
                    </div>
                  </div>
                  <div className="p-3 grid grid-cols-1 gap-1">
                    {category.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
