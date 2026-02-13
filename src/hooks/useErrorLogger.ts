import { useEffect, useRef, useCallback } from "react";

interface ErrorLogEntry {
  message: string;
  timestamp: string;
}

const MAX_ERRORS = 10;
const errorLog: ErrorLogEntry[] = [];

let isInitialized = false;

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
    errorLog.push({
      message: `${event.message} (${event.filename}:${event.lineno})`.slice(0, 300),
      timestamp: new Date().toISOString(),
    });
    if (errorLog.length > MAX_ERRORS) errorLog.shift();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
    errorLog.push({
      message: `Unhandled rejection: ${reason}`.slice(0, 300),
      timestamp: new Date().toISOString(),
    });
    if (errorLog.length > MAX_ERRORS) errorLog.shift();
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
