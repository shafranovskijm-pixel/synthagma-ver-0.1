import { SigmaLogo } from "@/components/ui/SigmaLogo";

export function AdminDashboardFooter() {
  return (
    <footer className="border-t border-border bg-card/50 mt-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <SigmaLogo size="sm" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
              Платформа дополнительного профессионального образования
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Платформа</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><a href="/" className="hover:text-foreground transition-colors">Главная</a></li>
              <li><a href="/partner" className="hover:text-foreground transition-colors">Партнёрская программа</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Документы</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><a href="/privacy" className="hover:text-foreground transition-colors">Политика конфиденциальности</a></li>
              <li><a href="/terms" className="hover:text-foreground transition-colors">Пользовательское соглашение</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Синтагма. Все права защищены.</p>
          <a href="/partner" className="text-xs font-medium text-primary hover:underline">
            Стань партнёром — зарабатывай до 25%
          </a>
        </div>
      </div>
    </footer>
  );
}
