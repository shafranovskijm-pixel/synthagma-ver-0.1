import { useEffect, useRef, useState, useCallback } from 'react';
import JsSIP from 'jssip';
import { supabase } from '@/integrations/supabase/client';

export type SoftphoneStatus =
  | 'idle'          // не подключён
  | 'connecting'    // подключаемся к WSS
  | 'registered'    // готов принимать/делать звонки
  | 'calling'       // набор
  | 'ringing'       // входящий
  | 'in_call'       // разговор
  | 'ended'
  | 'failed';

interface SipCreds {
  login: string;
  password: string;
  domain: string;
  wss: string;
}

/**
 * WebRTC-софтфон поверх Novofon (JsSIP).
 * Регистрируется в SIP-сервере, воспроизводит удалённый аудиопоток в <audio>,
 * микрофон гарнитуры используется по умолчанию через getUserMedia.
 */
export function useSoftphone() {
  const uaRef = useRef<JsSIP.UA | null>(null);
  const sessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastCredsRef = useRef<SipCreds | null>(null);
  const [status, setStatus] = useState<SoftphoneStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [remoteNumber, setRemoteNumber] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  // ленивое создание невидимого <audio>
  const ensureAudioEl = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    audioRef.current = el;
    return el;
  }, []);

  const attachSessionHandlers = useCallback((session: any) => {
    sessionRef.current = session;
    session.on('progress', () => setStatus(s => (s === 'ringing' ? s : 'calling')));
    session.on('accepted', () => setStatus('in_call'));
    session.on('confirmed', () => setStatus('in_call'));
    session.on('ended', () => { setStatus('ended'); sessionRef.current = null; setRemoteNumber(null); });
    session.on('failed', (e: any) => {
      setStatus('failed');
      setError(e?.cause || e?.message || 'call failed');
      sessionRef.current = null;
      setRemoteNumber(null);
    });
    session.on('peerconnection', (e: any) => {
      const pc = e.peerconnection as RTCPeerConnection;
      pc.addEventListener('track', (ev) => {
        const el = ensureAudioEl();
        if (ev.streams && ev.streams[0]) el.srcObject = ev.streams[0];
      });
    });
  }, [ensureAudioEl]);

  const connect = useCallback(async () => {
    if (uaRef.current?.isRegistered?.()) return; // уже подключены
    if (uaRef.current) {
      try { uaRef.current.stop(); } catch { /* noop */ }
      uaRef.current = null;
    }
    setStatus('connecting');
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('novofon-sip-credentials', { body: {} });
      if (fnErr) throw fnErr;
      if (!data?.ok) throw new Error(data?.message || data?.error || 'sip credentials unavailable');
      const creds = data as SipCreds & { ok: true };
      lastCredsRef.current = creds;

      console.log('[softphone] connecting', { wss: creds.wss, domain: creds.domain, login: creds.login });

      const socket = new JsSIP.WebSocketInterface(creds.wss);
      const ua = new JsSIP.UA({
        sockets: [socket],
        uri: `sip:${creds.login}@${creds.domain}`,
        password: creds.password,
        display_name: 'Sintagma',
        register: true,
        session_timers: false,
      });
      uaRef.current = ua;
      let registered = false;
      let registrationFailed = false;

      ua.on('connecting', () => console.log('[softphone] ws connecting'));
      ua.on('connected', () => console.log('[softphone] ws connected'));
      ua.on('registered', () => {
        registered = true;
        setError(null);
        setStatus('registered');
        console.log('[softphone] registered');
      });
      ua.on('registrationFailed', (e: any) => {
        registrationFailed = true;
        try { ua.stop(); } catch { /* noop */ }
        if (uaRef.current === ua) uaRef.current = null;
        setStatus('failed');
        const statusCode = e?.response?.status_code;
        const reason = e?.response?.reason_phrase;
        const cause = e?.cause || reason || 'registrationFailed';
        console.warn('[softphone] registrationFailed', { statusCode, reason, cause, e });
        setError(statusCode === 401 ? 'Novofon отклонил SIP логин/пароль' : cause);
      });
      ua.on('disconnected', (e: any) => {
        if (uaRef.current === ua) uaRef.current = null;
        const code = e?.code;
        const reason = e?.reason;
        console.warn('[softphone] disconnected', { code, reason, registered, e });
        if (sessionRef.current) return;
        if (registrationFailed) return;
        if (!registered) {
          // WSS не поднялся — покажем понятную ошибку, а не «idle»
          setStatus('failed');
          setError(`WebSocket не подключился к ${creds.wss}${code ? ` (код ${code}${reason ? ': ' + reason : ''})` : ''}`);
        } else {
          setStatus('idle');
        }
      });
      ua.on('newRTCSession', (e: any) => {
        const session = e.session;
        if (session.direction === 'incoming') {
          setStatus('ringing');
          setRemoteNumber(session.remote_identity?.uri?.user || null);
        }
        attachSessionHandlers(session);
      });

      ua.start();

    } catch (e) {
      uaRef.current = null;
      setStatus('failed');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [attachSessionHandlers]);

  const disconnect = useCallback(() => {
    try { sessionRef.current?.terminate?.(); } catch { /* noop */ }
    try { uaRef.current?.stop(); } catch { /* noop */ }
    uaRef.current = null;
    sessionRef.current = null;
    setStatus('idle');
  }, []);

  const call = useCallback((number: string) => {
    const ua = uaRef.current;
    if (!ua || !ua.isRegistered()) {
      setError('Софтфон не подключён');
      return;
    }
    setError(null);
    setRemoteNumber(number);
    setStatus('calling');
    // Всегда набираем через тот же SIP-домен
    const host = lastCredsRef.current?.domain || (ua as any).configuration.uri.host;
    const target = `sip:${number.replace(/[^\d+]/g, '')}@${host}`;
    const session = ua.call(target, {
      mediaConstraints: { audio: true, video: false },
      rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    });
    attachSessionHandlers(session);
  }, [attachSessionHandlers]);

  const answer = useCallback(() => {
    sessionRef.current?.answer?.({
      mediaConstraints: { audio: true, video: false },
      pcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    });
  }, []);

  const hangup = useCallback(() => {
    try { sessionRef.current?.terminate?.(); } catch { /* noop */ }
    setStatus(uaRef.current?.isRegistered() ? 'registered' : 'idle');
  }, []);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (muted) { session.unmute?.({ audio: true }); setMuted(false); }
    else { session.mute?.({ audio: true }); setMuted(true); }
  }, [muted]);

  const sendDtmf = useCallback((tone: string) => {
    try { sessionRef.current?.sendDTMF?.(tone); } catch { /* noop */ }
  }, []);

  useEffect(() => () => {
    try { uaRef.current?.stop(); } catch { /* noop */ }
    if (audioRef.current) { try { audioRef.current.remove(); } catch { /* noop */ } }
  }, []);

  return { status, error, remoteNumber, muted, connect, disconnect, call, answer, hangup, toggleMute, sendDtmf };
}
