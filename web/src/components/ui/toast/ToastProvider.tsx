"use client";

import Alert, { type AlertColor } from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastState = {
  open: boolean;
  severity: AlertColor;
  message: string;
  /** Bumped for every toast, so a new one restarts the close timer instead of inheriting the old one's. */
  id: number;
};

type ToastContextValue = {
  success: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const initialState: ToastState = {
  open: false,
  severity: "info",
  message: "",
  id: 0,
};

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(initialState);

  const showToast = useCallback((severity: AlertColor, message: string) => {
    setState((previous) => ({ open: true, severity, message, id: previous.id + 1 }));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => showToast("success", message),
      info: (message) => showToast("info", message),
      warning: (message) => showToast("warning", message),
      error: (message) => showToast("error", message),
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
        autoHideDuration={4000}
        onClose={close}
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
