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

// Stable empty array so MUI Autocomplete doesn't see a new reference on every
// render and trigger internal value-sync callbacks.
const EMPTY_VALUE: HobbyOption[] = [];

type HobbyPickerFieldProps = {
  value: HobbyOption[];
  onChange: (items: HobbyOption[]) => void;
  /** Label shown above the input. Default: "Hobbies" */
  label?: string;
  /** Placeholder text inside the input */
  placeholder?: string;
  /** Show error styling + helper text */
  error?: string | null;
  /** Helper text shown below the input when there is no error. */
  helperText?: string;
  /** Callback when a hobby is rejected (e.g. too long, content policy). */
  onReject?: (reason: string) => void;
  /** Max chips to show before collapsing. 0 = show all. Default: 0 (show all) */
  collapsedCount?: number;
};

export default function HobbyPickerField({
  value,
  onChange,
  label = "Hobbies",
  placeholder = "e.g. bowling, card games, cycling",
  error,
  helperText,
  onReject,
  collapsedCount = 0,
}: HobbyPickerFieldProps) {
  const [suggestions, setSuggestions] = useState<HobbyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showAll, setShowAll] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Stable ref to current value so addItem always reads the latest selections.
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
    onChange(valueRef.current.filter((i) => i.slug !== slug));
  }, [onChange]);

  // Filter out already-selected hobbies from the dropdown suggestions.
  const filteredSuggestions = useMemo(() => {
    if (!value.length) return suggestions;
    return suggestions.filter(
      (s) => !value.some((v) => isDuplicate(v, s)),
    );
  }, [suggestions, value]);

  const sorted = useMemo(
    () => [...value].sort((a, b) => a.name.localeCompare(b.name)),
    [value],
  );

  const visibleChips = collapsedCount > 0 && !showAll
    ? sorted.slice(0, collapsedCount)
    : sorted;

  return (
    <Stack spacing={1.5}>
      {/*
       * MUI Autocomplete is used ONLY for the search input + dropdown.
       * Selection state is fully managed by the parent via value/onChange props
       * on this component; we intentionally pass value={[]} to Autocomplete
       * so MUI never tries to reconcile its internal selection state with ours.
       * This eliminates race conditions that caused selections to be cleared.
       */}
      <Autocomplete<HobbyOption | string, true, true, true>
        freeSolo
        multiple
        disableClearable
        filterOptions={(x) => x}
        options={filteredSuggestions}
        renderOption={(props, option) => {
          const { key: _key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
          return (
            <li key={typeof option === "string" ? option : (option.id ?? option.slug)} {...rest}>
              {typeof option === "string" ? option : option.name}
            </li>
          );
        }}
        value={EMPTY_VALUE}
        inputValue={inputValue}
        onInputChange={(_event, newInputValue, reason) => {
          if (reason === "reset") return;
          setInputValue(newInputValue);
        }}
        onChange={(_event, newValue, reason) => {
          if (reason === "clear" || reason === "removeOption") return;
          // "selectOption" or "createOption"; the new item is the last entry.
          const last = newValue[newValue.length - 1];
          if (last) addItem(last);
        }}
        getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
        isOptionEqualToValue={(opt, val) => {
          if (typeof opt === "string" || typeof val === "string") return false;
          return opt.slug === val.slug;
        }}
        loading={loading}
        renderInput={(params) => {
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
                helperText={error || helperText || undefined}
                inputProps={{
                  ...params.inputProps,
                  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") {
                      const trimmed = inputValue.trim();
                      if (trimmed) {
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
