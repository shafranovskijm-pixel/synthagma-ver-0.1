import { Link } from "react-router-dom";
import { Mail, Phone, ArrowUpRight, Download } from "lucide-react";
import { motion } from "framer-motion";


export function Footer() {
  return (
    <footer className="bg-foreground text-background py-20 relative overflow-hidden">
      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-accent/5" />
      <div className="absolute inset-0 bg-gradient-to-tl from-background/5 via-transparent to-transparent" />
      
      {/* Radial glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/8 rounded-full blur-[150px] translate-x-1/4 -translate-y-1/4" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] -translate-x-1/4 translate-y-1/4" />
      
      {/* Subtle accent glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

      <div className="container mx-auto px-6 relative">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-6 group">
              <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <span className="font-display font-bold text-xl text-foreground">Σ</span>
              </div>
              <span className="font-display font-medium text-xl text-background tracking-tight">СИНТАГМА</span>
            </Link>
            <p className="text-background/60 max-w-sm mb-8 leading-relaxed">Современная система дистанционного обучения и документооборота для организаций.</p>
            
            {/* Install App Button */}
            <div className="mb-8">
              <Link 
                to="/install" 
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-background/10 border border-background/20 hover:bg-background/15 transition-colors group"
              >
                <Download className="w-5 h-5 text-background" />
                <span className="text-sm font-medium text-background">Установить приложение</span>
              </Link>
            </div>
            
            <div className="space-y-3">
              <a href="mailto:support@sintagma.com.ru" className="flex items-center gap-3 text-background/60 hover:text-background transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-background/10 flex items-center justify-center group-hover:bg-background/15 transition-colors">
                  <Mail className="w-4 h-4" />
                </div>
                <span className="text-sm">support@sintagma.com.ru</span>
              </a>
              <a href="tel:89147213424" className="flex items-center gap-3 text-background/60 hover:text-background transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-background/10 flex items-center justify-center group-hover:bg-background/15 transition-colors">
                  <Phone className="w-4 h-4" />
                </div>
                <span className="text-sm">8 (914) 721-34-24</span>
              </a>
              <a href="tel:89247213424" className="flex items-center gap-3 text-background/60 hover:text-background transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-background/10 flex items-center justify-center group-hover:bg-background/15 transition-colors">
                  <Phone className="w-4 h-4" />
                </div>
                <span className="text-sm">8 (924) 721-34-24</span>
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-medium text-base mb-6 text-background">Платформа</h4>
            <ul className="space-y-3">
              {[
                { label: "Стоимость", href: "#calculator" },
                { label: "Презентация", to: "/presentation" },
                { label: "Партнёрам", to: "/partner" },
                { label: "Блог", to: "/blog" },
              ].map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link to={link.to} className="text-background/60 hover:text-background transition-colors text-sm flex items-center gap-1 group">
                      {link.label}
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-0.5 translate-x-0.5 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                    </Link>
                  ) : (
                    <a href={link.href} className="text-background/60 hover:text-background transition-colors text-sm flex items-center gap-1 group">
                      {link.label}
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-0.5 translate-x-0.5 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-medium text-base mb-6 text-background">Компания</h4>
            <ul className="space-y-3">
              {[
                { label: "О нас", to: "/about" },
                { label: "Установить приложение", to: "/install" },
                { label: "Контакты", href: "mailto:shafranovskij.m@gmail.com" },
                { label: "Поддержка", href: "tel:89147213424" },
              ].map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link to={link.to} className="text-background/60 hover:text-background transition-colors text-sm flex items-center gap-1 group">
                      {link.label}
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-0.5 translate-x-0.5 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                    </Link>
                  ) : (
                    <a href={link.href} className="text-background/60 hover:text-background transition-colors text-sm flex items-center gap-1 group">
                      {link.label}
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-0.5 translate-x-0.5 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-background/10 mb-8" />

        {/* Bottom */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center md:items-start gap-1">
            <p className="text-background/40 text-xs">
              © 2026 СИНТАГМА. Все права защищены.
            </p>
            <a href="https://24zxc.ru" target="_blank" rel="noopener noreferrer" className="text-background/30 text-xs hover:text-background/50 transition-colors">
              Создание сайтов — 24zxc.ru
            </a>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-background/40">
            <Link to="/public-offer" className="hover:text-background/60 transition-colors">
              Условия использования
            </Link>
            <Link to="/student-agreement" className="hover:text-background/60 transition-colors">
              Соглашение для слушателей
            </Link>
            <Link to="/privacy" className="hover:text-background/60 transition-colors">
              Конфиденциальность
            </Link>
            <Link to="/personal-data" className="hover:text-background/60 transition-colors">
              Обработка персональных данных
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}