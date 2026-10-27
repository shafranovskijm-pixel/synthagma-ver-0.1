import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { isCurrentOrganizationAccess } from '@/hooks/useDocumentActionPermissions';
import { issuanceRecordSchema } from '@/lib/educationIssuance/contract';
import { assertIssuanceEligibility, requireIssuanceScope, type EducationIssuanceScope } from '@/lib/educationIssuance/client';
import type { IssuanceRecord } from '@/lib/educationIssuance/types';
import { captureProgramFileScope, createScopedOrgDocumentTransport, ProgramFileError, readRecordedProgramFileVersion } from '@/lib/programFiles';
import { downloadPrivateFile, type PrivateDownloadProgress } from '@/utils/storageHelpers';

type Target = { key: string; documentId: string; versionId: string };
function recordedTarget(record: IssuanceRecord, scope: EducationIssuanceScope, canRead: boolean): Target | null {
  try {
    if (!canRead) return null;
    requireIssuanceScope(scope);
    const parsed = issuanceRecordSchema.safeParse(record);
    if (!parsed.success) return null;
    const row = parsed.data as IssuanceRecord, proof = row.proof;
    if (!row.capabilities.can_read || row.provenance !== 'controlled_issuance' || row.proof_availability !== 'captured' || !proof || !row.frdo_facts
      || row.frdo_facts.program_title !== row.official.specialty_name) return null;
    // This validator checks stored cross-references only; it does not request eligibility for a new issue.
    assertIssuanceEligibility(scope, proof);
    if (row.official.organization_id !== proof.organization_id || row.official.enrollment_id !== proof.enrollment_id
      || row.official.user_id !== proof.user_id || row.official.course_id !== proof.course_id || row.official.group_id !== proof.group_id) return null;
    const documentId = proof.program_ref.file_document_id, versionId = proof.program_ref.file_version_id;
    return { documentId, versionId, key: JSON.stringify([scope.actorId, scope.accessRevision, scope.organizationId, scope.issuanceScope,
      row.official.id, row.revision, row.state_hash, proof.source_hash, documentId, versionId]) };
  } catch { return null; }
}

/** Downloads only the recorded source file; it neither approves programmes nor changes the issued record. */
export function RecordedProgramFileDownload({ record, scope }: { record: IssuanceRecord; scope: EducationIssuanceScope }) {
  const permissions = useStaffPermissions();
  const canRead = isCurrentOrganizationAccess(permissions, scope.organizationId) && permissions.can('documents.read');
  const target = recordedTarget(record, scope, canRead);
  const latest = useRef({ record, scope, canRead, key: target?.key ?? null, epoch: 0 });
  const changed = latest.current.scope !== scope || latest.current.key !== (target?.key ?? null);
  latest.current = { record, scope, canRead, key: target?.key ?? null, epoch: latest.current.epoch + (changed ? 1 : 0) };
  const epoch = latest.current.epoch;
  const mounted = useRef(true);
  const flight = useRef<{ epoch: number; controller: AbortController } | null>(null);
  const [status, setStatus] = useState<{ epoch: number; progress: PrivateDownloadProgress; message: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; flight.current?.controller.abort(); }; }, []);
  useEffect(() => () => {
    if (flight.current?.epoch === epoch) { flight.current.controller.abort(); flight.current = null; }
  }, [epoch]);
  const download = async () => {
    if (!target) return;
    if (flight.current?.epoch === epoch) return;
    flight.current?.controller.abort();
    const task = { epoch, controller: new AbortController() };
    const ensureCurrent = () => {
      const current = latest.current;
      if (!mounted.current || task.controller.signal.aborted || current.epoch !== epoch || current.scope !== scope
        || recordedTarget(current.record, current.scope, current.canRead)?.key !== target.key) throw new ProgramFileError('ACCESS_DENIED');
      requireIssuanceScope(scope);
    };
    const current = () => { try { ensureCurrent(); return true; } catch { return false; } };
    flight.current = task;
    setStatus({ epoch, progress: 'preparing', message: 'Подготавливаем точную версию программы…' });
    try {
      ensureCurrent();
      const fileScope = captureProgramFileScope(scope.organizationId, target.key + ':' + epoch, current);
      if (fileScope.actorId !== scope.actorId || fileScope.accessRevision !== scope.accessRevision) throw new ProgramFileError('ACCESS_DENIED');
      const file = await readRecordedProgramFileVersion(fileScope, target.documentId, target.versionId, task.controller.signal);
      ensureCurrent();
      const transport = createScopedOrgDocumentTransport(fileScope);
      const ok = await downloadPrivateFile('org-documents', file.file_path, file.file_name || 'Программа этой выдачи', {
        signal: task.controller.signal, assertCurrent: ensureCurrent,
        signUrl: input => {
          ensureCurrent();
          if (input.bucket !== 'org-documents' || input.path !== file.file_path) throw new ProgramFileError('SOURCE_CHANGED');
          return transport.signUrl(input);
        },
        onProgress: progress => {
          if (!current()) return;
          const message = progress === 'handed_to_browser' ? 'Файл передан браузеру. Проверьте сохранение на устройстве.'
            : progress === 'downloading' ? 'Скачиваем закреплённую версию программы…'
              : progress === 'preparing' ? 'Подготавливаем точную версию программы…'
                : progress === 'timed_out' ? 'Время ожидания истекло. Повторите скачивание.' : 'Не удалось получить точную версию программы. Повторите скачивание.';
          setStatus({ epoch, progress, message });
        },
      });
      ensureCurrent();
      if (!ok) setStatus(previous => previous?.epoch === epoch ? { ...previous, progress: previous.progress === 'timed_out' ? 'timed_out' : 'failed' } : previous);
    } catch (error) {
      if (!current()) return;
      const message = error instanceof ProgramFileError && error.code === 'ACCESS_DENIED' ? 'Файл программы недоступен с текущими правами.'
        : error instanceof ProgramFileError && error.code === 'SOURCE_CHANGED' ? 'Точную сохранённую версию файла подтвердить не удалось.'
          : 'Не удалось получить файл программы. Повторите скачивание.';
      setStatus({ epoch, progress: 'failed', message });
    } finally { if (flight.current === task) flight.current = null; }
  };
  if (!target) return null;
  const visibleStatus = status?.epoch === epoch ? status : null;
  const busy = visibleStatus?.progress === 'preparing' || visibleStatus?.progress === 'downloading';
  return <div className="space-y-2">
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void download()}>{busy ? 'Получаем программу…' : 'Скачать программу этой выдачи'}</Button>
    {visibleStatus && <p className="text-xs text-muted-foreground" role={visibleStatus.progress === 'failed' || visibleStatus.progress === 'timed_out' ? 'alert' : 'status'}>{visibleStatus.message}</p>}
  </div>;
}
