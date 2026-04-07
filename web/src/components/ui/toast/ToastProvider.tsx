"use client";

import Alert, { type AlertColor } from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastState = {
  open: boolean;
  severity: AlertColor;
  message: string;
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
};

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(initialState);

  const showToast = useCallback((severity: AlertColor, message: string) => {
    setState({ open: true, severity, message });
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

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={4000}
        onClose={() => setState((previous) => ({ ...previous, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{
          // Pull above mobile safe-area / browser chrome and keep it from butting against screen edges
          bottom: { xs: "calc(env(safe-area-inset-bottom, 0px) + 16px)", sm: 24 },
          left: { xs: 16, sm: "auto" },
          right: { xs: 16, sm: "auto" },
        }}
      >
        <Alert
          variant="filled"
          severity={state.severity}
          onClose={() => setState((previous) => ({ ...previous, open: false }))}
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
