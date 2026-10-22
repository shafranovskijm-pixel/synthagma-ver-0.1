import { captureOfflineContext, captureOfflineAuthRevision, isOfflineActorCurrent } from '@/utils/courseCache';
/** Also covers observed access changes before React re-renders. Public exports remain anonymous. */
export function captureDocumentOutputFence(): () => void {
    const context = captureOfflineContext(), revision = captureOfflineAuthRevision();
    return () => {
        const current = context ? isOfflineActorCurrent(context.actorId, context.revision) : captureOfflineContext() === null && captureOfflineAuthRevision() === revision;
        if (!current)
            throw new Error('Доступ изменился. Повторно откройте документ перед выгрузкой.');
    };
}
