import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Video, Camera, CheckCircle2, AlertCircle, Loader2, RefreshCw, UserCheck, Shield } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface VideoIdentificationProps {
  userId: string;
  userName: string;
  onVerified?: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface VerificationStatus {
  isVerified: boolean;
  verifiedAt: string | null;
  photoUrl: string | null;
}

export function VideoIdentification({
  userId,
  userName,
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
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    isVerified: false,
    verifiedAt: null,
    photoUrl: null,
  });
  const [step, setStep] = useState<"intro" | "camera" | "confirm" | "success">("intro");
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkVerificationStatus();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, userId]);

  const checkVerificationStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, avatar_url, updated_at")
        .eq("user_id", userId)
        .single();

      if (data?.avatar_url) {
        setVerificationStatus({
          isVerified: true,
          verifiedAt: data.updated_at,
          photoUrl: data.avatar_url,
        });
        setStep("success");
      }
    } catch (error) {
      console.error("Error checking verification:", error);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCapturing(true);
      setStep("camera");
    } catch (error: any) {
      console.error("Camera error:", error);
      if (error.name === "NotAllowedError") {
        setCameraError("Доступ к камере запрещен. Пожалуйста, разрешите доступ в настройках браузера.");
      } else if (error.name === "NotFoundError") {
        setCameraError("Камера не найдена. Проверьте подключение устройства.");
      } else {
        setCameraError("Не удалось запустить камеру. Попробуйте еще раз.");
      }
    }
  };

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

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const photoData = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedPhoto(photoData);
    setStep("confirm");
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
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("user_id", userId);

      if (updateError) throw updateError;

      setVerificationStatus({
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        photoUrl: urlData.publicUrl,
      });

      setStep("success");
      toast.success("Видеоидентификация пройдена успешно!");
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
          {/* Progress indicator */}
          {step !== "success" && (
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
                Начать идентификацию
              </Button>
            </div>
          )}

          {step === "camera" && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Face guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-64 border-4 border-white/50 rounded-full" />
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Расположите ваше лицо в центре кадра
              </p>
              <Button className="w-full btn-gradient rounded-xl gap-2" onClick={capturePhoto}>
                <Camera className="w-4 h-4" />
                Сделать фото
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
              <div className="w-20 h-20 rounded-full bg-sigma-green/10 flex items-center justify-center mx-auto">
                <UserCheck className="w-10 h-10 text-sigma-green" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-sigma-green mb-2">
                  Идентификация пройдена!
                </h3>
                <p className="text-muted-foreground text-sm">
                  Ваша личность подтверждена. Вы можете продолжить обучение.
                </p>
              </div>
              {verificationStatus.photoUrl && (
                <div className="flex justify-center">
                  <img
                    src={verificationStatus.photoUrl}
                    alt="Verification photo"
                    className="w-24 h-24 rounded-full object-cover border-4 border-sigma-green/20"
                  />
                </div>
              )}
              {verificationStatus.verifiedAt && (
                <p className="text-xs text-muted-foreground">
                  Дата идентификации: {formatDate(verificationStatus.verifiedAt)}
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
