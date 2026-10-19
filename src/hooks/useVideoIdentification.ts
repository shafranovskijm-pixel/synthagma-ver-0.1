import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { captureOfflineContext, isOfflineActorCurrent } from '@/utils/courseCache';
import { captureIdentificationScope, prepareIdentification, submitIdentification, readIdentificationStates, type IdentificationScope } from '@/lib/identification/client';
import { identificationRecords, identificationView, type IdentificationRecord, type IdentificationPreparation } from '@/lib/identification/contract';

export interface VerificationRecord {
  id: string;
  status: "pending" | "verified" | "rejected" | "expired";
  photo_url: string | null;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
  canonical?: IdentificationRecord;
}

type Step = "intro" | "camera" | "confirm" | "success" | "history";
export interface FinalTestPhotoChallenge {
  challengeId: string;
  bucket: 'final-test-photos';
  path: string;
  expiresAt?: string;
}

interface UseVideoIdentificationProps {
  userId: string;
  organizationId?: string;
  enrollmentId?: string;
  onVerified?: () => void;
  onSubmitted?: () => void;
  isOpen?: boolean;
  embedded?: boolean;
  finalTestPhoto?: FinalTestPhotoChallenge;
}

export function useVideoIdentification({
  userId, organizationId, enrollmentId, onVerified, onSubmitted, isOpen = false, embedded = false, finalTestPhoto,
}: UseVideoIdentificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const actor = captureOfflineContext();
  const identityKey = JSON.stringify([actor?.actorId, actor?.revision, userId, organizationId, enrollmentId, isOpen, embedded, finalTestPhoto?.challengeId]);
  const identityRef = useRef(identityKey);
  if (identityRef.current !== identityKey) { identityRef.current = identityKey; generationRef.current++; }
  const captureCurrent = () => {
    const generation = generationRef.current; const context = captureOfflineContext();
    return () => generationRef.current === generation && (!!finalTestPhoto || (!!context && isOfflineActorCurrent(context.actorId, context.revision)));
  };
  const [identificationScope, setIdentificationScope] = useState<IdentificationScope | null>(null);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [historyTruncated,setHistoryTruncated] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const submissionRef = useRef<{photo: string; prepareRequestId: string; submitRequestId: string; prepared?: IdentificationPreparation} | null>(null);
  const submittedPhotoRef = useRef<string | null>(null);
  const [photoLocked, setPhotoLocked] = useState(false);
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
  const [renderIdentity,setRenderIdentity] = useState(identityKey);

  const addLog = (msg: string) => {
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    generationRef.current++;
    setRenderIdentity(identityKey); setIsUploading(false); setStream(null); setIsVideoReady(false);
    setIdentificationScope(null); setCanSubmit(false); setHistoryUnavailable(false);setHistoryTruncated(false);
    if (!finalTestPhoto) { setVerificationHistory([]); setCurrentVerification(null); setCapturedPhoto(null); setStep('intro'); submissionRef.current = null; }
    if (isOpen || embedded) {
      if (finalTestPhoto) {
        setVerificationHistory([]); setCurrentVerification(null); setCapturedPhoto(null);
        submittedPhotoRef.current = null; setPhotoLocked(false);
        setStep('intro'); setIsLoading(false);
      } else { void loadVerificationHistory(); }
    }
    return () => { generationRef.current++; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; };
  }, [identityKey]);

  const loadVerificationHistory = async () => {
    const current = captureCurrent();
    setIsLoading(true); setHistoryUnavailable(false);
    try {
      if (!organizationId) throw new Error('Identification context unavailable');
      const scope = captureIdentificationScope(organizationId,userId,enrollmentId || null,current);
      const state = (await readIdentificationStates(scope,[userId],true))[0];
      if (!current()) return;
      const records = identificationRecords(state).map(identificationView);
      setIdentificationScope(scope); setCanSubmit(state.capabilities.canSubmit);
      setHistoryTruncated(state.historyTruncated);
      setVerificationHistory(records); setCurrentVerification(state.current ? identificationView(state.current) : null);
      if (state.current?.status === 'verified' || state.current?.status === 'pending') setStep('success');
    } catch { if (current()) {setVerificationHistory([]);setCurrentVerification(null);setCanSubmit(false);setHistoryUnavailable(true);} }
    finally { if (current()) setIsLoading(false); }
  };

  const startCamera = async () => {
    if (!finalTestPhoto && (!canSubmit || historyUnavailable)) return;
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
    const cameraCurrent = captureCurrent();

    const initCamera = async () => {
      addLog("Ждём рендер video элемента...");
      await new Promise(r => setTimeout(r, 100));
      if (cancelled || !cameraCurrent()) return;

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
        if (cancelled || !cameraCurrent()) { mediaStream.getTracks().forEach(t => t.stop()); return; }
        addLog(`Камера получена! Треков: ${mediaStream.getVideoTracks().length}`);

        const video = videoRef.current;
        addLog(`Video элемент: ${video ? 'найден' : 'НЕ НАЙДЕН!'}`);

        if (video) {
          addLog("Присваиваем srcObject...");
          video.srcObject = mediaStream;
          addLog(`srcObject присвоен: ${video.srcObject ? 'да' : 'нет'}`);
          video.onloadedmetadata = () => {
            if (cancelled || !cameraCurrent()) return;
            addLog("onloadedmetadata сработал");
            video.play().then(() => { if (cancelled || !cameraCurrent()) return; addLog("play() успешно!"); setIsVideoReady(true); setIsCameraLoading(false); })
              .catch(e => { if (!cancelled && cameraCurrent()) addLog(`play() ошибка: ${e.message}`); });
          };
          video.onerror = (e) => { if (!cancelled && cameraCurrent()) addLog(`video onerror: ${JSON.stringify(e)}`); };
          addLog("Пробуем play() сразу...");
          video.play().then(() => { if (cancelled || !cameraCurrent()) return; addLog("Прямой play() успешно!"); setIsVideoReady(true); setIsCameraLoading(false); })
            .catch(e => { if (!cancelled && cameraCurrent()) addLog(`Прямой play() ошибка: ${e.message}`); });
        }

        setStream(mediaStream);
        streamRef.current = mediaStream;
        setIsCapturing(true);
        setTimeout(() => { if (!cancelled && cameraCurrent()) { addLog("Fallback таймер сработал"); setIsVideoReady(true); setIsCameraLoading(false); } }, 3000);
      } catch (err: any) {
        if (cancelled || !cameraCurrent()) return;
        addLog(`ОШИБКА getUserMedia: ${err.name} - ${err.message}`);
        setStep("intro"); setIsCameraLoading(false);
        setCameraError('Камера недоступна: ' + (err.message || err.name || 'неизвестная ошибка'));
      }
    };

    initCamera();
    return () => { cancelled = true; };
  }, [step]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null; setStream(null);
    setIsCapturing(false);
  }, []);

  const capturePhoto = () => {
    if (!finalTestPhoto && (!canSubmit || historyUnavailable)) return;
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

  const retakePhoto = () => { if (finalTestPhoto && submittedPhotoRef.current) return; submissionRef.current = null; setCapturedPhoto(null); startCamera(); };

  const confirmPhoto = async () => {
    if (!capturedPhoto) return;
    const generation = generationRef.current;
    const current = captureCurrent();
    if (!current() || isUploading) return;
    if (finalTestPhoto) { submittedPhotoRef.current ??= capturedPhoto; setPhotoLocked(true); }
    const submittedPhoto = finalTestPhoto ? submittedPhotoRef.current! : capturedPhoto;
    setIsUploading(true);
    try {
      const response = await fetch(submittedPhoto);
      const blob = await response.blob();
      if (finalTestPhoto) {
        if (generationRef.current !== generation) return;
        let uploadError: unknown = null;
        try {
          const uploaded = await supabase.storage.from(finalTestPhoto.bucket)
            .upload(finalTestPhoto.path, blob, { contentType: 'image/jpeg', upsert: false });
          uploadError = uploaded.error;
        } catch (error) { uploadError = error; }
        if (generationRef.current !== generation) return;
        // A lost upload/completion response may leave the immutable object behind.
        // Only the server can accept that exact challenge-owned object on retry.
        const { data, error } = await supabase.rpc('complete_final_test_photo' as never, { p_challenge_id: finalTestPhoto.challengeId } as never);
        const result = data as { challengeId?: string; completed?: boolean } | null;
        if (error || result?.completed !== true || result.challengeId !== finalTestPhoto.challengeId) throw error || uploadError || new Error('Photo confirmation was not recorded');
        if (generationRef.current !== generation) return;
        setCurrentVerification({ id: finalTestPhoto.challengeId, status: 'verified', photo_url: submittedPhoto,
          created_at: new Date().toISOString(), verified_at: null, rejection_reason: null });
        setStep('success');
        toast.success('Фото сохранено для этой попытки теста');
        onVerified?.();
        return;
      }
      if (!current() || !organizationId || !canSubmit) return;
      const scope = captureIdentificationScope(organizationId,userId,enrollmentId || null,current);
      if (!submissionRef.current || submissionRef.current.photo !== submittedPhoto) submissionRef.current = {photo:submittedPhoto,prepareRequestId:crypto.randomUUID(),submitRequestId:crypto.randomUUID()};
      const submission = submissionRef.current;
      submission.prepared ??= await prepareIdentification(scope,submission.prepareRequestId);
      if (!current()) return;
      const result = await submitIdentification(scope,submission.prepared,blob,submission.submitRequestId);
      if (!current()) return;
      setCurrentVerification(identificationView(result.record));
      setStep('success');
      toast.success('Фото отправлено на проверку организации');
      await loadVerificationHistory();
      if (current()) onSubmitted?.();

    } catch (error) {
      if (!current()) return;
      toast.error(/expired/i.test((error as { message?: string })?.message || '')
        ? 'Время подтверждения истекло. Закройте окно и снова нажмите «Начать тест».'
        : "Не удалось сохранить фото. Попробуйте еще раз.");
    } finally { if (current()) setIsUploading(false); }
  };

  const handleClose = useCallback((onOpenChange?: (open: boolean) => void) => {
    generationRef.current++;
    stopCamera();
    setCapturedPhoto(null);
    setIsUploading(false);
    setStep("intro");
    onOpenChange?.(false);
  }, [stopCamera]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return {
    videoRef, canvasRef, stream, isCapturing, capturedPhoto: renderIdentity === identityKey ? capturedPhoto : null, isUploading,
    photoLocked, identificationScope, historyUnavailable, historyTruncated, canSubmit, loadVerificationHistory,
    verificationHistory: renderIdentity === identityKey ? verificationHistory : [], currentVerification: renderIdentity === identityKey ? currentVerification : null, step, setStep,
    cameraError, isLoading: renderIdentity !== identityKey || isLoading, isCameraLoading, isVideoReady, debugLog: renderIdentity === identityKey ? debugLog : [],
    startCamera, stopCamera, capturePhoto, retakePhoto, confirmPhoto,
    handleClose, formatDate,
  };
}
