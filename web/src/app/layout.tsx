import type { Metadata } from "next";
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
  openGraph: {
    type: "website",
    siteName: "NewChums",
    title: "NewChums",
    description:
      "Post the plan, share one link, and see who is really coming. One place for your plans, invites, and RSVPs.",
    url: "https://newchums.com",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NewChums, make plans that actually happen",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NewChums",
    description:
      "Post the plan, share one link, and see who is really coming. One place for your plans, invites, and RSVPs.",
    images: ["/og-image.png"],
  },
};

const GA_MEASUREMENT_ID = "G-MN49WWXHDJ";

// Meta Pixel dataset id, from Events Manager -> NewChums Pixel -> Settings.
// Empty string disables the pixel entirely (nothing is injected), so this
// ships inert until the id is pasted in. The ad campaign optimizes on the
// CompleteRegistration event this pixel reports (fired in
// src/lib/attribution.ts the first time a young account checks in), per
// docs/Growth_Experiment_Plan.md §7: optimize delivery for account
// creation, judge the campaign on activated hosts.
const META_PIXEL_ID = "";

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
            {META_PIXEL_ID ? (
              <Script id="meta-pixel" strategy="afterInteractive">
                {`
                  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
                  n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                  n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
                  s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(
                  window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
                  fbq('init', '${META_PIXEL_ID}');
                  fbq('track', 'PageView');
                `}
              </Script>
            ) : null}
          </>
        ) : null}
      </head>
      <body className={`${plusJakarta.variable} ${gabarito.variable}`}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
