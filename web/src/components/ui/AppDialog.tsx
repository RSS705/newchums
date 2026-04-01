"use client";

import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
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
  onClose,
  ...dialogProps
}: AppDialogProps) {
  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} {...dialogProps}>
      {dialogTitle ? (
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>{dialogTitle}</Box>
            {onClose && (
              <IconButton
                aria-label="Close"
                onClick={(e) => (onClose as (event: React.SyntheticEvent, reason: string) => void)?.(e, "closeButton")}
                size="small"
                sx={{ ml: 1, flexShrink: 0 }}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </DialogTitle>
      ) : null}
      {dialogContent ? <DialogContent>{dialogContent}</DialogContent> : null}
      {dialogActions ? <DialogActions>{dialogActions}</DialogActions> : null}
    </Dialog>
  );
}
