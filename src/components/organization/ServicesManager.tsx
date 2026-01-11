import { ExternalLink, FileText, GraduationCap, FileCheck, Award, ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Service {
  id: string;
  title: string;
  description: string;
  price: string;
  priceNote?: string;
  icon: React.ReactNode;
  features: string[];
  popular?: boolean;
}

const services: Service[] = [
  {
    id: "qualification",
    title: "Разработка программы повышения квалификации",
    description: "Создание полной программы повышения квалификации с учётом требований законодательства",
    price: "15 500 ₽",
    icon: <GraduationCap className="w-6 h-6" />,
    features: [
      "Разработка учебного плана",
      "Создание учебно-тематического плана",
      "Подготовка методических материалов",
      "Оформление по ФГОС"
    ],
    popular: true
  },
  {
    id: "professional",
    title: "Разработка программы профессиональной подготовки",
    description: "Комплексная разработка программы профессиональной подготовки для вашей организации",
    price: "15 500 ₽",
    icon: <Award className="w-6 h-6" />,
    features: [
      "Анализ профессиональных стандартов",
      "Разработка компетенций",
      "Создание программы обучения",
      "Методические рекомендации"
    ],
    popular: true
  },
  {
    id: "website",
    title: "Сайт под ключ",
    description: "Полноценный сайт образовательной организации с интеграцией LMS",
    price: "25 000 ₽",
    icon: <ExternalLink className="w-6 h-6" />,
    features: [
      "Современный адаптивный дизайн",
      "Интеграция с платформой обучения",
      "SEO-оптимизация",
      "Техническая поддержка"
    ]
  },
  {
    id: "documents",
    title: "Документы образовательной организации",
    description: "Подготовка полного комплекта документов для образовательной деятельности",
    price: "от 3 500 ₽",
    icon: <FileText className="w-6 h-6" />,
    features: [
      "Локальные нормативные акты",
      "Положения и регламенты",
      "Формы и шаблоны документов",
      "Консультационная поддержка"
    ]
  },
  {
    id: "materials",
    title: "Подготовка комплекта учебных материалов",
    description: "Создание качественных учебных материалов для ваших курсов",
    price: "от 3 500 ₽",
    icon: <ScrollText className="w-6 h-6" />,
    features: [
      "Лекционные материалы",
      "Практические задания",
      "Тестовые задания",
      "Методические указания"
    ]
  },
  {
    id: "license",
    title: "Расширение/получение лицензии",
    description: "Полное сопровождение процесса получения или расширения образовательной лицензии",
    price: "от 35 000 ₽",
    icon: <ShieldCheck className="w-6 h-6" />,
    features: [
      "Анализ требований",
      "Подготовка документов",
      "Сопровождение проверки",
      "Юридическая поддержка"
    ]
  }
];

export function ServicesManager() {
  const handleOrderService = (service: Service) => {
    const message = `Здравствуйте! Меня интересует услуга "${service.title}" (${service.price}).`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`mailto:info@sigma-edu.ru?subject=Заявка на услугу&body=${encodedMessage}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 rounded-2xl p-6 border border-border">
        <h2 className="font-display text-xl font-semibold mb-2">Услуги для образовательных организаций</h2>
        <p className="text-muted-foreground">
          Профессиональная помощь в развитии вашей образовательной деятельности
        </p>
      </div>

      {/* Services Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <Card 
            key={service.id} 
            className={`relative overflow-hidden transition-all hover:shadow-lg ${
              service.popular ? 'border-primary/50 shadow-primary/10' : ''
            }`}
          >
            {service.popular && (
              <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground">
                Популярное
              </Badge>
            )}
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                {service.icon}
              </div>
              <CardTitle className="font-display text-lg leading-tight">
                {service.title}
              </CardTitle>
              <CardDescription>
                {service.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-bold font-display text-primary">
                {service.price}
              </div>
              <ul className="space-y-2">
                {service.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <FileCheck className="w-4 h-4 text-sigma-green mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button 
                className="w-full btn-gradient rounded-xl"
                onClick={() => handleOrderService(service)}
              >
                Заказать
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contact Info */}
      <Card className="bg-secondary/50">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-display font-semibold mb-1">Нужна индивидуальная консультация?</h3>
              <p className="text-muted-foreground text-sm">
                Свяжитесь с нами для обсуждения ваших задач и получения персонального предложения
              </p>
            </div>
            <Button 
              variant="outline" 
              className="rounded-xl gap-2 whitespace-nowrap"
              onClick={() => window.open('mailto:info@sigma-edu.ru', '_blank')}
            >
              <ExternalLink className="w-4 h-4" />
              Связаться с нами
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
