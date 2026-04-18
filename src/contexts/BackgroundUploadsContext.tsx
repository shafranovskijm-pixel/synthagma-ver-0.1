import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { playUploadCompleteSound } from "@/utils/uploadSound";

export type UploadKind = "internal" | "kinescope";
export type UploadStatus = "uploading" | "compressing" | "finalizing" | "done" | "error" | "cancelled";

export interface UploadTask {
  id: string;
  kind: UploadKind;
  lessonId: string;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  fileName: string;
  fileSize: number;
  progress: number; // 0..100
  status: UploadStatus;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  abort: () => void;
  organizationId?: string;
}

interface BackgroundUploadsContextType {
  uploads: UploadTask[];
  registerUpload: (task: Omit<UploadTask, "progress" | "status" | "startedAt">) => string;
  updateUpload: (id: string, patch: Partial<UploadTask>) => void;
  finishUpload: (id: string, opts?: { notify?: boolean }) => void;
  failUpload: (id: string, error: string) => void;
  cancelUpload: (id: string) => void;
  removeUpload: (id: string) => void;
  hasActive: boolean;
}

const Ctx = createContext<BackgroundUploadsContextType | null>(null);

export const useBackgroundUploads = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBackgroundUploads must be used within BackgroundUploadsProvider");
  return ctx;
};

export function BackgroundUploadsProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const uploadsRef = useRef<UploadTask[]>([]);
  uploadsRef.current = uploads;

  const registerUpload = useCallback(
    (task: Omit<UploadTask, "progress" | "status" | "startedAt">) => {
      const full: UploadTask = {
        ...task,
        progress: 0,
        status: "uploading",
        startedAt: Date.now(),
      };
      setUploads((prev) => [...prev, full]);
      return full.id;
    },
    [],
  );

  const updateUpload = useCallback((id: string, patch: Partial<UploadTask>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const insertNotification = useCallback(
    async (task: UploadTask, kind: "success" | "error", message: string) => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId || !task.organizationId) return;
        await supabase.from("org_notifications").insert({
          organization_id: task.organizationId,
          user_id: userId,
          type: "upload_complete",
          title: kind === "success" ? "Видео загружено" : "Ошибка загрузки видео",
          message,
          related_id: task.lessonId,
        } as any);
      } catch {
        /* notification is best-effort */
      }
    },
    [],
  );

  const finishUpload = useCallback(
    (id: string, opts?: { notify?: boolean }) => {
      const task = uploadsRef.current.find((u) => u.id === id);
      if (!task) return;
      const finishedAt = Date.now();
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: "done", progress: 100, finishedAt } : u)),
      );
      if (opts?.notify !== false) {
        const msg = `${task.lessonTitle} — ${task.courseTitle}`;
        toast.success("Видео загружено", { description: msg, duration: 6000 });
        playUploadCompleteSound("success");
        insertNotification(task, "success", msg);
      }
      // auto-remove after 8s so the tray clears
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.id !== id));
      }, 8000);
    },
    [insertNotification],
  );

  const failUpload = useCallback(
    (id: string, error: string) => {
      const task = uploadsRef.current.find((u) => u.id === id);
      if (!task) return;
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: "error", error } : u)),
      );
      const msg = `${task.lessonTitle} — ${task.courseTitle}: ${error}`;
      toast.error("Ошибка загрузки", { description: msg, duration: 8000 });
      playUploadCompleteSound("error");
      insertNotification(task, "error", msg);
    },
    [insertNotification],
  );

  const cancelUpload = useCallback((id: string) => {
    const task = uploadsRef.current.find((u) => u.id === id);
    if (!task) return;
    try {
      task.abort();
    } catch {
      /* ignore */
    }
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: "cancelled" } : u)),
    );
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.id !== id));
    }, 2500);
  }, []);

  // beforeunload guard while uploads are active
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasActive = uploadsRef.current.some(
        (u) => u.status === "uploading" || u.status === "compressing" || u.status === "finalizing",
      );
      if (hasActive) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const hasActive = useMemo(
    () =>
      uploads.some(
        (u) => u.status === "uploading" || u.status === "compressing" || u.status === "finalizing",
      ),
    [uploads],
  );

  const value: BackgroundUploadsContextType = {
    uploads,
    registerUpload,
    updateUpload,
    finishUpload,
    failUpload,
    cancelUpload,
    removeUpload,
    hasActive,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
