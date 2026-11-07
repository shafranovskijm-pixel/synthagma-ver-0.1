import { supabase } from '@/integrations/supabase/client';
import type { VideoPlaybackFailure } from '@/components/video/CourseVideoPlayer';
import { uploadVideoReportScreenshot } from './videoReportScreenshotUpload';

export interface VideoReportContext {
  userId: string;
  courseId: string;
  lessonId: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validVideoReportContext = (context: VideoReportContext) =>
  [context.userId, context.courseId, context.lessonId].every(value => uuid.test(value));
const stages = new Set(['api-load', 'api-create', 'api-call', 'api-play', 'api-pause', 'api-restore', 'api-restrict-rate', 'init', 'media', 'provider-media', 'loading-timeout']);
const backends = new Set(['native', 'hls', 'kinescope']);
const incidentTtl = 15 * 60_000;
type Incident = { id: string; createdAt: number; confirmedAt?: number };
const incidents = new Map<string, Incident>();
const incidentKey = (context: VideoReportContext) => `sintagma:video-report:v1:${context.userId}:${context.courseId}:${context.lessonId}`;
function rememberIncident(key: string, incident: Incident) {
  incidents.set(key, incident);
  try { sessionStorage.setItem(key, JSON.stringify(incident)); } catch { /* In-memory retry still uses the same ID. */ }
}

function knownIncident(context: VideoReportContext) {
  const key = incidentKey(context);
  let incident = incidents.get(key);
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved && uuid.test(saved.id) && typeof saved.createdAt === 'number') incident = saved;
  } catch { /* Private browser storage may be unavailable. */ }
  return incident;
}

/** A recent receipt is kept when the learning shell remounts after a refresh. */
export function getConfirmedVideoReportId(context: VideoReportContext): string | null {
  if (!validVideoReportContext(context)) return null;
  const incident = knownIncident(context);
  return incident && uuid.test(incident.id) && typeof incident.confirmedAt === 'number'
    && Date.now() - incident.confirmedAt < incidentTtl ? incident.id : null;
}

// Store only the request ID/time, never credentials, media URLs, or provider data.
export function videoReportIncident(context: VideoReportContext): Incident {
  const key = incidentKey(context);
  let incident = knownIncident(context);
  const now = Date.now();
  // Never expire an uncertain write: a delayed retry must recover its existing row.
  if (!incident || !uuid.test(incident.id) || !Number.isFinite(incident.createdAt) || now < incident.createdAt ||
    (typeof incident.confirmedAt === 'number' && now - incident.confirmedAt >= incidentTtl)) {
    incident = { id: crypto.randomUUID(), createdAt: now };
  }
  rememberIncident(key, incident);
  return incident;
}

export function videoReportBrowser(userAgent: string): string {
  // An allowlist avoids forwarding arbitrary UA extensions or device identifiers.
  const family = /Edg\//.test(userAgent) ? 'Edge' : /OPR\//.test(userAgent) ? 'Opera' :
    /Firefox\//.test(userAgent) ? 'Firefox' : /(?:CriOS|Chrome)\//.test(userAgent) ? 'Chrome' :
      /Version\/.*Safari\//.test(userAgent) ? 'Safari' : 'Other';
  const versionPattern = family === 'Edge' ? /Edg\/([0-9]{1,3})/ : family === 'Opera' ? /OPR\/([0-9]{1,3})/ :
    family === 'Firefox' ? /Firefox\/([0-9]{1,3})/ : family === 'Chrome' ? /(?:CriOS|Chrome)\/([0-9]{1,3})/ :
      family === 'Safari' ? /Version\/([0-9]{1,3})/ : null;
  const match = versionPattern?.exec(userAgent);
  const platform = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad|iPod/.test(userAgent) ? 'iOS' :
    /Windows/.test(userAgent) ? 'Windows' : /Macintosh/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : 'Other';
  return `${family}${match ? ` ${match[1]}` : ''} / ${platform}`;
}

export function videoReportDiagnostics(context: VideoReportContext, failure: VideoPlaybackFailure, incident: Incident) {
  return {
    kind: 'video_playback', version: 1,
    courseId: context.courseId, lessonId: context.lessonId,
    observedAt: new Date(incident.createdAt).toISOString(),
    backend: backends.has(failure.backend) ? failure.backend : 'unknown',
    stage: stages.has(failure.stage) ? failure.stage : 'unknown',
    // Only standard numeric media/HTTP codes. Free-form provider text can contain secrets.
    code: /^(?:[1-4]|[1-5][0-9]{2})$/.test(String(failure.code)) ? String(failure.code) : null,
    online: navigator.onLine,
  };
}

/** Normal signed-in product access only. Uses the existing support RLS and notifier. */
export async function submitVideoProblemReport(context: VideoReportContext, failure: VideoPlaybackFailure,
  isCurrent: () => boolean = () => true, screenshot?: File) {
  if (!validVideoReportContext(context)) throw new Error('invalid_video_report_context');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user || auth.user.id !== context.userId || !isCurrent()) throw new Error('authentication_required');
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('full_name, organization_id').eq('user_id', auth.user.id).single();
  if (profileError || !profile || !isCurrent()) throw new Error('profile_unavailable');

  const incident = videoReportIncident(context);
  const pageUrl = `https://xn--80aaiswd0ak.xn--p1ai/course/${context.courseId}/learn`;
  const diagnostics = videoReportDiagnostics(context, failure, incident);
  const description = `Не воспроизводится видео урока. Курс: ${context.courseId}. Урок: ${context.lessonId}.`;
  let screenshotReference: string | null = null;
  let alreadyStored = false;
  if (screenshot) {
    // Do not upload another image when an earlier, ambiguous request was stored.
    const {data: previous, error: readError} = await supabase.from('support_requests')
      .select('id, user_id, page_url, description').eq('id', incident.id).eq('user_id', auth.user.id).maybeSingle();
    if (readError || !isCurrent()) throw new Error('support_request_unavailable');
    if (previous) {
      if (previous.id !== incident.id || previous.user_id !== auth.user.id || previous.page_url !== pageUrl || previous.description !== description) {
        throw new Error('support_request_conflict');
      }
      alreadyStored = true;
    } else screenshotReference = await uploadVideoReportScreenshot(auth.user.id, incident.id, screenshot, isCurrent);
  }
  if (!isCurrent()) throw new Error('support_request_context_changed');
  if (!alreadyStored) {
  const { data: stored, error } = await supabase.from('support_requests').insert({
    id: incident.id, user_id: auth.user.id,
    user_name: profile.full_name || null, user_email: auth.user.email || null,
    organization_id: profile.organization_id || null,
    description, browser_info: videoReportBrowser(navigator.userAgent),
    page_url: pageUrl, error_logs: JSON.stringify(diagnostics),
    ...(screenshotReference ? {screenshot_url:screenshotReference} : {}),
  }).select('id').single();
  if (error) {
    if (error.code !== '23505') throw new Error('support_request_not_stored');
    // A PK conflict is success only if RLS lets this actor read its matching report.
    const { data: previous, error: readError } = await supabase.from('support_requests')
      .select('id, user_id, page_url, description, screenshot_url').eq('id', incident.id).eq('user_id', auth.user.id).single();
    if (readError || !previous || previous.id !== incident.id || previous.user_id !== auth.user.id ||
      previous.page_url !== pageUrl || previous.description !== description) throw new Error('support_request_conflict');
    alreadyStored = !!screenshot && previous.screenshot_url !== screenshotReference;
  } else if (stored?.id !== incident.id) throw new Error('support_request_not_stored');
  }

  rememberIncident(incidentKey(context), { ...incident, confirmedAt: Date.now() });
  // Persistence is the success boundary; existing server delivery deduplicates by request ID.
  try {
    await supabase.functions.invoke('notify-support-request', { body: { request_id: incident.id } });
  } catch { /* A saved request remains visible to support when notification delivery is unavailable. */ }
  return { id: incident.id, selectedScreenshotNotAdded: !!screenshot && alreadyStored };
}
