import type { Metadata } from "next";
import { DEFAULT_SHARE_IMAGE, SITE_NAME } from "@/lib/shareMeta";
import { Gabarito, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ThemeRegistry from "../theme/ThemeRegistry";

const plusJakarta = Plus_Jakarta_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

const gabarito = Gabarito({
  // 800 included for the h1 scale (page titles use fontWeight 800; without
  // loading it the browser fakes the weight from 700).
  weight: ["400", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-gabarito",
});

export const metadata: Metadata = {
  // `metadataBase` lets every per-page metadata export use relative image
  // URLs and still produce absolute URLs in OG/Twitter cards. Canonical
  // host is newchums.com (the www variant 301-redirects to apex via the
  // proxy file, so OAuth PKCE cookies and social-share URLs stay on one
  // origin).
  metadataBase: new URL("https://newchums.com"),
  title: {
    default: "NewChums",
    template: "%s | NewChums",
  },
  description:
    "NewChums is the easiest way to make plans that actually happen. Post the plan, share one link, and see who is really coming.",
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
  // Defaults for every page that does not set its own preview tags.
  // `url: "./"` resolves against the page being rendered, so each page
  // reports its own address. It used to be fixed to the homepage, which
  // made /privacy, /terms, /communities and the rest tell LinkedIn they
  // WERE the homepage. No title or description is fixed here either: Next
  // fills og:title and og:description from the page's own title and
  // description when they are absent.
  // A page that sets its own `openGraph` REPLACES this whole object (Next
  // does not merge them), so public pages go through lib/shareMeta.ts,
  // which restates the site name, locale and brand card.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "./",
    locale: "en_US",
    images: [DEFAULT_SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    images: [DEFAULT_SHARE_IMAGE.url],
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
      <body className={`${plusJakarta.variable} ${gabarito.variable}`}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
