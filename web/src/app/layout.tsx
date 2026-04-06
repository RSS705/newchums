import type { Metadata } from "next";
import { Gabarito, Honk, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ThemeRegistry from "../theme/ThemeRegistry";

const plusJakarta = Plus_Jakarta_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

const honk = Honk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-honk",
});

const gabarito = Gabarito({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-gabarito",
});

export const metadata: Metadata = {
  title: "NewChums",
  description: "NewChums",
  icons: {
    icon: "/icon-black.png",
  },
};

const GA_MEASUREMENT_ID = "G-MN49WWXHDJ";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/logo-horizontal-black.png" as="image" />
        <link rel="preload" href="/logo-horizontal-black-no-dot-com.png" as="image" />
        {process.env.NODE_ENV === "production" ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        ) : null}
      </head>
      <body className={`${plusJakarta.variable} ${honk.variable} ${gabarito.variable}`}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
