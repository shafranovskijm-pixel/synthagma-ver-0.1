/**
 * Локальный ErrorBoundary для отдельных разделов приложения.
 *
 * В отличие от глобального ErrorBoundary в App.tsx, при крэше показывает
 * fallback ТОЛЬКО внутри обёрнутого роута — остальная часть UI (sidebar,
 * шапка) остаётся живой. Дополнительно даёт кнопку «Перезагрузить раздел»
 * без полной перезагрузки страницы.
 *
 * Использование:
 *   <RouteErrorBoundary section="Конструктор курса">
 *     <CourseBuilderPage />
 *   </RouteErrorBoundary>
 */
import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Название раздела для понятного сообщения */
  section?: string;
  /** Кастомный fallback вместо встроенного */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[RouteErrorBoundary${this.props.section ? `:${this.props.section}` : ""}]`, error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          Раздел не загрузился
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          {this.props.section
            ? `Произошла ошибка в разделе «${this.props.section}». Остальные части кабинета продолжают работать.`
            : "Произошла ошибка. Попробуйте перезагрузить раздел."}
        </p>
        {this.state.error.message && (
          <code className="mt-3 text-xs text-muted-foreground/70 bg-muted px-3 py-1.5 rounded-md max-w-md truncate">
            {this.state.error.message}
          </code>
        )}
        <div className="flex gap-2 mt-6">
          <Button onClick={this.reset} variant="default" className="rounded-xl gap-2">
            <RefreshCw className="w-4 h-4" />
            Перезагрузить раздел
          </Button>
          <Button onClick={() => window.location.reload()} variant="outline" className="rounded-xl">
            Перезагрузить страницу
          </Button>
        </div>
      </div>
    );
  }
}
