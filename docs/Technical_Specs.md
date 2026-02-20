# Technical Specs

**Last Updated:** February 20, 2026 **Version:** 1.11

## Username Architecture

Case-preserving display. Case-insensitive uniqueness.

Columns: - username - username_norm

Index: idx_users_username_norm

## Validation

Regex: [^1]{3,20}\$ No leading/trailing underscore. Confirm password
required.

## Error Handling

409 EMAIL_EXISTS 409 USERNAME_TAKEN 400 INVALID_USERNAME 400 UNDERAGE
(date_of_birth) 500 SERVER_ERROR

[^1]: A-Za-z0-9\_

## Date Picker

-   **Library:** @mui/x-date-pickers + dayjs
-   **Adapter:** AdapterDayjs (LocalizationProvider in ThemeRegistry)
-   **Component:** `components/fields/NCDatePicker.tsx` — value/onChange as YYYY-MM-DD
