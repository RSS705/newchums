"use client";

import Box from "@mui/material/Box";
import RichTextContent from "@/components/ui/RichTextContent";

export type ProfileBioSectionProps = {
  bio: string | null;
};

/** Bio on the public profile. Bios are rich text since Sept 2026 (same
 *  editor and sanitiser as plan descriptions); older plain-text bios are
 *  detected by the renderer and shown with their line breaks. */
export default function ProfileBioSection({ bio }: ProfileBioSectionProps) {
  if (!bio || !bio.trim()) return null;

  return (
    <Box sx={{ "& .nc-rich-content": { fontSize: "0.9375rem", lineHeight: 1.6 } }}>
      <RichTextContent html={bio.trim()} size="body2" />
    </Box>
  );
}
