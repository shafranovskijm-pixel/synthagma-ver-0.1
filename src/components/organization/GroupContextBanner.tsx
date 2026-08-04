import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { groupFolderPath } from "@/lib/groups/groupContext";

interface GroupContextBannerProps {
  groupId: string;
  returnToGroupId?: string | null;
  courseTitleHint?: string | null;
}

/** Баннер «Контекст группы» с возвратом в рабочее пространство группы. */
export function GroupContextBanner({ groupId, returnToGroupId, courseTitleHint }: GroupContextBannerProps) {
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("student_groups")
        .select("name")
        .eq("id", groupId)
        .maybeSingle();
      if (!cancelled) setName((data as any)?.name || "");
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  const backId = returnToGroupId || groupId;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-2 min-w-0 text-sm">
        <Folder className="w-4 h-4 text-primary shrink-0" />
        <span className="text-muted-foreground">Контекст группы:</span>
        <span className="font-semibold truncate">{name || "…"}</span>
        {courseTitleHint && (
          <span className="text-muted-foreground truncate">· {courseTitleHint}</span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl gap-1.5"
        onClick={() => navigate(groupFolderPath(backId))}
      >
        <ArrowLeft className="w-4 h-4" /> Вернуться в группу
      </Button>
    </div>
  );
}
