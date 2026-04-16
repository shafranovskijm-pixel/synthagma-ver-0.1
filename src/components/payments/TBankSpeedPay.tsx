import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    PaymentIntegration?: {
      init(config: {
        terminalKey: string;
        product: string;
        features: Record<string, any>;
      }): Promise<any>;
    };
  }
}

interface TBankSpeedPayProps {
  terminalKey: string;
  onInitPayment: () => Promise<string | null>; // returns PaymentURL or null
}

export function TBankSpeedPay({ terminalKey, onInitPayment }: TBankSpeedPayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const integrationRef = useRef<any>(null);
  const initedRef = useRef(false);

  const initWidget = useCallback(async () => {
    if (initedRef.current || !window.PaymentIntegration || !containerRef.current) return;
    initedRef.current = true;

    try {
      const integration = await window.PaymentIntegration.init({
        terminalKey,
        product: "eacq",
        features: {
          payment: {},
        },
      });

      integrationRef.current = integration;

      integration.setPaymentStartCallback(async () => {
        const url = await onInitPayment();
        return url || "";
      });

      integration.mount(containerRef.current);
    } catch (err) {
      console.error("TBankSpeedPay init error:", err);
      initedRef.current = false;
    }
  }, [terminalKey, onInitPayment]);

  useEffect(() => {
    // Wait for script to load
    if (window.PaymentIntegration) {
      initWidget();
      return;
    }

    const interval = setInterval(() => {
      if (window.PaymentIntegration) {
        clearInterval(interval);
        initWidget();
      }
    }, 500);

    const timeout = setTimeout(() => clearInterval(interval), 15000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [initWidget]);

  useEffect(() => {
    return () => {
      if (integrationRef.current?.unmount) {
        integrationRef.current.unmount();
      }
      initedRef.current = false;
    };
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Быстрая оплата (СБП, T-Pay, SberPay, Mir Pay):</p>
      <div ref={containerRef} className="min-h-[60px]" />
    </div>
  );
}
