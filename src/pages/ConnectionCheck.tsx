import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Wifi, Download, RefreshCw, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { runConnectionDiagnostics, summarizeDiagnostics, buildDiagnosticsReport, type ProbeResult } from '@/utils/connectionDiagnostics';
import { collectDeviceInfo, buildDeviceInfoReport, type DeviceInfo } from '@/utils/deviceDiagnostics';
import { DeviceInfoCard } from '@/components/diagnostics/DeviceInfoCard';

export default function ConnectionCheck() {
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);

  const run = async () => {
    setRunning(true);
    setDone(false);
    setResults([]);
    setDeviceLoading(true);
    try {
      const [r, d] = await Promise.all([
        runConnectionDiagnostics(),
        collectDeviceInfo(),
      ]);
      setResults(r);
      setDeviceInfo(d);
      setDone(true);
    } finally {
      setRunning(false);
      setDeviceLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = done ? summarizeDiagnostics(results) : null;

  const buildReport = () => {
    const deviceText = deviceInfo ? buildDeviceInfoReport(deviceInfo) : undefined;
    return buildDiagnosticsReport(results, deviceText);
  };

  const downloadReport = () => {
    const text = buildReport();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sintagma-diagnostics-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReport());
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 sm:p-8">
      <Helmet>
        <title>Проверка соединения — Sintagma</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> На главную
        </Link>

        <Card className="p-6 sm:p-8 shadow-elegant">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Wifi className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Проверка соединения</h1>
              <p className="text-sm text-muted-foreground">Помогает понять, почему платформа работает с ошибками</p>
            </div>
          </div>

          {running && (
            <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Проверяем соединение…
            </div>
          )}

          {!running && results.length > 0 && (
            <div className="space-y-2 mb-6">
              {results.map((r) => (
                <ProbeRow key={r.id} probe={r} />
              ))}
            </div>
          )}

          {summary && (
            <div
              className={`rounded-xl p-4 mb-6 border ${
                summary.severity === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : summary.severity === 'warn'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                  : 'bg-destructive/10 border-destructive/30 text-destructive'
              }`}
            >
              <div className="font-semibold mb-1">{summary.headline}</div>
              <div className="text-sm opacity-90">{summary.advice}</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={run} disabled={running} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Проверить ещё раз
            </Button>
            {done && (
              <>
                <Button onClick={downloadReport} variant="default">
                  <Download className="w-4 h-4 mr-2" />
                  Скачать отчёт
                </Button>
                <Button onClick={copyReport} variant="ghost">
                  Копировать отчёт
                </Button>
              </>
            )}
          </div>

          <div className="mt-8 pt-6 border-t text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Если что-то заблокировано:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Скачайте отчёт и отправьте его системному администратору вашей компании.</li>
              <li>Попросите добавить в исключения антивируса/firewall: <code className="px-1 py-0.5 bg-muted rounded">sintagma.com.ru</code>, <code className="px-1 py-0.5 bg-muted rounded">*.supabase.co</code>, <code className="px-1 py-0.5 bg-muted rounded">*.functions.supabase.co</code>.</li>
              <li>Попробуйте отключить VPN или расширения браузера (AdBlock, Kaspersky Protection).</li>
              <li>Проверьте через мобильный интернет — если там работает, значит блокирует именно корпоративная сеть.</li>
            </ol>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProbeRow({ probe }: { probe: ProbeResult }) {
  const Icon =
    probe.status === 'ok' ? CheckCircle2 :
    probe.status === 'blocked' ? XCircle :
    probe.status === 'slow' ? AlertTriangle :
    probe.status === 'error' ? XCircle : Loader2;

  const color =
    probe.status === 'ok' ? 'text-emerald-500' :
    probe.status === 'blocked' || probe.status === 'error' ? 'text-destructive' :
    probe.status === 'slow' ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${color} ${probe.status === 'pending' ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{probe.label}</div>
        {probe.detail && <div className="text-xs text-muted-foreground truncate">{probe.detail}</div>}
      </div>
    </div>
  );
}
