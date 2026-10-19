import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Video, Camera, CheckCircle2, AlertCircle, RefreshCw, UserCheck, Shield, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useVideoIdentification, type VerificationRecord, type FinalTestPhotoChallenge } from "@/hooks/useVideoIdentification";

import { IdentificationPhoto } from '@/hooks/useIdentificationMedia';
import { identificationAssuranceLabel } from '@/lib/identification/contract';

interface VideoIdentificationProps {
  userId: string;
  userName: string;
  organizationId?: string;
  enrollmentId?: string;
  onVerified?: () => void;
  onSubmitted?: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  embedded?: boolean;
  finalTestPhoto?: FinalTestPhotoChallenge;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "verified": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подтверждено</Badge>;
    case "rejected": return <Badge variant="destructive">Отклонено</Badge>;
    case "expired": return <Badge variant="secondary">Истекло</Badge>;
    default: return <Badge variant="outline">На проверке</Badge>;
  }
}

export function VideoIdentification({
  userId, userName, organizationId, enrollmentId, onVerified, onSubmitted, isOpen = false, onOpenChange, embedded = false, finalTestPhoto,
}: VideoIdentificationProps) {
  const vi = useVideoIdentification({ userId, organizationId, enrollmentId, onVerified, onSubmitted, isOpen, embedded, finalTestPhoto });

  if (vi.isLoading) {
    const loadingContent = (
      <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>
    );
    if (embedded) return loadingContent;
    return (
      <Dialog open={isOpen} onOpenChange={() => vi.handleClose(onOpenChange)}>
        <DialogContent className="max-w-lg rounded-2xl">{loadingContent}</DialogContent>
      </Dialog>
    );
  }

  const mainContent = (
    <>
      <div className="mb-4">
        <h3 className="font-display flex items-center gap-2 text-lg font-semibold">
          <Shield className="w-5 h-5 text-primary" />{finalTestPhoto ? 'Фото перед итоговым тестом' : 'Видеоидентификация (ЭИОС)'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {finalTestPhoto ? 'В настройках курса включено новое фото перед каждой попыткой. Оно сохранится вместе с этой попыткой и будет доступно вашей учебной организации.' : 'Отправьте фото для проверки сотрудником учебной организации'}
        </p>
      </div>

      <div className="py-4">
        {vi.historyUnavailable && <div className="text-sm text-destructive p-3">Не удалось подтвердить доступ к идентификации. <Button variant="link" onClick={() => void vi.loadVerificationHistory()}>Повторить</Button></div>}
        {vi.verificationHistory.length > 0 && vi.step !== "history" && (
          <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => vi.setStep("history")}>
            <History className="w-4 h-4" />История идентификаций ({vi.verificationHistory.length})
          </Button>
        )}

        {vi.step !== "success" && vi.step !== "history" && (
          <div className="flex items-center gap-2 mb-6">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${vi.step === "intro" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</div>
            <div className="flex-1 h-1 bg-muted rounded-full">
              <div className={`h-full bg-primary rounded-full transition-all ${vi.step === "intro" ? "w-0" : vi.step === "camera" ? "w-1/2" : "w-full"}`} />
            </div>
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${vi.step === "camera" || vi.step === "confirm" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</div>
            <div className="flex-1 h-1 bg-muted rounded-full">
              <div className={`h-full bg-primary rounded-full transition-all ${vi.step === "confirm" ? "w-full" : "w-0"}`} />
            </div>
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${vi.step === "confirm" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>3</div>
          </div>
        )}

        {vi.step === "history" && (
          <div className="space-y-4">
            {vi.historyTruncated && <p className="text-xs text-muted-foreground">Показаны последние записи; более ранняя история в этот список не вошла.</p>}
            <Button variant="ghost" size="sm" onClick={() => vi.setStep("intro")}>← Назад</Button>
            <ScrollArea className="h-80">
              <div className="space-y-3">
                {vi.verificationHistory.map((record) => (
                  <div key={record.id} className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
                    <IdentificationPhoto scope={vi.identificationScope} record={record.canonical || null} className="w-16 h-16 rounded-lg object-cover" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">{getStatusBadge(record.status)}</div>
                      <p className="text-xs text-muted-foreground">{vi.formatDate(record.created_at)}</p>
                      {record.canonical && <p className="text-xs text-muted-foreground">{identificationAssuranceLabel(record.canonical)}</p>}
                      {record.rejection_reason && <p className="text-xs text-destructive mt-1">Причина: {record.rejection_reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {vi.step === "intro" && (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Video className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">Подтвердите вашу личность</h3>
              <p className="text-muted-foreground text-sm">{finalTestPhoto ? 'Сделайте фото с камеры и подтвердите его. Затем начнётся тест. Пока фото не сохранено, попытка не расходуется.' : 'Фото будет отправлено сотруднику организации. Отправка снимка не означает подтверждение личности.'}</p>
            </div>
            {vi.currentVerification && (
              <div className="bg-muted/50 rounded-xl p-4 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">Текущий статус:</span>
                  {getStatusBadge(vi.currentVerification.status)}
                </div>
                {vi.currentVerification.status === "rejected" && vi.currentVerification.rejection_reason && (
                  <p className="text-sm text-destructive">Причина отклонения: {vi.currentVerification.rejection_reason}</p>
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
            <div className="bg-black/80 text-green-400 text-xs p-2 rounded-lg max-h-32 overflow-y-auto font-mono">
              <p className="text-white font-bold mb-1">Отладка камеры:</p>
              {vi.debugLog.length === 0 ? <p>Ожидание...</p> : vi.debugLog.map((log, i) => <p key={i}>{log}</p>)}
            </div>
            {vi.cameraError && (
              <div className="bg-destructive/10 text-destructive rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /><p className="text-sm">{vi.cameraError}</p>
              </div>
            )}
            <Button className="w-full btn-gradient rounded-xl gap-2" onClick={vi.startCamera} disabled={!finalTestPhoto && (!vi.canSubmit || vi.historyUnavailable)}>
              <Camera className="w-4 h-4" />
              {vi.currentVerification?.status === "rejected" ? "Повторить идентификацию" : "Начать идентификацию"}
            </Button>
          </div>
        )}

        {vi.step === "camera" && (
          <div className="space-y-4">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
              <video ref={vi.videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
              {vi.isCameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                  <SigmaSpinner size="lg" className="text-white mb-2" /><p className="text-white text-sm">Подключение к камере...</p>
                </div>
              )}
              {vi.isVideoReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-64 border-4 border-white/50 rounded-full" />
                </div>
              )}
            </div>
            {vi.cameraError && (
              <div className="bg-destructive/10 text-destructive rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /><p className="text-sm">{vi.cameraError}</p>
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">Расположите ваше лицо в центре кадра</p>
            <Button className="w-full btn-gradient rounded-xl gap-2" onClick={vi.capturePhoto} disabled={!vi.isVideoReady || vi.isCameraLoading}>
              <Camera className="w-4 h-4" />Сделать фото
            </Button>
            <Button variant="outline" className="w-full rounded-xl" onClick={() => { vi.stopCamera(); vi.setStep("intro"); }}>Отмена</Button>
          </div>
        )}

        {vi.step === "confirm" && vi.capturedPhoto && (
          <div className="space-y-4">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
              <img src={vi.capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
            </div>
            <p className="text-center text-sm">{userName}, это вы?</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl gap-2" onClick={vi.retakePhoto} disabled={vi.isUploading || vi.photoLocked}>
                <RefreshCw className="w-4 h-4" />Переснять
              </Button>
              <Button className="flex-1 btn-gradient rounded-xl gap-2" onClick={vi.confirmPhoto} disabled={vi.isUploading}>
                {vi.isUploading ? <><SigmaSpinner size="sm" />Сохранение...</> : <><CheckCircle2 className="w-4 h-4" />Подтвердить</>}
              </Button>
            </div>
            {finalTestPhoto && vi.photoLocked && <p className="text-xs text-muted-foreground">При повторной отправке используется этот же снимок. Чтобы переснять, закройте окно и снова начните проверку.</p>}
          </div>
        )}

        {vi.step === "success" && (
          <div className="text-center space-y-4">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${vi.currentVerification?.status === "verified" ? "bg-green-500/10" : "bg-amber-500/10"}`}>
              <UserCheck className={`w-10 h-10 ${vi.currentVerification?.status === "verified" ? "text-green-500" : "text-amber-500"}`} />
            </div>
            <div>
              <h3 className={`font-semibold text-lg mb-2 ${vi.currentVerification?.status === "verified" ? "text-green-500" : "text-amber-500"}`}>
                {finalTestPhoto ? 'Фото сохранено' : vi.currentVerification?.status === "verified" ? "Идентификация подтверждена!" : "Фото отправлено на проверку"}
              </h3>
              <p className="text-muted-foreground text-sm">
                {finalTestPhoto ? 'Подтверждение сохранено для этой попытки теста.' : vi.currentVerification?.status === "verified" ? "Статус сохранён организацией. Подробнее об источнике записи указано ниже." : "Ожидайте проверки сотрудником организации."}
              </p>
            </div>
            <div className="flex justify-center">
              {finalTestPhoto && vi.currentVerification?.photo_url
                ? <img src={vi.currentVerification.photo_url} alt="Фото перед тестом" className="w-24 h-24 rounded-full object-cover border-4 border-green-500/20" />
                : <IdentificationPhoto scope={vi.identificationScope} record={vi.currentVerification?.canonical || null} className="w-24 h-24 rounded-full object-cover border-4 border-amber-500/20" />}
            </div>
            {vi.currentVerification?.canonical && <p className="text-xs text-muted-foreground">{identificationAssuranceLabel(vi.currentVerification.canonical)}</p>}
            <div className="flex items-center justify-center gap-2">{getStatusBadge(vi.currentVerification?.status || "pending")}</div>
            {vi.currentVerification?.created_at && <p className="text-xs text-muted-foreground">Дата отправки: {vi.formatDate(vi.currentVerification.created_at)}</p>}
            <Button className="w-full rounded-xl" onClick={() => vi.handleClose(onOpenChange)}>Закрыть</Button>
          </div>
        )}
      </div>
      <canvas ref={vi.canvasRef} className="hidden" />
    </>
  );

  if (embedded) return mainContent;
  return (
    <Dialog open={isOpen} onOpenChange={() => vi.handleClose(onOpenChange)}>
      <DialogContent className="max-w-lg rounded-2xl">{mainContent}</DialogContent>
    </Dialog>
  );
}
