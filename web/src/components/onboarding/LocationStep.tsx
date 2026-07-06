"use client";

import Stack from "@mui/material/Stack";
import PlacesAutocompleteInput, {
  type PlaceResult,
} from "@/components/common/PlacesAutocompleteInput";
import DistanceSelect from "@/components/common/DistanceSelect";

type LocationStepProps = {
  homeAddress: string;
  onAddressChange: (value: string) => void;
  onPlaceSelect: (result: PlaceResult) => void;
  travelRadiusKm: number;
  onTravelRadiusChange: (value: number) => void;
};

export default function LocationStep({
  homeAddress,
  onAddressChange,
  onPlaceSelect,
  travelRadiusKm,
  onTravelRadiusChange,
}: LocationStepProps) {
  return (
    <Stack spacing={2.5}>
      <PlacesAutocompleteInput
        value={homeAddress}
        onChange={(v) => {
          onAddressChange(v);
        }}
        onPlaceSelect={onPlaceSelect}
        label="Home location"
        placeholder="Your city or neighbourhood"
        helperText="A city or neighbourhood is enough. Whatever you enter is only used for distance matching and is never shared publicly."
        inputId="onboarding-location"
      />
      <DistanceSelect
        value={travelRadiusKm}
        onChange={onTravelRadiusChange}
        label="Travel distance"
        helperText="How far are you willing to travel for a plan?"
        fullWidth
      />
    </Stack>
  );
}
