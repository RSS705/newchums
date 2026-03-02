"use client";

import Box from "@mui/material/Box";
import FormHelperText from "@mui/material/FormHelperText";
import InputAdornment from "@mui/material/InputAdornment";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import * as React from "react";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";

export type PlaceResult = {
  formattedAddress: string;
  placeId: string;
  lat: number;
  lng: number;
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
};

/**
 * Uses an uncontrolled native input so Google Places Autocomplete can freely
 * update the field for suggestions. Controlled inputs conflict with Google's
 * direct DOM manipulation.
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
}: PlacesAutocompleteInputProps) {
  const theme = useTheme();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const autocompleteRef = React.useRef<google.maps.places.Autocomplete | null>(null);
  const listenerRef = React.useRef<google.maps.MapsEventListener | null>(null);
  const lastEmittedRef = React.useRef<string>(value);

  const initAutocomplete = React.useCallback(
    (el: HTMLInputElement) => {
      if (autocompleteRef.current || !el || typeof google === "undefined") return;
      const autocomplete = new google.maps.places.Autocomplete(el, {
        types: ["address"],
        fields: ["formatted_address", "place_id", "geometry"],
      });
      autocompleteRef.current = autocomplete;
      listenerRef.current = autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const addr = place.formatted_address;
        const geometry = place.geometry?.location;
        if (addr && geometry) {
          lastEmittedRef.current = addr;
          onChange(addr);
          onPlaceSelect({
            formattedAddress: addr,
            placeId: place.place_id ?? "",
            lat: geometry.lat(),
            lng: geometry.lng(),
          });
        }
      });
    },
    [onChange, onPlaceSelect],
  );

  const setInputRef = React.useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (!el || disabled) return;
      loadGooglePlacesScript()
        .then(() => {
          if (inputRef.current === el && el && !autocompleteRef.current) {
            initAutocomplete(el);
          }
        })
        .catch(() => {});
    },
    [disabled, initAutocomplete],
  );

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
        onChange(v);
      }
    }
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
          htmlFor="places-autocomplete-home"
          variant="subtitle1"
          fontWeight={600}
          sx={{ display: "block", mb: 0.625, cursor: "text" }}
        >
          {label}
        </Typography>
      )}
      <Box
        component="span"
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
        <Box
          component="input"
          id="places-autocomplete-home"
          ref={setInputRef}
          defaultValue={value}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onBlur={handleBlur}
          sx={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "none",
            padding: "12px 14px 12px 0",
            fontSize: "1rem",
            fontFamily: theme.typography.fontFamily,
            color: theme.palette.text.primary,
            "&::placeholder": { color: theme.palette.text.secondary, opacity: 0.7 },
            "&:disabled": { cursor: "not-allowed", color: theme.palette.text.disabled },
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
