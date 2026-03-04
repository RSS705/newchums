"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

/**
 * Venn-style diagram: three overlapping circles (Proximity, Repetition, Disclosure)
 * with Friendship at the center overlap. SVG for crisp scaling.
 */
export default function FriendshipEngineDiagram() {
  const theme = useTheme();
  const primaryMain = theme.palette.primary.main;
  const primaryLight = theme.palette.primary.light;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        mb: 4,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 300,
          aspectRatio: "1.1",
          position: "relative",
        }}
      >
        <svg
          viewBox="0 0 240 220"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "100%" }}
          aria-hidden
        >
          {/* Three overlapping circles - triangular Venn layout */}
          <circle
            cx="70"
            cy="75"
            r="58"
            fill="none"
            stroke={primaryMain}
            strokeWidth="2.5"
            opacity={0.5}
          />
          <circle
            cx="170"
            cy="75"
            r="58"
            fill="none"
            stroke={primaryMain}
            strokeWidth="2.5"
            opacity={0.5}
          />
          <circle
            cx="120"
            cy="155"
            r="58"
            fill="none"
            stroke={primaryMain}
            strokeWidth="2.5"
            opacity={0.5}
          />
          {/* Light fill for each circle to show overlap */}
          <circle cx="70" cy="75" r="58" fill={primaryLight} opacity={0.35} />
          <circle cx="170" cy="75" r="58" fill={primaryLight} opacity={0.35} />
          <circle cx="120" cy="155" r="58" fill={primaryLight} opacity={0.35} />
        </svg>
        {/* Labels positioned over each circle */}
        <Box
          sx={{
            position: "absolute",
            top: "18%",
            left: "12%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <Typography
            variant="caption"
            fontWeight={700}
            sx={{ color: "primary.dark", fontSize: "0.7rem", whiteSpace: "nowrap" }}
          >
            Proximity
          </Typography>
        </Box>
        <Box
          sx={{
            position: "absolute",
            top: "18%",
            right: "12%",
            transform: "translate(50%, -50%)",
          }}
        >
          <Typography
            variant="caption"
            fontWeight={700}
            sx={{ color: "primary.dark", fontSize: "0.7rem", whiteSpace: "nowrap" }}
          >
            Repetition
          </Typography>
        </Box>
        <Box
          sx={{
            position: "absolute",
            bottom: "18%",
            left: "50%",
            transform: "translate(-50%, 50%)",
          }}
        >
          <Typography
            variant="caption"
            fontWeight={700}
            sx={{ color: "primary.dark", fontSize: "0.7rem", whiteSpace: "nowrap" }}
          >
            Disclosure
          </Typography>
        </Box>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            px: 2,
            py: 1,
            borderRadius: 2,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            boxShadow: 2,
          }}
        >
          <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: "0.85rem" }}>
            Friendship
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
