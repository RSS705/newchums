import Box from "@mui/material/Box";

const SYMBOL_BG: Record<string, string> = { W: "#F6EFCF", U: "#C4DEF2", B: "#CEC6C2", R: "#F4C1AA", G: "#BFDDC3", C: "#DCD8D3" };

/** Mana cost as small coloured pips ("{2}{W}{U}"), drawn with plain boxes so
 *  there is no symbol font to load. Hybrid and Phyrexian costs show both
 *  letters in a lilac pip. */
export default function ManaCost({ cost, size = 18 }: { cost: string | null; size?: number }) {
  if (!cost) return null;
  const tokens = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (tokens.length === 0) return null;
  return (
    <Box component="span" role="img" aria-label={`Mana cost ${tokens.join(" ")}`} sx={{ display: "inline-flex", gap: "2px", flexWrap: "wrap", verticalAlign: "middle" }}>
      {tokens.map((t, i) => {
        const bg = SYMBOL_BG[t] ?? (t.includes("/") ? "#DED4EE" : "#DCD8D3");
        const label = t.replace(/\//g, "");
        return (
          <Box
            key={`${t}-${i}`}
            component="span"
            aria-hidden
            sx={{
              minWidth: size,
              height: size,
              px: label.length > 1 ? "2px" : 0,
              borderRadius: size,
              bgcolor: bg,
              color: "#222",
              border: "1px solid rgba(0,0,0,0.18)",
              fontSize: label.length > 1 ? size * 0.46 : size * 0.58,
              fontWeight: 800,
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {label}
          </Box>
        );
      })}
    </Box>
  );
}
