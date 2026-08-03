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
          appearance?: "always" | "execute" | "interaction-only";
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
  /** Cloudflare widget appearance. The default ("always") renders the
   *  familiar visible block. "interaction-only" stays invisible while the
   *  challenge solves itself and only materialises if it genuinely needs a
   *  person, which is the right fit for surfaces where the widget should
   *  not announce itself (login). Shared by several surfaces, so quiet
   *  behaviour is strictly opt-in per mount. */
  appearance?: "always" | "execute" | "interaction-only";
};

export default function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
  appearance = "always",
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
      appearance,
      callback: (token) => onVerifyRef.current(token),
      "expired-callback": () => onExpireRef.current?.(),
      "error-callback": (err) => onErrorRef.current?.(),
    });
  }, [siteKey, appearance]);

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
      {/* interaction-only reserves no space; the widget expands itself in
          the rare case it needs a person. */}
      <Box ref={containerRef} sx={{ minHeight: appearance === "always" ? 65 : 0 }} />
    </>
  );
}
