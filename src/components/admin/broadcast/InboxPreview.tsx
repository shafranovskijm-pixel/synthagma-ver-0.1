import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, Monitor, Mail } from "lucide-react";

type Client = "gmail" | "mailru" | "outlook";
type Device = "desktop" | "mobile";

interface Props {
  subject: string;
  fromName: string;
  fromEmail: string;
  html: string;
  preheader?: string;
}

const CLIENT_META: Record<Client, { label: string; bg: string; accent: string; chrome: string }> = {
  gmail:   { label: "Gmail",   bg: "#ffffff", accent: "#1a73e8", chrome: "#f6f8fc" },
  mailru:  { label: "Mail.ru", bg: "#ffffff", accent: "#005ff9", chrome: "#f5f5f7" },
  outlook: { label: "Outlook", bg: "#ffffff", accent: "#0078d4", chrome: "#f3f2f1" },
};

export function InboxPreview({ subject, fromName, fromEmail, html, preheader }: Props) {
  const [client, setClient] = useState<Client>("gmail");
  const [device, setDevice] = useState<Device>("desktop");
  const meta = CLIENT_META[client];
  const width = device === "mobile" ? 360 : 720;

  // Эмуляция inbox-чанка (превью в списке писем)
  const previewLine = (preheader || stripTags(html).slice(0, 120) || "—");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {(Object.keys(CLIENT_META) as Client[]).map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={client === c ? "default" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => setClient(c)}
            >
              {CLIENT_META[c].label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            type="button"
            size="sm"
            variant={device === "desktop" ? "default" : "ghost"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="w-3 h-3" /> Desktop
          </Button>
          <Button
            type="button"
            size="sm"
            variant={device === "mobile" ? "default" : "ghost"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setDevice("mobile")}
          >
            <Smartphone className="w-3 h-3" /> Mobile
          </Button>
        </div>
      </div>

      {/* Inbox list-row preview (как в списке писем) */}
      <div
        className="rounded-lg border overflow-hidden text-sm"
        style={{ background: meta.chrome }}
      >
        <div className="px-4 py-3 flex items-start gap-3 bg-background border-b">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
            style={{ background: meta.accent }}
          >
            {(fromName || fromEmail).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold truncate">{fromName || fromEmail || "Отправитель"}</div>
              <div className="text-xs text-muted-foreground shrink-0">сейчас</div>
            </div>
            <div className="font-medium truncate">{subject || "(без темы)"}</div>
            <div className="text-xs text-muted-foreground truncate">{previewLine}</div>
          </div>
        </div>
      </div>

      {/* Email body preview */}
      <div
        className="rounded-lg border overflow-hidden mx-auto transition-all"
        style={{ background: meta.bg, maxWidth: width, width: "100%" }}
      >
        <div className="px-4 py-2 flex items-center gap-2 border-b" style={{ background: meta.chrome }}>
          <Mail className="w-4 h-4" style={{ color: meta.accent }} />
          <span className="text-xs font-medium">{meta.label} {device === "mobile" ? "Mobile" : "Web"}</span>
        </div>
        <div className="px-4 py-3 border-b text-xs text-muted-foreground space-y-0.5">
          <div><b>От:</b> {fromName ? `${fromName} <${fromEmail}>` : fromEmail || "—"}</div>
          <div><b>Тема:</b> {subject || "(без темы)"}</div>
        </div>
        <iframe
          title="email-preview"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;background:${meta.bg}}img{max-width:100%;height:auto}a{color:${meta.accent}}</style></head><body>${html}</body></html>`}
          style={{ width: "100%", minHeight: 400, border: "none", display: "block", background: meta.bg }}
          sandbox=""
        />
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Это эмуляция отображения. Реальные клиенты (особенно Outlook) могут вырезать часть CSS — для критичных рассылок проверьте в Litmus или на тестовом ящике.
      </p>
    </div>
  );
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
