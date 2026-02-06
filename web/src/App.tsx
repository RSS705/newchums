import { useEffect, useState } from "react";
import { Container, Typography, Stack } from "@mui/material";

export default function App() {
  const [health, setHealth] = useState<string>("Loading...");

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL;
    fetch(`${base}/health`)
      .then((r) => r.json())
      .then((data) => setHealth(JSON.stringify(data)))
      .catch(() => setHealth("API not reachable"));
  }, []);

  return (
    <Container sx={{ py: 6 }}>
      <Stack spacing={2}>
        <Typography variant="h4">NewChums</Typography>
        <Typography color="text.secondary">API health: {health}</Typography>
      </Stack>
    </Container>
  );
}
