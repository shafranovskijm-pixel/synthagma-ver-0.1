import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, FileX, FileCheck2 } from "lucide-react";

type State =
  | { status: "loading" }
  | { status: "ready"; fileUrl: string; name: string }
  | { status: "error"; reason: string };

const REASON_LABEL: Record<string, string> = {
  not_found: "Ссылка не найдена",
  inactive: "Ссылка отозвана",
  expired: "Срок действия ссылки истёк",
  limit_reached: "Достигнут лимит скачиваний",
};

export default function DocumentSharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", reason: "not_found" });
      return;
    }
    (async () => {
      try {
        const { data: validation, error } = await supabase
          .rpc("validate_and_track_share_link", { _token: token });
        if (error) throw error;
        const row = Array.isArray(validation) ? validation[0] : validation;
        if (!row || !row.is_valid) {
          setState({ status: "error", reason: row?.reason || "not_found" });
          return;
        }
        const { data: doc, error: docErr } = await supabase
          .from("org_documents")
          .select("name, file_url")
          .eq("id", row.document_id)
          .maybeSingle();
        if (docErr || !doc?.file_url) {
          setState({ status: "error", reason: "not_found" });
          return;
        }
        setState({ status: "ready", fileUrl: doc.file_url, name: doc.name });
      } catch {
        setState({ status: "error", reason: "not_found" });
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          {state.status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground">Проверяем ссылку…</p>
            </>
          )}
          {state.status === "error" && (
            <>
              <FileX className="w-10 h-10 mx-auto text-destructive" />
              <h2 className="text-xl font-semibold">Документ недоступен</h2>
              <p className="text-muted-foreground">
                {REASON_LABEL[state.reason] || "Ссылка недействительна"}
              </p>
            </>
          )}
          {state.status === "ready" && (
            <>
              <FileCheck2 className="w-10 h-10 mx-auto text-primary" />
              <h2 className="text-xl font-semibold">{state.name}</h2>
              <p className="text-muted-foreground text-sm">
                Документ готов к скачиванию
              </p>
              <Button
                size="lg"
                className="w-full"
                onClick={() => window.open(state.fileUrl, "_blank")}
              >
                <Download className="w-4 h-4 mr-2" />
                Скачать документ
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
