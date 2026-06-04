"use client";

import { useEffect, useState } from "react";

export function useAqi(): number | null {
  const [aqi, setAqi] = useState<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/aqi?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
          );
          if (!res.ok) return;
          const data = await res.json();
          if (typeof data.aqi === "number") setAqi(data.aqi);
        } catch {
          // silent fail — AQI display will show "—"
        }
      },
      () => {
        // user denied geolocation — AQI display will show "—"
      },
      { timeout: 8000 }
    );
  }, []);

  return aqi;
}
