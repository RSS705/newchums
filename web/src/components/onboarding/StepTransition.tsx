"use client";

import Box from "@mui/material/Box";
import { useEffect, useRef, useState, type ReactNode } from "react";

type StepTransitionProps = {
  stepKey: number;
  direction: "forward" | "back";
  children: ReactNode;
};

export default function StepTransition({
  stepKey,
  direction,
  children,
}: StepTransitionProps) {
  const [visible, setVisible] = useState(false);
  const prevKeyRef = useRef(stepKey);

  useEffect(() => {
    if (stepKey !== prevKeyRef.current) {
      setVisible(false);
      const id = requestAnimationFrame(() => {
        prevKeyRef.current = stepKey;
        setVisible(true);
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(true);
  }, [stepKey]);

  const translateStart = direction === "forward" ? "24px" : "-24px";

  return (
    <Box
      key={stepKey}
      sx={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : `translateX(${translateStart})`,
        transition: "opacity 0.3s ease, transform 0.3s ease",
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Box>
  );
}
