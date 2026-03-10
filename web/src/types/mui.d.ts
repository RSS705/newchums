import "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    onPrimary: Palette["primary"];
  }
  interface PaletteOptions {
    onPrimary?: PaletteOptions["primary"];
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    onPrimary: true;
  }
}
