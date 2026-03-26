"use client";

import HobbyPickerField, { type HobbyOption } from "@/components/common/HobbyPickerField";

export type InterestOption = HobbyOption;

type HobbiesStepProps = {
  value: InterestOption[];
  onChange: (items: InterestOption[]) => void;
};

export default function HobbiesStep({ value, onChange }: HobbiesStepProps) {
  return (
    <HobbyPickerField
      value={value}
      onChange={onChange}
      label="Add hobbies"
      collapsedCount={12}
    />
  );
}
