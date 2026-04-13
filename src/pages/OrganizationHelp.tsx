import { HelpCircle, MessageCircle, FileText, Mail, ExternalLink } from "lucide-react";
import OrgPageLayout from "@/components/organization/OrgPageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const helpItems = [
  {
    icon: MessageCircle,
    title: "Поддержка в Telegram",
    description: "Напишите нам — ответим в течение нескольких минут",
    action: () => window.open("https://t.me/sintagma_support", "_blank"),
    buttonText: "Написать в Telegram",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: Mail,
    title: "Email поддержка",
    description: "Отправьте письмо на support@sintagma.ru",
    action: () => window.open("mailto:support@sintagma.ru", "_blank"),
    buttonText: "Написать письмо",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: FileText,
    title: "Документация",
    description: "Пользовательское соглашение и политика конфиденциальности",
    action: null,
    links: [
      { label: "Пользовательское соглашение", href: "/terms" },
      { label: "Политика конфиденциальности", href: "/privacy" },
      { label: "Публичная оферта", href: "/public-offer" },
    ],
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
];

export default function OrganizationHelp() {
  return (
    <OrgPageLayout title="Помощь" icon={HelpCircle}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center mb-8">
          <h2 className="font-display text-xl font-bold mb-1">Центр помощи</h2>
          <p className="text-muted-foreground text-sm">Выберите удобный способ связи или найдите ответ в документации</p>
        </div>

        {helpItems.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="rounded-2xl hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-6 h-6 ${item.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-base mb-1">{item.title}</h3>
                    <p className="text-muted-foreground text-sm mb-3">{item.description}</p>
                    {item.action && (
                      <Button onClick={item.action} variant="outline" size="sm" className="rounded-xl gap-2">
                        <ExternalLink className="w-3.5 h-3.5" />
                        {item.buttonText}
                      </Button>
                    )}
                    {item.links && (
                      <div className="flex flex-wrap gap-2">
                        {item.links.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </OrgPageLayout>
  );
}
