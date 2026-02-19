import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ThemeRegistry from "../theme/ThemeRegistry";

const plusJakarta = Plus_Jakarta_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "NewChums",
  description: "NewChums",
  icons: {
    icon: "/Icon%20Black.png",
  },
};

const plausibleDomain =
  process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "newchums.com";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === "production" ? (
          <Script
            src="https://plausible.io/js/script.js"
            data-domain={plausibleDomain}
            strategy="afterInteractive"
          />
        ) : null}
      </head>
      <body className={plusJakarta.variable}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
