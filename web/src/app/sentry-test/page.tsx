"use client";

export default function SentryTestPage() {
  const handleClick = () => {
    throw new Error("Sentry test error");
  };

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Sentry Test</h1>
      <p>Click the button below to trigger a test error.</p>
      <button type="button" onClick={handleClick}>
        Trigger Error
      </button>
    </main>
  );
}
