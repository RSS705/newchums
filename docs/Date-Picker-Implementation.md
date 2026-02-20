# Date Picker Implementation (Template Parity)

**Last Updated:** February 2026

## A) Template Source Locations

| Purpose | Path |
|--------|------|
| Calendar Add Event modal | `template_reference/src/app/components/apps/calendar/index.tsx` |
| Form date-time demos | `template_reference/src/app/components/forms/form-elements/date-time/*.tsx` |
| BasicDateTime | `BasicDateTime.tsx` (MobileDateTimePicker) |
| DifferentDateTime | `DifferentDateTime.tsx` (DateTimePicker) |

## B) Template Library & Adapter

- **Library:** `@mui/x-date-pickers` (template: 8.19.0)
- **Adapter:** `AdapterDayjs`
- **Peer:** `dayjs` (^1.11.13)

Template uses `DatePicker` for Calendar Add Event (Start Date, End Date). No shared wrapper; `LocalizationProvider` wraps pickers inline per modal.

## C) NewChums Plan

1. **LocalizationProvider** – `web/src/theme/ThemeRegistry.tsx`  
   Wraps app once so all pickers share the same adapter.

2. **Reusable component** – `web/src/components/fields/NCDatePicker.tsx`  
   - Props: `value` (YYYY-MM-DD), `onChange(value: string)`, `label`, `helperText`, `error`, `noTopMargin`
   - Uses MUI X `DatePicker` + `AdapterDayjs`
   - Styling via `slotProps.textField` (variant, size) and theme `MuiOutlinedInput`

3. **Theme alignment** – Existing `MuiOutlinedInput`, `MuiPopover`, `shape.borderRadius` apply to picker fields and calendar popover. No extra overrides.

## D) Code Edits Summary

- `package.json`: Added `@mui/x-date-pickers`, `dayjs`
- `theme/ThemeRegistry.tsx`: Added `LocalizationProvider` + `AdapterDayjs`
- `components/fields/NCDatePicker.tsx`: New reusable date picker
- `components/fields/index.ts`: Barrel export
- `signup/SignupClient.tsx`: Replaced native `type="date"` with `NCDatePicker`

## E) Verification Checklist

- [ ] Date of birth field shows calendar icon on signup
- [ ] Click icon or input opens calendar popover
- [ ] Select date populates YYYY-MM-DD and submits correctly
- [ ] Keyboard entry (YYYY-MM-DD) works
- [ ] maxDate prevents future dates
- [ ] Helper text and error states display
- [ ] Mobile: calendar picker is usable
- [ ] 18+ validation still enforces on submit
