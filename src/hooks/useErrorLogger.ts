import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ErrorLogEntry {
  message: string;
  timestamp: string;
}

const MAX_ERRORS = 10;
const errorLog: ErrorLogEntry[] = [];

let isInitialized = false;

// Throttle DB logging: at most once per 30 seconds
let lastDbLogTime = 0;
const DB_LOG_INTERVAL = 30000;

async function logErrorToDb(message: string) {
  const now = Date.now();
  if (now - lastDbLogTime < DB_LOG_INTERVAL) return;
  lastDbLogTime = now;

  try {
    // Get current user's organization from profile
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) return;

    await supabase.from("system_diagnostics").insert({
      organization_id: profile.organization_id,
      check_type: "error_log",
      check_name: "Ошибка на клиенте",
      status: "error",
      message: message.slice(0, 500),
      executed_by: user.id,
      details: { source: "useErrorLogger", url: window.location.href },
    });
  } catch {
    // Silently fail - don't recurse on error logging
  }
}

function initErrorCapture() {
  if (isInitialized) return;
  isInitialized = true;

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ")
      .slice(0, 300);

    errorLog.push({ message, timestamp: new Date().toISOString() });
    if (errorLog.length > MAX_ERRORS) errorLog.shift();

    originalConsoleError.apply(console, args);
  };

  window.addEventListener("error", (event) => {
    const msg = `${event.message} (${event.filename}:${event.lineno})`.slice(0, 300);
    errorLog.push({ message: msg, timestamp: new Date().toISOString() });
    if (errorLog.length > MAX_ERRORS) errorLog.shift();

    // Log critical errors to DB
    logErrorToDb(msg);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
    const msg = `Unhandled rejection: ${reason}`.slice(0, 300);
    errorLog.push({ message: msg, timestamp: new Date().toISOString() });
    if (errorLog.length > MAX_ERRORS) errorLog.shift();

    // Log critical errors to DB
    logErrorToDb(msg);
  });
}

export function useErrorLogger() {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initErrorCapture();
      initialized.current = true;
    }
  }, []);

  const getRecentErrors = useCallback((count = 5): ErrorLogEntry[] => {
    return errorLog.slice(-count);
  }, []);

  return { getRecentErrors };
}
