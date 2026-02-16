"use client";

import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import type { DialogProps } from "@mui/material/Dialog";
import type { ReactNode } from "react";

type AppDialogProps = Omit<DialogProps, "children"> & {
  dialogTitle?: ReactNode;
  dialogContent?: ReactNode;
  dialogActions?: ReactNode;
};

export default function AppDialog({
  dialogTitle,
  dialogContent,
  dialogActions,
  ...dialogProps
}: AppDialogProps) {
  return (
    <Dialog fullWidth maxWidth="sm" {...dialogProps}>
      {dialogTitle ? <DialogTitle>{dialogTitle}</DialogTitle> : null}
      {dialogContent ? <DialogContent>{dialogContent}</DialogContent> : null}
      {dialogActions ? <DialogActions>{dialogActions}</DialogActions> : null}
    </Dialog>
  );
}
