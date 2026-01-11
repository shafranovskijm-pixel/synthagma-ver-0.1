import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Mail, Phone, ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-foreground text-background py-20 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-accent rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-6 relative">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-2">
            <SigmaLogo size="lg" variant="white" className="mb-6" />
            <p className="text-background/70 max-w-md mb-8 leading-relaxed text-lg">
              Современная система дистанционного обучения и документооборота для организаций.
              Соответствует требованиям 273-ФЗ.
            </p>
            <div className="space-y-3 text-background/70">
              <a href="mailto:support@sintagma.ru" className="flex items-center gap-3 hover:text-background transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-background/10 flex items-center justify-center group-hover:bg-background/20 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <span>support@sintagma.ru</span>
              </a>
              <a href="tel:88001234567" className="flex items-center gap-3 hover:text-background transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-background/10 flex items-center justify-center group-hover:bg-background/20 transition-colors">
                  <Phone className="w-5 h-5" />
                </div>
                <span>8 (800) 123-45-67</span>
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-bold text-lg mb-6">Платформа</h4>
            <ul className="space-y-4 text-background/70">
              {[
                { label: "Возможности", href: "#features" },
                { label: "Для учеников", href: "#for-students" },
                { label: "Тарифы", href: "#pricing" },
                { label: "Документация", href: "#" },
              ].map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="hover:text-background transition-colors flex items-center gap-1 group">
                    {link.label}
                    <ArrowUpRight className="w-4 h-4 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-lg mb-6">Компания</h4>
            <ul className="space-y-4 text-background/70">
              {[
                { label: "О нас", href: "#" },
                { label: "Блог", href: "#" },
                { label: "Контакты", href: "#" },
                { label: "Поддержка", href: "#" },
              ].map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="hover:text-background transition-colors flex items-center gap-1 group">
                    {link.label}
                    <ArrowUpRight className="w-4 h-4 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-background/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-background/50 text-sm">
            © 2024 СИНТАГМА. Все права защищены.
          </p>
          <div className="flex gap-8 text-sm text-background/50">
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
