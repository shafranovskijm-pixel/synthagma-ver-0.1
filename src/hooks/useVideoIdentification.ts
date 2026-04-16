import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VerificationRecord {
  id: string;
  status: "pending" | "verified" | "rejected" | "expired";
  photo_url: string | null;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
}

type Step = "intro" | "camera" | "confirm" | "success" | "history";

interface UseVideoIdentificationProps {
  userId: string;
  organizationId?: string;
  enrollmentId?: string;
  onVerified?: () => void;
  isOpen?: boolean;
  embedded?: boolean;
}

export function useVideoIdentification({
  userId, organizationId, enrollmentId, onVerified, isOpen = false, embedded = false,
}: UseVideoIdentificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [verificationHistory, setVerificationHistory] = useState<VerificationRecord[]>([]);
  const [currentVerification, setCurrentVerification] = useState<VerificationRecord | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    if (isOpen || embedded) loadVerificationHistory();
    return () => { stopCamera(); };
  }, [isOpen, embedded, userId]);

  const loadVerificationHistory = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("video_identifications").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        setVerificationHistory(data as VerificationRecord[]);
        const latest = data[0] as VerificationRecord;
        setCurrentVerification(latest);
        if (latest.status === "verified") setStep("success");
      }
    } catch (error) {
      console.error("Error loading verification history:", error);
    } finally { setIsLoading(false); }
  };

  const startCamera = async () => {
    setDebugLog([]);
    addLog("Начинаем...");
    setCameraError(null);
    setIsCameraLoading(true);
    setIsVideoReady(false);
    setStep("camera");
  };

  useEffect(() => {
    if (step !== "camera" || stream) return;
    let cancelled = false;

    const initCamera = async () => {
      addLog("Ждём рендер video элемента...");
      await new Promise(r => setTimeout(r, 100));
      if (cancelled) return;

      addLog("Проверяем поддержку getUserMedia...");
      if (!navigator.mediaDevices) {
        addLog("ОШИБКА: navigator.mediaDevices отсутствует!");
        setCameraError('navigator.mediaDevices не поддерживается');
        setStep("intro"); setIsCameraLoading(false); return;
      }
      if (!navigator.mediaDevices.getUserMedia) {
        addLog("ОШИБКА: getUserMedia отсутствует!");
        setCameraError('getUserMedia не поддерживается');
        setStep("intro"); setIsCameraLoading(false); return;
      }

      addLog("getUserMedia поддерживается. Запрашиваем камеру...");
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        addLog(`Камера получена! Треков: ${mediaStream.getVideoTracks().length}`);
        if (cancelled) { mediaStream.getTracks().forEach(t => t.stop()); return; }

        const video = videoRef.current;
        addLog(`Video элемент: ${video ? 'найден' : 'НЕ НАЙДЕН!'}`);

        if (video) {
          addLog("Присваиваем srcObject...");
          video.srcObject = mediaStream;
          addLog(`srcObject присвоен: ${video.srcObject ? 'да' : 'нет'}`);
          video.onloadedmetadata = () => {
            addLog("onloadedmetadata сработал");
            video.play().then(() => { addLog("play() успешно!"); setIsVideoReady(true); setIsCameraLoading(false); })
              .catch(e => { addLog(`play() ошибка: ${e.message}`); });
          };
          video.onerror = (e) => { addLog(`video onerror: ${JSON.stringify(e)}`); };
          addLog("Пробуем play() сразу...");
          video.play().then(() => { addLog("Прямой play() успешно!"); setIsVideoReady(true); setIsCameraLoading(false); })
            .catch(e => { addLog(`Прямой play() ошибка: ${e.message}`); });
        }

        setStream(mediaStream);
        setIsCapturing(true);
        setTimeout(() => { if (!cancelled) { addLog("Fallback таймер сработал"); setIsVideoReady(true); setIsCameraLoading(false); } }, 3000);
      } catch (err: any) {
        if (cancelled) return;
        addLog(`ОШИБКА getUserMedia: ${err.name} - ${err.message}`);
        setStep("intro"); setIsCameraLoading(false);
        setCameraError('Камера недоступна: ' + (err.message || err.name || 'неизвестная ошибка'));
      }
    };

    initCamera();
    return () => { cancelled = true; };
  }, [step]);

  const stopCamera = useCallback(() => {
    if (stream) { stream.getTracks().forEach(track => track.stop()); setStream(null); }
    setIsCapturing(false);
  }, [stream]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const photoData = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedPhoto(photoData);
    setStep("confirm");
    setIsVideoReady(false);
    stopCamera();
  };

  const retakePhoto = () => { setCapturedPhoto(null); startCamera(); };

  const confirmPhoto = async () => {
    if (!capturedPhoto) return;
    setIsUploading(true);
    try {
      const response = await fetch(capturedPhoto);
      const blob = await response.blob();
      const fileName = `${userId}/verification_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, blob, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
      await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("user_id", userId);

      let orgId = organizationId;
      if (!orgId) {
        const { data: profileData } = await supabase.from("profiles").select("organization_id").eq("user_id", userId).single();
        orgId = profileData?.organization_id || "";
      }

      const { data: verificationData, error: verificationError } = await supabase
        .from("video_identifications").insert({
          user_id: userId, organization_id: orgId, enrollment_id: enrollmentId || null,
          status: "verified", photo_url: urlData.publicUrl, verified_at: new Date().toISOString(),
          ip_address: "", user_agent: navigator.userAgent,
          device_info: { platform: navigator.platform, language: navigator.language, screenWidth: window.screen.width, screenHeight: window.screen.height },
        }).select().single();
      if (verificationError) throw verificationError;

      setCurrentVerification(verificationData as VerificationRecord);
      setVerificationHistory(prev => [verificationData as VerificationRecord, ...prev]);
      setStep("success");
      toast.success("Идентификация подтверждена! Доступ к курсам открыт.");
      onVerified?.();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Ошибка загрузки. Попробуйте еще раз.");
    } finally { setIsUploading(false); }
  };

  const handleClose = useCallback((onOpenChange?: (open: boolean) => void) => {
    stopCamera();
    setCapturedPhoto(null);
    setStep("intro");
    onOpenChange?.(false);
  }, [stopCamera]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return {
    videoRef, canvasRef, stream, isCapturing, capturedPhoto, isUploading,
    verificationHistory, currentVerification, step, setStep,
    cameraError, isLoading, isCameraLoading, isVideoReady, debugLog,
    startCamera, stopCamera, capturePhoto, retakePhoto, confirmPhoto,
    handleClose, formatDate,
  };
}
