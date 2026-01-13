import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Video, Camera, CheckCircle2, AlertCircle, Loader2, RefreshCw, UserCheck, Shield, History } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface VideoIdentificationProps {
  userId: string;
  userName: string;
  organizationId?: string;
  enrollmentId?: string;
  onVerified?: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface VerificationRecord {
  id: string;
  status: "pending" | "verified" | "rejected" | "expired";
  photo_url: string | null;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
}

export function VideoIdentification({
  userId,
  userName,
  organizationId,
  enrollmentId,
  onVerified,
  isOpen = false,
  onOpenChange,
}: VideoIdentificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [verificationHistory, setVerificationHistory] = useState<VerificationRecord[]>([]);
  const [currentVerification, setCurrentVerification] = useState<VerificationRecord | null>(null);
  const [step, setStep] = useState<"intro" | "camera" | "confirm" | "success" | "history">("intro");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadVerificationHistory();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, userId]);

  const loadVerificationHistory = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("video_identifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setVerificationHistory(data as VerificationRecord[]);
        const latest = data[0] as VerificationRecord;
        setCurrentVerification(latest);
        
        if (latest.status === "verified") {
          setStep("success");
        }
      }
    } catch (error) {
      console.error("Error loading verification history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraLoading(true);
    setIsVideoReady(false);
    setStep("camera");
    
    try {
      // Простая проверка поддержки - как в вашем коде
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia не поддерживается');
      }
      
      // Простой запрос камеры - максимальная совместимость
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: false 
      });
      
      console.log("Камера готова. Треков:", mediaStream.getVideoTracks().length);
      setStream(mediaStream);
      setIsCapturing(true);
      
      // Сразу подключаем к video элементу
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(e => console.warn("Play failed:", e));
      }
      
    } catch (err: any) {
      console.error("Камера/микрофон недоступны:", err);
      setStep("intro");
      setIsCameraLoading(false);
      setCameraError('Камера недоступна: ' + (err.message || err.name || 'неизвестная ошибка'));
    }
  };
  
  // Подключаем stream к video когда оба готовы
  useEffect(() => {
    if (stream && videoRef.current && step === "camera") {
      const video = videoRef.current;
      video.srcObject = stream;
      
      const handleReady = () => {
        console.log("Видео готово");
        setIsVideoReady(true);
        setIsCameraLoading(false);
      };
      
      video.onloadeddata = handleReady;
      video.oncanplay = handleReady;
      video.onplaying = handleReady;
      
      video.play().catch(e => console.warn("Play error:", e));
      
      // Fallback - если события не сработали за 2 сек
      const fallback = setTimeout(() => {
        if (!isVideoReady && stream) {
          console.log("Fallback: видео готово");
          setIsVideoReady(true);
          setIsCameraLoading(false);
        }
      }, 2000);
      
      return () => {
        clearTimeout(fallback);
        video.onloadeddata = null;
        video.oncanplay = null;
        video.onplaying = null;
      };
    }
  }, [stream, step, isVideoReady]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCapturing(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    // Mirror the image horizontally to match the preview
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Reset transform
    context.setTransform(1, 0, 0, 1, 0, 0);

    const photoData = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedPhoto(photoData);
    setStep("confirm");
    setIsVideoReady(false);
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const confirmPhoto = async () => {
    if (!capturedPhoto) return;

    setIsUploading(true);
    try {
      // Convert base64 to blob
      const response = await fetch(capturedPhoto);
      const blob = await response.blob();

      const fileName = `${userId}/verification_${Date.now()}.jpg`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Update profile
      await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("user_id", userId);

      // Get organization_id from profile if not provided
      let orgId = organizationId;
      if (!orgId) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", userId)
          .single();
        orgId = profileData?.organization_id || "";
      }

      // Create verification record in database
      const { data: verificationData, error: verificationError } = await supabase
        .from("video_identifications")
        .insert({
          user_id: userId,
          organization_id: orgId,
          enrollment_id: enrollmentId || null,
          status: "pending",
          photo_url: urlData.publicUrl,
          ip_address: "", // Would need a service to get real IP
          user_agent: navigator.userAgent,
          device_info: {
            platform: navigator.platform,
            language: navigator.language,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
          },
        })
        .select()
        .single();

      if (verificationError) throw verificationError;

      setCurrentVerification(verificationData as VerificationRecord);
      setVerificationHistory(prev => [verificationData as VerificationRecord, ...prev]);

      setStep("success");
      toast.success("Фото для идентификации отправлено на проверку!");
      onVerified?.();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Ошибка загрузки. Попробуйте еще раз.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    setCapturedPhoto(null);
    setStep("intro");
    onOpenChange?.(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подтверждено</Badge>;
      case "rejected":
        return <Badge variant="destructive">Отклонено</Badge>;
      case "expired":
        return <Badge variant="secondary">Истекло</Badge>;
      default:
        return <Badge variant="outline">На проверке</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg rounded-2xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Видеоидентификация (ЭИОС)
          </DialogTitle>
          <DialogDescription>
            Подтверждение личности в соответствии с требованиями законодательства об электронной информационно-образовательной среде
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* History button */}
          {verificationHistory.length > 0 && step !== "history" && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 gap-2"
              onClick={() => setStep("history")}
            >
              <History className="w-4 h-4" />
              История идентификаций ({verificationHistory.length})
            </Button>
          )}

          {/* Progress indicator */}
          {step !== "success" && step !== "history" && (
            <div className="flex items-center gap-2 mb-6">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step === "intro" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>1</div>
              <div className="flex-1 h-1 bg-muted rounded-full">
                <div className={`h-full bg-primary rounded-full transition-all ${
                  step === "intro" ? "w-0" : step === "camera" ? "w-1/2" : "w-full"
                }`} />
              </div>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step === "camera" ? "bg-primary text-primary-foreground" : 
                step === "confirm" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>2</div>
              <div className="flex-1 h-1 bg-muted rounded-full">
                <div className={`h-full bg-primary rounded-full transition-all ${
                  step === "confirm" ? "w-full" : "w-0"
                }`} />
              </div>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step === "confirm" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>3</div>
            </div>
          )}

          {/* History view */}
          {step === "history" && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setStep("intro")}>
                ← Назад
              </Button>
              <ScrollArea className="h-80">
                <div className="space-y-3">
                  {verificationHistory.map((record) => (
                    <div key={record.id} className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
                      {record.photo_url && (
                        <img
                          src={record.photo_url}
                          alt="Verification"
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(record.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(record.created_at)}
                        </p>
                        {record.rejection_reason && (
                          <p className="text-xs text-destructive mt-1">
                            Причина: {record.rejection_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Step content */}
          {step === "intro" && (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Video className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Подтвердите вашу личность</h3>
                <p className="text-muted-foreground text-sm">
                  В соответствии с требованиями законодательства РФ об образовании, необходимо подтвердить вашу личность для доступа к электронной информационно-образовательной среде (ЭИОС).
                </p>
              </div>
              
              {/* Current status */}
              {currentVerification && (
                <div className="bg-muted/50 rounded-xl p-4 text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">Текущий статус:</span>
                    {getStatusBadge(currentVerification.status)}
                  </div>
                  {currentVerification.status === "rejected" && currentVerification.rejection_reason && (
                    <p className="text-sm text-destructive">
                      Причина отклонения: {currentVerification.rejection_reason}
                    </p>
                  )}
                </div>
              )}

              <div className="bg-muted/50 rounded-xl p-4 text-left space-y-2">
                <p className="text-sm font-medium">Как пройти идентификацию:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>1. Разрешите доступ к камере</li>
                  <li>2. Сфотографируйте ваше лицо</li>
                  <li>3. Подтвердите фото</li>
                </ul>
              </div>
              {cameraError && (
                <div className="bg-destructive/10 text-destructive rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{cameraError}</p>
                </div>
              )}
              <Button className="w-full btn-gradient rounded-xl gap-2" onClick={startCamera}>
                <Camera className="w-4 h-4" />
                {currentVerification?.status === "rejected" ? "Повторить идентификацию" : "Начать идентификацию"}
              </Button>
            </div>
          )}

          {step === "camera" && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                {/* Loading indicator */}
                {(isCameraLoading || !isVideoReady) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
                    <Loader2 className="w-8 h-8 animate-spin text-white mb-2" />
                    <p className="text-white text-sm">
                      {isCameraLoading ? "Подключение к камере..." : "Загрузка видео..."}
                    </p>
                  </div>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                  // @ts-ignore - for iOS/Safari compatibility
                  webkit-playsinline="true"
                  // @ts-ignore - for older browsers
                  x-webkit-airplay="allow"
                />
                {/* Face guide overlay */}
                {isVideoReady && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-64 border-4 border-white/50 rounded-full" />
                  </div>
                )}
              </div>
              {cameraError && (
                <div className="bg-destructive/10 text-destructive rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{cameraError}</p>
                </div>
              )}
              <p className="text-center text-sm text-muted-foreground">
                Расположите ваше лицо в центре кадра
              </p>
              <Button 
                className="w-full btn-gradient rounded-xl gap-2" 
                onClick={capturePhoto}
                disabled={!isVideoReady || isCameraLoading}
              >
                <Camera className="w-4 h-4" />
                Сделать фото
              </Button>
              <Button 
                variant="outline" 
                className="w-full rounded-xl" 
                onClick={() => {
                  stopCamera();
                  setStep("intro");
                }}
              >
                Отмена
              </Button>
            </div>
          )}

          {step === "confirm" && capturedPhoto && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                <img
                  src={capturedPhoto}
                  alt="Captured"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-center text-sm">
                {userName}, это вы?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl gap-2"
                  onClick={retakePhoto}
                  disabled={isUploading}
                >
                  <RefreshCw className="w-4 h-4" />
                  Переснять
                </Button>
                <Button
                  className="flex-1 btn-gradient rounded-xl gap-2"
                  onClick={confirmPhoto}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Подтвердить
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-4">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${
                currentVerification?.status === "verified" 
                  ? "bg-green-500/10" 
                  : "bg-amber-500/10"
              }`}>
                <UserCheck className={`w-10 h-10 ${
                  currentVerification?.status === "verified" 
                    ? "text-green-500" 
                    : "text-amber-500"
                }`} />
              </div>
              <div>
                <h3 className={`font-semibold text-lg mb-2 ${
                  currentVerification?.status === "verified" 
                    ? "text-green-500" 
                    : "text-amber-500"
                }`}>
                  {currentVerification?.status === "verified" 
                    ? "Идентификация подтверждена!" 
                    : "Фото отправлено на проверку"}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {currentVerification?.status === "verified" 
                    ? "Ваша личность подтверждена. Вы можете продолжить обучение."
                    : "Ожидайте подтверждения от организации. Обычно это занимает до 24 часов."}
                </p>
              </div>
              {currentVerification?.photo_url && (
                <div className="flex justify-center">
                  <img
                    src={currentVerification.photo_url}
                    alt="Verification photo"
                    className={`w-24 h-24 rounded-full object-cover border-4 ${
                      currentVerification.status === "verified" 
                        ? "border-green-500/20" 
                        : "border-amber-500/20"
                    }`}
                  />
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                {getStatusBadge(currentVerification?.status || "pending")}
              </div>
              {currentVerification?.created_at && (
                <p className="text-xs text-muted-foreground">
                  Дата отправки: {formatDate(currentVerification.created_at)}
                </p>
              )}
              <Button className="w-full rounded-xl" onClick={handleClose}>
                Закрыть
              </Button>
            </div>
          )}
        </div>

        {/* Hidden canvas for capturing photo */}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
