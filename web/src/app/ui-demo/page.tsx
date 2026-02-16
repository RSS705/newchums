import Container from "@mui/material/Container";
import UiDemoClient from "./UiDemoClient";

export default function UiDemoPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <UiDemoClient />
    </Container>
  );
}

