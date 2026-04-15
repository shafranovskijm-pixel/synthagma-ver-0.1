import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RadioStation {
  id: string;
  name: string;
  stream_url: string;
  logo_url: string | null;
  genre: string | null;
  radioapi_stream_id: number | null;
  sort_order: number;
}

export interface NowPlaying {
  title: string;
  artist: string;
  cover?: string;
}

const STORAGE_KEY = "radio_settings";
const audio = typeof window !== "undefined" ? new Audio() : null;

function getStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSettings(patch: Record<string, unknown>) {
  try {
    const current = getStoredSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {}
}

export function useRadioPlayer() {
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => getStoredSettings().volume ?? 0.7);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load stations once
  useEffect(() => {
    supabase.from("radio_stations").select("*").eq("is_active", true).order("sort_order")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setStations(data as RadioStation[]);
          const stored = getStoredSettings();
          const saved = stored.stationId
            ? data.find((s: any) => s.id === stored.stationId)
            : null;
          setCurrentStation(saved || data[0] as RadioStation);
        }
      });
  }, []);

  // Sync volume to audio element
  useEffect(() => {
    if (audio) audio.volume = volume;
    saveSettings({ volume });
  }, [volume]);

  // Poll RadioAPI for now-playing metadata
  const fetchNowPlaying = useCallback(async (station: RadioStation) => {
    if (!station.radioapi_stream_id) { setNowPlaying(null); return; }
    try {
      const res = await fetch(
        `https://radioapi.me/api/now-playing/${station.radioapi_stream_id}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data?.title || data?.artist) {
        setNowPlaying({
          title: data.title || "Неизвестный трек",
          artist: data.artist || "",
          cover: data.cover_url || data.image_url || undefined,
        });
      }
    } catch {}
  }, []);

  // Start/stop polling
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (playing && currentStation) {
      fetchNowPlaying(currentStation);
      pollRef.current = setInterval(() => fetchNowPlaying(currentStation), 15000);
    } else {
      setNowPlaying(null);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [playing, currentStation, fetchNowPlaying]);

  const play = useCallback((station?: RadioStation) => {
    if (!audio) return;
    const target = station || currentStation;
    if (!target) return;

    if (station && station.id !== currentStation?.id) {
      setCurrentStation(station);
      saveSettings({ stationId: station.id });
      audio.src = station.stream_url;
    } else if (!audio.src || audio.src !== target.stream_url) {
      audio.src = target.stream_url;
    }

    setLoading(true);
    audio.play()
      .then(() => { setPlaying(true); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [currentStation]);

  const pause = useCallback(() => {
    if (!audio) return;
    audio.pause();
    audio.src = ""; // release stream
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  const selectStation = useCallback((station: RadioStation) => {
    saveSettings({ stationId: station.id });
    if (playing) {
      play(station);
    } else {
      setCurrentStation(station);
    }
  }, [playing, play]);

  return {
    stations,
    currentStation,
    playing,
    loading,
    volume,
    setVolume,
    nowPlaying,
    toggle,
    play,
    pause,
    selectStation,
  };
}
