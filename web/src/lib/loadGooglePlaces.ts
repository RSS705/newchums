/**
 * Load Google Maps JavaScript API with Places library (client-side only).
 * Loads once; subsequent calls return the same promise.
 */

declare global {
  interface Window {
    __googlePlacesLoadPromise?: Promise<void>;
  }
}

export function loadGooglePlacesScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadGooglePlacesScript must run in browser"));
  }
  if (window.__googlePlacesLoadPromise) {
    return window.__googlePlacesLoadPromise;
  }
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key?.trim()) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set"));
  }
  window.__googlePlacesLoadPromise = new Promise((resolve, reject) => {
    const g = window as unknown as { google?: { maps?: { places?: unknown } } };
    if (g.google?.maps?.places) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      let attempts = 0;
      const check = () => {
        if (g.google?.maps?.places) return resolve();
        if (++attempts > 20) return reject(new Error("Google Places failed to load"));
        setTimeout(check, 50);
      };
      check();
    };
    script.onerror = () => reject(new Error("Failed to load Google Places script"));
    document.head.appendChild(script);
  });
  return window.__googlePlacesLoadPromise;
}
