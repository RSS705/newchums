"use client";

import Box from "@mui/material/Box";
import Script from "next/script";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (errorCode?: string) => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      remove?: (widgetId: string) => void;
    };
    __newchumsTurnstileLoad?: () => void;
  }
}

const TURNSTILE_LOADER = "__newchumsTurnstileLoad";
const TURNSTILE_SCRIPT = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${TURNSTILE_LOADER}`;

type TurnstileWidgetProps = {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
};

export default function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;
  onErrorRef.current = onError;

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !siteKey || !window.turnstile) return;
    if (widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onVerifyRef.current(token),
      "expired-callback": () => onExpireRef.current?.(),
      "error-callback": (err) => onErrorRef.current?.(),
    });
  }, [siteKey]);

  useLayoutEffect(() => {
    if (!siteKey) return;
    (window as Window)[TURNSTILE_LOADER] = renderWidget;
    return () => {
      delete (window as Window)[TURNSTILE_LOADER];
    };
  }, [siteKey, renderWidget]);

  useEffect(() => {
    if (window.turnstile && siteKey && !widgetIdRef.current) {
      renderWidget();
    }
  }, [siteKey, renderWidget]);

  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (!siteKey) return null;

  return (
    <>
      <link rel="preconnect" href="https://challenges.cloudflare.com" />
      <Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" />
      <Box ref={containerRef} sx={{ minHeight: 65 }} />
    </>
  );
}
