"use client";

import Box from "@mui/material/Box";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import * as React from "react";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import { scrollElementIntoView } from "@/lib/scrollUtils";

export type PlaceResult = {
  formattedAddress: string;
  name: string | null;
  placeId: string;
  lat: number;
  lng: number;
  /** Approximate area for privacy display (e.g. "Seattle, WA"). Null if unavailable. */
  area: string | null;
};

export type PlacesAutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (result: PlaceResult) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: boolean;
  disabled?: boolean;
  sx?: Record<string, unknown>;
  /** Google Places types filter. Defaults to ["address"]. Pass [] to return all place types (parks, landmarks, etc.). */
  placeTypes?: string[];
  /** Unique HTML id for the input (avoids conflicts when multiple instances exist). */
  inputId?: string;
};

/**
 * Wraps Google Places Autocomplete (legacy widget) so the rest of the app can
 * use it as a controlled input. Uses an uncontrolled native input under the
 * hood so Google can freely update the field on selection (controlled inputs
 * fight Google's direct DOM manipulation and break the suggestion dropdown).
 *
 * Mobile rendering notes — the previous revision wrapped the field in
 * `<Box component="span">` (inline element acting as a flex container with an
 * input child) and rendered the input via `<Box component="input">` (MUI sx
 * styling, no explicit type/inputMode). On iOS Safari this combination
 * appeared to break the pac-container suggestion popup: the dropdown either
 * never rendered or attached to a stale layout pass. The current revision:
 *
 *   - uses a plain `<div>` wrapper (block-level, standard input parent),
 *   - uses a plain native `<input>` with inline styles (no Emotion-injected
 *     className race),
 *   - sets `type="text"` and `inputMode="search"` explicitly so iOS picks the
 *     right keyboard,
 *   - uses `font-size: 16px` so iOS Safari doesn't auto-zoom on focus (which
 *     used to disrupt Google's pac-container position calculation),
 *   - pins the latest `onChange` / `onPlaceSelect` callbacks via refs so the
 *     `place_changed` listener (attached exactly once on mount) always sees
 *     fresh props without re-attaching the autocomplete every render,
 *   - logs script-load failures with `console.warn` instead of swallowing
 *     them, so a misconfigured key or CSP block is visible during diagnosis.
 */
export default function PlacesAutocompleteInput({
  value,
  onChange,
  onPlaceSelect,
  label = "Home location",
  placeholder = "Enter your address",
  helperText,
  error = false,
  disabled = false,
  sx,
  placeTypes = ["address"],
  inputId = "places-autocomplete-home",
}: PlacesAutocompleteInputProps) {
  const theme = useTheme();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const autocompleteRef = React.useRef<google.maps.places.Autocomplete | null>(null);
  const listenerRef = React.useRef<google.maps.MapsEventListener | null>(null);
  const lastEmittedRef = React.useRef<string>(value);

  // Pin the latest callbacks via refs so the place_changed listener (wired
  // up exactly once on mount) always sees fresh props without re-attaching.
  // The previous version put initAutocomplete inside `useCallback([onChange,
  // onPlaceSelect])`, which made it churn every render; the
  // `autocompleteRef.current` guard kept things from re-attaching but it
  // meant the listener closed over first-render callbacks. That's fine when
  // the callbacks only call setState (which they do today) but it's a
  // footgun for any future caller that captures real state.
  const onChangeRef = React.useRef(onChange);
  const onPlaceSelectRef = React.useRef(onPlaceSelect);
  React.useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  React.useEffect(() => { onPlaceSelectRef.current = onPlaceSelect; }, [onPlaceSelect]);

  /**
   * Build area string from address_components. Includes neighbourhood or
   * sublocality when present, giving a more precise approximate location
   * (e.g. "Byron, London, ON" instead of just "London, ON").
   */
  const buildAreaFromComponents = (components: google.maps.GeocoderAddressComponent[]): string | null => {
    let neighborhood: string | null = null;
    let locality: string | null = null;
    let admin1: string | null = null;
    for (const c of components) {
      if (!neighborhood && (
        c.types.includes("neighborhood") ||
        c.types.includes("sublocality_level_1") ||
        c.types.includes("sublocality")
      )) {
        neighborhood = c.long_name;
      }
      if (c.types.includes("locality")) locality = c.long_name;
      if (c.types.includes("administrative_area_level_1")) admin1 = c.short_name || c.long_name;
    }
    const city = locality && admin1 ? `${locality}, ${admin1}` : locality || admin1;
    if (!city) return neighborhood || null;
    return neighborhood ? `${neighborhood}, ${city}` : city;
  };

  // Attach the autocomplete exactly once per mounted input element. Runs in
  // a layout effect so the input is guaranteed to be in the DOM when we
  // measure it. The listener reads from the *Ref refs above so it always
  // sees the latest callbacks without needing to be recreated.
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el || disabled) return;
    if (autocompleteRef.current) return;
    let cancelled = false;
    loadGooglePlacesScript()
      .then(() => {
        if (cancelled) return;
        if (!inputRef.current || typeof google === "undefined") return;
        if (autocompleteRef.current) return;
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          ...(placeTypes.length > 0 && { types: placeTypes }),
          fields: ["formatted_address", "place_id", "geometry", "name"],
        });
        autocompleteRef.current = autocomplete;
        listenerRef.current = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const addr = place.formatted_address;
          const geometry = place.geometry?.location;
          const placeId = place.place_id ?? "";

          if (!addr || !geometry) return;

          const emitResult = (area: string | null) => {
            lastEmittedRef.current = place.name || addr;
            onChangeRef.current(place.name || addr);
            onPlaceSelectRef.current({
              formattedAddress: addr,
              name: place.name ?? null,
              placeId,
              lat: geometry.lat(),
              lng: geometry.lng(),
              area,
            });
          };

          if (!placeId) {
            emitResult(null);
            return;
          }

          const service = new google.maps.places.PlacesService(document.createElement("div"));
          service.getDetails({ placeId, fields: ["address_components"] }, (details, status) => {
            let area: string | null = null;
            if (status === google.maps.places.PlacesServiceStatus.OK && details?.address_components) {
              area = buildAreaFromComponents(details.address_components);
            }
            emitResult(area);
          });
        });
      })
      .catch((err) => {
        // Surface the failure as a console warning so a missing key, CSP
        // block, or quota issue becomes visible during diagnosis. The
        // previous swallow (`.catch(() => {})`) is exactly the kind of
        // silent-failure pattern that hid related bugs in this same file.
        console.warn("[PlacesAutocompleteInput] Google Places script failed to load:", err);
      });
    return () => { cancelled = true; };
    // placeTypes is a literal array prop in every caller; depending on it
    // would re-attach the autocomplete on every render and break suggestions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // Sync value from parent (e.g. profile load) without overwriting user typing
  React.useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    if (inputRef.current) inputRef.current.value = value;
  }, [value]);

  React.useEffect(() => {
    return () => {
      if (listenerRef.current && autocompleteRef.current) {
        try {
          google?.maps?.event?.removeListener(listenerRef.current);
        } catch {}
        listenerRef.current = null;
      }
      autocompleteRef.current = null;
    };
  }, []);

  const handleBlur = () => {
    if (inputRef.current) {
      const v = inputRef.current.value?.trim() ?? "";
      if (v !== lastEmittedRef.current) {
        lastEmittedRef.current = v;
        onChangeRef.current(v);
      }
    }
  };

  /**
   * Mobile portrait fix: scroll the input to the top of the visible viewport
   * after the soft keyboard has had time to open.
   *
   * Why this is needed — Google's pac-container is positioned below the
   * input using the LAYOUT viewport, which iOS Safari does not shrink when
   * the soft keyboard opens. On a portrait phone, the form is tall and the
   * input typically ends up mid-screen; the keyboard takes the bottom ~280px
   * of visible space; Google's drop-down position falls inside (or behind)
   * the keyboard area, so the suggestions are invisible. Google's drop-up
   * fallback only triggers when there's *no room below in the layout
   * viewport*, which never happens in portrait because the layout viewport
   * stays full-height. (In landscape, the layout viewport is short enough
   * that drop-up does kick in, which is why the user sees suggestions when
   * they rotate the phone.)
   *
   * Scrolling the input to the top of the visible viewport on focus gives
   * the dropdown a clean ~400px+ of vertical room below it, which is more
   * than enough for the 5-item dropdown to render in the visible area
   * between the input and the top of the keyboard.
   *
   * Desktop is unaffected — the dropdown already has plenty of room and
   * there's no soft keyboard to compete with.
   */
  const handleFocus = () => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 600) return; // mobile only
    // Wait for the iOS keyboard animation to settle (~300ms) before
    // measuring positions. The keyboard reshapes the visual viewport
    // mid-animation, so any scroll calculation done sooner will be wrong.
    window.setTimeout(() => {
      const el = inputRef.current;
      if (!el || !el.isConnected) return;
      // Bail if focus has already moved elsewhere (user tapped away).
      if (document.activeElement !== el) return;
      scrollElementIntoView(el);
    }, 350);
  };

  const borderColor =
    error
      ? theme.palette.error.main
      : theme.palette.mode === "dark"
        ? theme.palette.grey[200]
        : (theme.palette.grey[300] ?? theme.palette.divider);

  return (
    <Box sx={{ width: "100%", ...sx }}>
      {label && (
        <Typography
          component="label"
          htmlFor={inputId}
          variant="subtitle1"
          fontWeight={600}
          sx={{ display: "block", mb: 0.625, cursor: "text" }}
        >
          {label}
        </Typography>
      )}
      {/* Block-level div wrapper. The previous version used
          `<Box component="span">` (an inline element with `display: flex`
          containing an icon + input), which is non-standard nesting and
          reproduced as missing pac-container suggestions on iOS Safari. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          border: `1px solid ${borderColor}`,
          borderRadius: theme.shape.borderRadius,
          bgcolor: disabled ? theme.palette.action.disabledBackground : "background.paper",
          transition: theme.transitions.create(["border-color", "box-shadow"]),
          "&:focus-within": {
            borderColor: error ? undefined : theme.palette.primary.main,
            boxShadow: `0 0 0 1px ${error ? theme.palette.error.main : theme.palette.primary.main}`,
          },
          "&:hover": !disabled
            ? { borderColor: error ? undefined : theme.palette.primary.main }
            : {},
        }}
      >
        <InputAdornment position="start" sx={{ ml: 1.25, flexShrink: 0 }}>
          <PlaceRoundedIcon fontSize="small" color="action" />
        </InputAdornment>
        {/* Plain native <input>, not `<Box component="input">`. MUI's
            sx-on-input compiles to an Emotion class injected at runtime; on
            iOS Safari we saw cases where the className arrived after first
            paint and the resulting layout race interacted with Google's
            pac-container positioning. A plain native input with inline styles
            eliminates that race. */}
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="search"
          defaultValue={value}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "none",
            padding: "12px 14px 12px 0",
            // 16px minimum to prevent iOS Safari auto-zoom on focus. The
            // previous `1rem` resolved to 16px in practice but only because
            // the root font-size hadn't been overridden; pinning to a number
            // removes the implicit dependency.
            fontSize: 16,
            fontFamily: theme.typography.fontFamily as string | undefined,
            color: theme.palette.text.primary,
          }}
        />
      </Box>
      {helperText != null && (
        <FormHelperText error={error} sx={{ mt: 0.5, mx: 0 }}>
          {helperText}
        </FormHelperText>
      )}
    </Box>
  );
}
