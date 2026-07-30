import { NextResponse } from "next/server";
import { findCity } from "@/lib/city-catalog";

let lastRequestAt = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const country = url.searchParams.get("country")?.trim();
  const city = url.searchParams.get("city")?.trim();
  if (!country || !city) return NextResponse.json({ error: "COUNTRY_AND_CITY_REQUIRED" }, { status: 400 });

  const localCity = findCity(country, city);
  if (localCity) return NextResponse.json({ latitude: localCity.latitude, longitude: localCity.longitude, source: "local-city-catalog" });

  const waitMs = Math.max(0, 1000 - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();

  const query = new URLSearchParams({ q: `${city}, ${country}`, format: "jsonv2", limit: "1", featuretype: "city", "accept-language": "zh-CN" });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
      headers: { "User-Agent": "OurAtlasPrivateTravelPrototype/0.1" },
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return NextResponse.json({ error: "GEOCODER_UNAVAILABLE" }, { status: 502 });
    const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
    if (!results[0]) return NextResponse.json({ error: "CITY_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ latitude: Number(results[0].lat), longitude: Number(results[0].lon), label: results[0].display_name, source: "nominatim" });
  } catch {
    return NextResponse.json({ error: "CITY_NOT_FOUND" }, { status: 404 });
  }
}
