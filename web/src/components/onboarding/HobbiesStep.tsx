"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { validateCleanText } from "@/lib/contentSafety";
import { isDuplicate, nameToSlug } from "@/lib/interestUtils";

export type InterestOption = { id?: string; name: string; slug: string };

const MAX_INTEREST_LENGTH = 50;
const CHIPS_VISIBLE = 12;

type HobbiesStepProps = {
  value: InterestOption[];
  onChange: (items: InterestOption[]) => void;
};

export default function HobbiesStep({ value, onChange }: HobbiesStepProps) {
  const [suggestions, setSuggestions] = useState<InterestOption[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showAll, setShowAll] = useState(false);

  const fetchSuggestions = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) {
      setSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const res = await apiFetch(`/interests?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data.ok && data.interests) {
        setSuggestions(
          data.interests.map((r: { id?: string; name: string; slug: string }) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
          })),
        );
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const debouncedFetch = useMemo(() => {
    let t: ReturnType<typeof setTimeout>;
    return (q: string) => {
      clearTimeout(t);
      t = setTimeout(() => fetchSuggestions(q), 250);
    };
  }, [fetchSuggestions]);

  useEffect(() => {
    if (inputValue) debouncedFetch(inputValue);
    else setSuggestions([]);
  }, [inputValue, debouncedFetch]);

  const addInterest = (option: InterestOption | string) => {
    const item: InterestOption =
      typeof option === "string"
        ? { name: option.trim().replace(/\s+/g, " "), slug: nameToSlug(option) }
        : option;
    if (!item.name?.trim() || !item.slug) return;
    if (item.name.length > MAX_INTEREST_LENGTH) return;
    const hobbyCheck = validateCleanText(item.name, "hobby");
    if (!hobbyCheck.ok) return;
    if (value.some((i) => isDuplicate(i, item))) return;
    onChange([...value, item]);
  };

  const removeInterest = (slug: string) => {
    onChange(value.filter((i) => i.slug !== slug));
  };

  const sorted = useMemo(
    () => [...value].sort((a, b) => a.name.localeCompare(b.name)),
    [value],
  );

  return (
    <Stack spacing={2}>
      <Autocomplete
        freeSolo
        multiple
        filterOptions={(x) => x}
        options={suggestions}
        sx={{
          "& .MuiOutlinedInput-root": { alignItems: "center" },
          "& .MuiInputBase-input": {
            paddingTop: 14,
            paddingBottom: 14,
            lineHeight: 1.4375,
          },
        }}
        value={value}
        inputValue={inputValue}
        onInputChange={(_, v) => setInputValue(v)}
        onChange={(_, newValue) => {
          const filtered = (newValue ?? []).filter(Boolean);
          const last = filtered[filtered.length - 1];
          if (typeof last === "string") addInterest(last);
          else onChange(filtered as InterestOption[]);
        }}
        getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
        isOptionEqualToValue={(opt, val) => {
          if (!opt || !val) return false;
          if (typeof opt === "string" || typeof val === "string") return false;
          return opt.slug === val.slug;
        }}
        loading={suggestionsLoading}
        renderInput={(params) => (
          <Box>
            <Typography
              component="label"
              htmlFor={params.id}
              variant="subtitle1"
              fontWeight={600}
              sx={{ display: "block", mb: 0.625, cursor: "text" }}
            >
              Add hobbies
            </Typography>
            <TextField
              {...params}
              label={undefined}
              placeholder="Type to search or create..."
              fullWidth
              size="medium"
              variant="outlined"
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !inputValue) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            />
          </Box>
        )}
        renderTags={() => null}
      />
      {value.length > 0 ? (
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.5}>
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.9 }}>
              {value.length} {value.length === 1 ? "hobby" : "hobbies"} selected
            </Typography>
            {value.length > CHIPS_VISIBLE && (
              <Typography
                component="button"
                type="button"
                variant="body2"
                onClick={() => setShowAll((v) => !v)}
                sx={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "primary.main",
                  textDecoration: "underline",
                  "&:hover": { color: "primary.dark" },
                }}
              >
                {showAll ? "Show fewer" : `Show all (${value.length})`}
              </Typography>
            )}
          </Stack>
          <Stack direction="row" flexWrap="wrap" gap={1.5} useFlexGap sx={{ py: 0.75 }}>
            {(showAll ? sorted : sorted.slice(0, CHIPS_VISIBLE)).map((item) => (
              <Chip
                key={item.slug}
                label={item.name}
                size="medium"
                color="primary"
                variant="filled"
                onDelete={() => removeInterest(item.slug)}
                sx={{
                  height: 34,
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  "& .MuiChip-label": { px: 1.5, py: 0.5 },
                  "& .MuiChip-deleteIcon": {
                    fontSize: "1.125rem",
                    "&:hover": { color: "primary.dark" },
                  },
                }}
              />
            ))}
          </Stack>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.85 }}>
          Search for hobbies like board games, hiking, photography, cooking...
        </Typography>
      )}
    </Stack>
  );
}
