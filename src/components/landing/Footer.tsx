import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Mail, Phone } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <SigmaLogo size="lg" variant="white" className="mb-4" />
            <p className="text-background/70 max-w-md mb-6">
              Современная система дистанционного обучения для организаций
              и образовательных центров. Соответствует требованиям 273-ФЗ.
            </p>
            <div className="space-y-2 text-background/70">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>support@sintagma.ru</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span>8 (800) 123-45-67</span>
              </div>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold text-lg mb-4">Платформа</h4>
            <ul className="space-y-3 text-background/70">
              <li><a href="#features" className="hover:text-background transition-colors">Возможности</a></li>
              <li><a href="#for-students" className="hover:text-background transition-colors">Для учеников</a></li>
              <li><a href="#pricing" className="hover:text-background transition-colors">Тарифы</a></li>
              <li><a href="#" className="hover:text-background transition-colors">Документация</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-lg mb-4">Компания</h4>
            <ul className="space-y-3 text-background/70">
              <li><a href="#" className="hover:text-background transition-colors">О нас</a></li>
              <li><a href="#" className="hover:text-background transition-colors">Блог</a></li>
              <li><a href="#" className="hover:text-background transition-colors">Контакты</a></li>
              <li><a href="#" className="hover:text-background transition-colors">Поддержка</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-background/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-background/50 text-sm">
            © 2024 СИНТАГМА. Все права защищены.
          </p>
          <div className="flex gap-6 text-sm text-background/50">
            <a href="#" className="hover:text-background transition-colors">
              Политика конфиденциальности
            </a>
            <a href="#" className="hover:text-background transition-colors">
              Условия использования
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
