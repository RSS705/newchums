"use client";

import InputAdornment from "@mui/material/InputAdornment";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import * as React from "react";
import { AppTextField } from "@/components/ui";
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
  const inputRef = React.useRef<HTMLInputElement>(null);
  const autocompleteRef = React.useRef<google.maps.places.Autocomplete | null>(null);
  const listenerRef = React.useRef<google.maps.MapsEventListener | null>(null);

  React.useEffect(() => {
    if (!inputRef.current || disabled) return;
    let cancelled = false;
    loadGooglePlacesScript()
      .then(() => {
        if (cancelled || !inputRef.current || typeof google === "undefined") return;
        if (autocompleteRef.current) return; // already initialized
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          fields: ["formatted_address", "place_id", "geometry"],
        });
        autocompleteRef.current = autocomplete;
        listenerRef.current = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const addr = place.formatted_address;
          const geometry = place.geometry?.location;
          if (addr && geometry) {
            onChange(addr);
            onPlaceSelect({
              formattedAddress: addr,
              placeId: place.place_id ?? "",
              lat: geometry.lat(),
              lng: geometry.lng(),
            });
          }
        });
      })
      .catch(() => {
        // Script load failed; user can still type manually
      });
    return () => {
      cancelled = true;
      if (listenerRef.current && autocompleteRef.current) {
        google.maps.event.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
      autocompleteRef.current = null;
    };
  }, [disabled, onChange, onPlaceSelect]);

  const handleBlur = () => {
    if (inputRef.current) {
      const v = inputRef.current.value?.trim() ?? "";
      if (v !== value) onChange(v);
    }
  };

  return (
    <AppTextField
      inputRef={inputRef}
      key={value === "" ? "places-empty" : "places-filled"}
      label={label}
      placeholder={placeholder}
      defaultValue={value}
      onBlur={handleBlur}
      helperText={helperText ?? " "}
      error={error}
      disabled={disabled}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start" sx={{ ml: -0.5 }}>
            <PlaceRoundedIcon fontSize="small" color="action" />
          </InputAdornment>
        ),
      }}
      sx={{ ...sx }}
    />
  );
}
