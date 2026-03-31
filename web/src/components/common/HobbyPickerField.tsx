"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { apiFetch } from "@/lib/apiClient";
import { validateCleanText } from "@/lib/contentSafety";
import { isDuplicate, nameToSlug } from "@/lib/interestUtils";

export type HobbyOption = { id?: string; name: string; slug: string };

const MAX_NAME_LENGTH = 50;
const DEBOUNCE_MS = 250;

type HobbyPickerFieldProps = {
  value: HobbyOption[];
  onChange: (items: HobbyOption[]) => void;
  /** Label shown above the input. Default: "Hobbies" */
  label?: string;
  /** Placeholder text inside the input */
  placeholder?: string;
  /** Show error styling + helper text */
  error?: string | null;
  /** Callback when a hobby is rejected (e.g. too long, content policy). */
  onReject?: (reason: string) => void;
  /** Max chips to show before collapsing. 0 = show all. Default: 0 (show all) */
  collapsedCount?: number;
};

export default function HobbyPickerField({
  value,
  onChange,
  label = "Hobbies",
  placeholder = "Type to search or create...",
  error,
  onReject,
  collapsedCount = 0,
}: HobbyPickerFieldProps) {
  const [suggestions, setSuggestions] = useState<HobbyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showAll, setShowAll] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Keep a stable ref to current value so addItem can read latest without re-creating
  const valueRef = useRef(value);
  valueRef.current = value;

  const fetchSuggestions = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await apiFetch(`/interests?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data.ok && data.interests) {
        const seen = new Set<string>();
        const deduped: HobbyOption[] = [];
        for (const r of data.interests as HobbyOption[]) {
          if (seen.has(r.slug)) continue;
          seen.add(r.slug);
          deduped.push({ id: r.id, name: r.name, slug: r.slug });
        }
        setSuggestions(deduped);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (inputValue.trim()) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(inputValue), DEBOUNCE_MS);
    } else {
      setSuggestions([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [inputValue, fetchSuggestions]);

  const addItem = useCallback((option: HobbyOption | string) => {
    const item: HobbyOption =
      typeof option === "string"
        ? { name: option.trim().replace(/\s+/g, " "), slug: nameToSlug(option) }
        : option;
    if (!item.name?.trim() || !item.slug) return;
    if (item.name.length > MAX_NAME_LENGTH) {
      onReject?.(`Hobby must be ${MAX_NAME_LENGTH} characters or less`);
      return;
    }
    const check = validateCleanText(item.name, "hobby");
    if (!check.ok) {
      onReject?.(check.reason ?? "That hobby name isn't allowed.");
      return;
    }
    if (valueRef.current.some((i) => isDuplicate(i, item))) return;
    onChange([...valueRef.current, item]);
    setInputValue("");
    clearTimeout(debounceRef.current);
    setSuggestions([]);
  }, [onChange, onReject]);

  const removeItem = useCallback((slug: string) => {
    onChange(value.filter((i) => i.slug !== slug));
  }, [value, onChange]);

  const sorted = useMemo(
    () => [...value].sort((a, b) => a.name.localeCompare(b.name)),
    [value],
  );

  const visibleChips = collapsedCount > 0 && !showAll
    ? sorted.slice(0, collapsedCount)
    : sorted;

  return (
    <Stack spacing={1.5}>
      <Autocomplete<HobbyOption | string, true, true, true>
        freeSolo
        multiple
        disableClearable
        filterOptions={(x) => x}
        options={suggestions}
        renderOption={(props, option) => {
          const { key: _key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
          return (
            <li key={typeof option === "string" ? option : (option.id ?? option.slug)} {...rest}>
              {typeof option === "string" ? option : option.name}
            </li>
          );
        }}
        // We pass value to keep MUI aware of selections, but render tags ourselves below.
        value={value}
        inputValue={inputValue}
        onInputChange={(_event, newInputValue, reason) => {
          // "reset" fires when MUI clears the input after a selection or on re-render.
          // We manage clearing ourselves via addItem, so ignore resets.
          if (reason === "reset") return;
          setInputValue(newInputValue);
        }}
        onChange={(_event, newValue, reason) => {
          if (reason === "clear") return;

          // "removeOption", MUI removed a tag via backspace/delete.
          // Since we render tags externally and block backspace-delete, this shouldn't
          // normally fire, but handle it defensively.
          if (reason === "removeOption") {
            const kept = (newValue as (HobbyOption | string)[])
              .filter((v): v is HobbyOption => typeof v !== "string");
            onChange(kept);
            return;
          }

          // "createOption" (Enter on free text) or "selectOption" (click/Enter on dropdown item)
          const last = newValue[newValue.length - 1];
          if (!last) return;
          if (typeof last === "string") {
            addItem(last);
          } else {
            addItem(last);
          }
        }}
        getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
        isOptionEqualToValue={(opt, val) => {
          if (!opt || !val) return false;
          if (typeof opt === "string" || typeof val === "string") return false;
          return opt.slug === val.slug;
        }}
        loading={loading}
        renderInput={(params) => {
          // Intercept keyDown to handle Enter ourselves and block backspace-delete
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const origKeyDown = (params.inputProps as any)?.onKeyDown as
            | ((e: React.KeyboardEvent) => void)
            | undefined;
          return (
            <Box>
              {label && (
                <Typography
                  component="label"
                  htmlFor={params.id}
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{
                    display: "block",
                    mb: 0.625,
                    cursor: "text",
                    color: error ? "error.main" : "inherit",
                  }}
                >
                  {label}
                </Typography>
              )}
              <TextField
                {...params}
                label={undefined}
                placeholder={placeholder}
                fullWidth
                size="medium"
                variant="outlined"
                error={!!error}
                helperText={error || undefined}
                inputProps={{
                  ...params.inputProps,
                  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") {
                      const trimmed = inputValue.trim();
                      if (trimmed) {
                        // If a dropdown option is highlighted, let MUI handle it
                        // (aria-activedescendant is set when a listbox option has focus)
                        const hasHighlight = e.currentTarget.getAttribute("aria-activedescendant");
                        if (!hasHighlight) {
                          e.preventDefault();
                          e.stopPropagation();
                          addItem(trimmed);
                          return;
                        }
                      }
                    }
                    // Block backspace from deleting chips when input is empty
                    if (e.key === "Backspace" && !inputValue) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    origKeyDown?.(e);
                  },
                }}
              />
            </Box>
          );
        }}
        renderTags={() => null}
      />

      {/* Chips rendered outside Autocomplete for stable layout */}
      {value.length > 0 && (
        <Stack spacing={0.75}>
          {collapsedCount > 0 && (
            <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.5}>
              <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.9 }}>
                {value.length} {value.length === 1 ? "hobby" : "hobbies"} selected
              </Typography>
              {value.length > collapsedCount && (
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
          )}
          <Stack direction="row" flexWrap="wrap" gap={1.5} useFlexGap sx={{ py: 0.25 }}>
            {visibleChips.map((item) => (
              <Chip
                key={item.slug}
                label={item.name}
                size="medium"
                color="primary"
                variant="filled"
                onDelete={() => removeItem(item.slug)}
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
      )}
    </Stack>
  );
}
