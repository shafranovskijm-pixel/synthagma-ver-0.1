import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
    // Log to database for production monitoring
    this.logErrorToDb(error, errorInfo);
  }

  private async logErrorToDb(error: Error, errorInfo: ErrorInfo) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.organization_id) return;
      await supabase.from("system_diagnostics").insert({
        organization_id: profile.organization_id,
        check_type: "error_boundary",
        check_name: error.name || "Runtime Error",
        status: "error",
        message: `${error.message}\n${errorInfo.componentStack?.slice(0, 300) || ""}`.slice(0, 500),
        executed_by: user.id,
        details: { url: window.location.href, stack: error.stack?.slice(0, 500) },
      });
    } catch { /* silent */ }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-card p-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="text-xl font-bold">Произошла ошибка</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "Неизвестная ошибка в приложении"}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Попробовать снова
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
              >
                Перезагрузить
              </button>
            </div>
            {this.state.error && (
              <details className="text-left mt-4">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Технические детали
                </summary>
                <pre className="mt-2 p-3 rounded-lg bg-secondary text-xs font-mono overflow-auto max-h-32 text-muted-foreground">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
