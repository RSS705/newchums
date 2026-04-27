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
  // While settled (no animation in progress), drop transform + will-change
  // entirely. A persistent translateX/will-change promotes the box to its own
  // compositor layer, which on Blink/WebKit swaps subpixel-AA text for
  // grayscale-AA and can leave glyphs on fractional pixel boundaries, making
  // form text and inputs look soft compared to the rest of the app.
  const [settled, setSettled] = useState(false);
  const prevKeyRef = useRef(stepKey);

  useEffect(() => {
    if (stepKey !== prevKeyRef.current) {
      setVisible(false);
      setSettled(false);
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
      onTransitionEnd={(e) => {
        if (e.currentTarget === e.target && e.propertyName === "transform") {
          setSettled(true);
        }
      }}
      sx={{
        opacity: visible ? 1 : 0,
        transform: settled
          ? "none"
          : visible
            ? "translateX(0)"
            : `translateX(${translateStart})`,
        transition: settled
          ? "none"
          : "opacity 0.3s ease, transform 0.3s ease",
        willChange: settled ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </Box>
  );
}
