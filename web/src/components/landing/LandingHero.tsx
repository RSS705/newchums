"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import EmojiPeopleOutlinedIcon from "@mui/icons-material/EmojiPeopleOutlined";

/**
 * Hero content only, no Container (Layout provides it).
 */
export default function LandingHero({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const mdUp = useMediaQuery((theme: Theme) => theme.breakpoints.up("md"));

  return (
    <Box
      component="section"
      sx={{
        overflow: "hidden",
        py: { xs: 4, sm: 6, md: 10 },
      }}
    >
      <Grid container spacing={3} alignItems="center">
        {/* Left column: content */}
        <Grid
          size={{
            xs: 12,
            md: 6,
          }}
        >
          <Stack spacing={2.5} mt={{ xs: 2, md: mdUp ? 0 : 2 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <EmojiPeopleOutlinedIcon sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="h6" color="text.secondary">
                Shared interests bring people together
              </Typography>
            </Stack>
            <Typography
              variant="h1"
              fontWeight={900}
              sx={{
                fontSize: { xs: "2.25rem", md: "3rem" },
                lineHeight: { md: 1.2 },
              }}
            >
              Organize{" "}
              <Box component="span" sx={{ color: "primary.main" }}>
                hobbies and events
              </Box>
              {" "}without the group chat chaos
            </Typography>
            <Typography
              variant="h5"
              fontWeight={300}
              color="text.primary"
              sx={{
                lineHeight: 1.65,
                fontSize: { xs: "1rem", sm: "1.25rem" },
              }}
            >
              Sign up once and get notified when people nearby are organizing activities around your interests.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} pt={2}>
              {isLoggedIn ? (
                <>
                  <Button variant="contained" color="primary" href="/events" sx={{ px: 3, py: 1.5 }}>
                    Browse events
                  </Button>
                  <Button variant="outlined" color="primary" href="/profile" sx={{ px: 3, py: 1.5 }}>
                    My profile
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="contained" color="primary" href="/login" sx={{ px: 3, py: 1.5 }}>
                    Login
                  </Button>
                  <Button variant="outlined" color="primary" href="/signup" sx={{ px: 3, py: 1.5 }}>
                    Sign up
                  </Button>
                </>
              )}
            </Stack>
          </Stack>
        </Grid>

        {/* Right column: placeholder illustration */}
        <Grid
          size={{
            xs: 12,
            md: 6,
          }}
        >
          {mdUp ? (
            <Paper
              elevation={0}
              sx={{
                p: 3.2,
                backgroundColor: (theme) => theme.palette.primary.light,
                minHeight: { lg: 360 },
                maxHeight: 420,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 2,
              }}
            >
            </Paper>
          ) : null}
        </Grid>
      </Grid>
    </Box>
  );
}
