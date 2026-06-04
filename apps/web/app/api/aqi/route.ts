import { NextResponse } from "next/server";

const AQI_TIMEOUT_MS = 5000;

function jsonResponse(body: object) {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function parseMetric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function extractIaqiMetric(data: unknown, key: "pm25" | "pm10") {
  if (!data || typeof data !== "object") {
    return null;
  }

  const iaqi = (data as { iaqi?: Record<string, { v?: unknown }> }).iaqi;
  if (!iaqi || typeof iaqi !== "object") {
    return null;
  }

  return parseMetric(iaqi[key]?.v);
}

// GET /api/aqi?lat=xx&lng=xx
export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const lat = requestUrl.searchParams.get("lat");
  const lng = requestUrl.searchParams.get("lng");

  const parsedLat = lat === null ? NaN : Number(lat);
  const parsedLng = lng === null ? NaN : Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return NextResponse.json(
      { error: "lat and lng query params must both be valid numbers." },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const token = process.env.WAQI_API_TOKEN;

  if (!token) {
    return jsonResponse({
      aqi: null,
      pm25: null,
      pm10: null,
      cached: true,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AQI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.waqi.info/feed/geo:${parsedLat};${parsedLng}/?token=${token}`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`WAQI responded with ${response.status}`);
    }

    const payload = (await response.json()) as {
      status?: string;
      data?: {
        aqi?: unknown;
        iaqi?: Record<string, { v?: unknown }>;
      };
    };

    if (payload.status !== "ok" || !payload.data) {
      throw new Error("WAQI returned a non-ok payload.");
    }

    const aqi = parseMetric(payload.data.aqi);
    if (aqi === null) {
      throw new Error("WAQI payload did not include a numeric AQI value.");
    }

    return jsonResponse({
      aqi,
      pm25: extractIaqiMetric(payload.data, "pm25"),
      pm10: extractIaqiMetric(payload.data, "pm10"),
    });
  } catch {
    return jsonResponse({
      aqi: null,
      pm25: null,
      pm10: null,
      cached: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}
