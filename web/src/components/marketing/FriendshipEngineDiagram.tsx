"use client";

import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import type { FriendshipEngineHover } from "@/app/(public)/science-of-friendship/ScienceOfFriendshipContent";

type Props = {
  hoveredItem: FriendshipEngineHover;
  onHoverChange: (item: FriendshipEngineHover) => void;
};

/**
 * Venn-style diagram: three overlapping circles (Proximity, Repetition, Disclosure)
 * with Friendship at the center overlap. SVG for crisp scaling.
 */
export default function FriendshipEngineDiagram({ hoveredItem, onHoverChange }: Props) {
  const theme = useTheme();
  const primaryMain = theme.palette.primary.main;
  const primaryLight = theme.palette.primary.light;
  const labelColor = theme.palette.primary.dark;

  const isHovered = (item: NonNullable<FriendshipEngineHover>) => hoveredItem === item;

  const circleProps = (item: NonNullable<FriendshipEngineHover>, cx: number, cy: number) => ({
    cx,
    cy,
    r: 58,
    fill: primaryLight,
    fillOpacity: isHovered(item) ? 0.35 : 0.2,
    stroke: primaryMain,
    strokeWidth: isHovered(item) ? 2 : 1.5,
    strokeOpacity: isHovered(item) ? 0.9 : 0.6,
  });

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        mb: 6,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: { xs: 320, sm: 420, md: 460 },
          aspectRatio: "1.15",
        }}
      >
        <svg
          viewBox="0 0 240 220"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "100%", display: "block" }}
          aria-label="Diagram showing that friendship grows from proximity, repetition, and disclosure."
          role="img"
        >
          <defs>
            <filter id="badgeShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.25" />
            </filter>
          </defs>
          {/* Three overlapping circles - interactive with linked hover; labels inside groups for hover */}
          <g
            onMouseEnter={() => onHoverChange("proximity")}
            onMouseLeave={() => onHoverChange(null)}
            style={{
              cursor: "pointer",
              transformOrigin: "70px 75px",
              transform: isHovered("proximity") ? "scale(1.06)" : "scale(1)",
              transition: "transform 0.2s ease",
            }}
          >
            <circle
              {...circleProps("proximity", 70, 75)}
              style={{ transition: "fill-opacity 0.2s ease, stroke-width 0.2s ease, stroke-opacity 0.2s ease" }}
            />
            <text
              x="60"
              y="62"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={labelColor}
              style={{
                fontSize: "11px",
                fontWeight: 600,
                fontFamily: "var(--font-plus-jakarta), system-ui, sans-serif",
                letterSpacing: "0.02em",
              }}
            >
              Proximity
            </text>
          </g>
          <g
            onMouseEnter={() => onHoverChange("repetition")}
            onMouseLeave={() => onHoverChange(null)}
            style={{
              cursor: "pointer",
              transformOrigin: "170px 75px",
              transform: isHovered("repetition") ? "scale(1.06)" : "scale(1)",
              transition: "transform 0.2s ease",
            }}
          >
            <circle
              {...circleProps("repetition", 170, 75)}
              style={{ transition: "fill-opacity 0.2s ease, stroke-width 0.2s ease, stroke-opacity 0.2s ease" }}
            />
            <text
              x="180"
              y="62"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={labelColor}
              style={{
                fontSize: "11px",
                fontWeight: 600,
                fontFamily: "var(--font-plus-jakarta), system-ui, sans-serif",
                letterSpacing: "0.02em",
              }}
            >
              Repetition
            </text>
          </g>
          <g
            onMouseEnter={() => onHoverChange("disclosure")}
            onMouseLeave={() => onHoverChange(null)}
            style={{
              cursor: "pointer",
              transformOrigin: "120px 155px",
              transform: isHovered("disclosure") ? "scale(1.06)" : "scale(1)",
              transition: "transform 0.2s ease",
            }}
          >
            <circle
              {...circleProps("disclosure", 120, 155)}
              style={{ transition: "fill-opacity 0.2s ease, stroke-width 0.2s ease, stroke-opacity 0.2s ease" }}
            />
            <text
              x="120"
              y="168"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={labelColor}
              style={{
                fontSize: "11px",
                fontWeight: 600,
                fontFamily: "var(--font-plus-jakarta), system-ui, sans-serif",
                letterSpacing: "0.02em",
              }}
            >
              Disclosure
            </text>
          </g>

          {/* Center Friendship badge - refined pill */}
          <rect
            x="78"
            y="100"
            width="84"
            height="31"
            rx="16"
            fill={primaryMain}
            filter="url(#badgeShadow)"
          />
          <text
            x="120"
            y="116"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={theme.palette.primary.contrastText}
            style={{
              fontSize: "12px",
              fontWeight: 700,
              fontFamily: "var(--font-plus-jakarta), system-ui, sans-serif",
              letterSpacing: "0.03em",
            }}
          >
            Friendship
          </text>
        </svg>
      </Box>
    </Box>
  );
}
