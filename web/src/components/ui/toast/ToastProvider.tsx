"use client";

import Alert, { type AlertColor } from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

/** Optional extras for one toast: a single action button (such as Undo) and how long it stays. */
type ToastOptions = {
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it closes on its own; 4 seconds by default. */
  duration?: number;
};

type ToastState = {
  open: boolean;
  severity: AlertColor;
  message: string;
  action: ToastOptions["action"] | null;
  duration: number;
  /** Bumped for every toast, so a new one restarts the close timer instead of inheriting the old one's. */
  id: number;
};

type ToastContextValue = {
  success: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;

const initialState: ToastState = {
  open: false,
  severity: "info",
  message: "",
  action: null,
  duration: DEFAULT_DURATION,
  id: 0,
};

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(initialState);

  const showToast = useCallback((severity: AlertColor, message: string, options?: ToastOptions) => {
    setState((previous) => ({
      open: true,
      severity,
      message,
      action: options?.action ?? null,
      duration: options?.duration ?? DEFAULT_DURATION,
      id: previous.id + 1,
    }));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message, options) => showToast("success", message, options),
      info: (message, options) => showToast("info", message, options),
      warning: (message, options) => showToast("warning", message, options),
      error: (message, options) => showToast("error", message, options),
    }),
    [showToast],
  );

  const close = () => setState((previous) => ({ ...previous, open: false }));

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={state.id}
        open={state.open}
        autoHideDuration={state.duration}
        // A click elsewhere closes a plain toast, as it always has, but not one
        // with an action: the Undo on it has to stay reachable.
        onClose={(_, reason) => { if (reason === "clickaway" && state.action) return; close(); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{
          // Pull above mobile safe-area / browser chrome and keep it from butting against screen edges.
          // On xs, span the viewport with side gutters and clear the default centering transform so
          // the snackbar isn't pushed off-screen by translateX(-50%). A page with its own bar pinned
          // to the bottom of a phone screen sets --toast-bottom-offset to its height, so a toast
          // sits above the bar instead of covering it.
          bottom: { xs: "calc(env(safe-area-inset-bottom, 0px) + 16px + var(--toast-bottom-offset, 0px))", sm: 24 },
          left: { xs: 16, sm: "50%" },
          right: { xs: 16, sm: "auto" },
          transform: { xs: "none", sm: "translateX(-50%)" },
        }}
      >
        <Alert
          variant="filled"
          severity={state.severity}
          onClose={close}
          action={state.action ? (
            <Button
              color="inherit"
              size="small"
              onClick={() => { state.action?.onClick(); close(); }}
              sx={{ textTransform: "none", fontWeight: 800, minHeight: 36 }}
            >
              {state.action.label}
            </Button>
          ) : undefined}
          sx={{
            width: "100%",
            maxWidth: { sm: 480 },
            borderRadius: 2,
            boxShadow: 6,
            alignItems: "center",
          }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return context;
}
