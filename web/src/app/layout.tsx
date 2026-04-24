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
  // `metadataBase` lets every per-page metadata export use relative image
  // URLs and still produce absolute URLs in OG/Twitter cards. Canonical
  // host is newchums.com (the www variant 301-redirects to apex via
  // middleware, so OAuth PKCE cookies and social-share URLs stay on one
  // origin).
  metadataBase: new URL("https://newchums.com"),
  title: {
    default: "NewChums",
    template: "%s | NewChums",
  },
  description:
    "NewChums helps you organize gatherings around shared hobbies and interests. One place for your plans, invites, and RSVPs so more real-life get-togethers actually happen.",
  applicationName: "NewChums",
  // Explicit default; authenticated app routes, admin routes, auth flows,
  // utility endpoints, and hidden profiles / private communities override
  // this to noindex via per-page metadata or generateMetadata.
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/icon-black.png",
    apple: "/icon-black.png",
  },
  openGraph: {
    type: "website",
    siteName: "NewChums",
    title: "NewChums",
    description:
      "Organize gatherings around shared hobbies and interests. One place for your plans, invites, and RSVPs so more real-life get-togethers actually happen.",
    url: "https://newchums.com",
    locale: "en_US",
    images: [
      {
        url: "/logo-horizontal-black.png",
        width: 3791,
        height: 1575,
        alt: "NewChums",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NewChums",
    description:
      "Organize gatherings around shared hobbies and interests. One place for your plans, invites, and RSVPs.",
    images: ["/logo-horizontal-black.png"],
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
