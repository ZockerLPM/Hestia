import { api } from './client';

export interface WeatherCurrent {
  temperature_2m: number;
  apparent_temperature: number;
  weather_code: number;
  wind_speed_10m: number;
  is_day: 0 | 1;
  relative_humidity_2m: number;
}

export interface WeatherDaily {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  sunrise: string[];
  sunset: string[];
}

export interface WeatherData {
  current: WeatherCurrent;
  daily: WeatherDaily;
  timezone: string;
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
  const { data } = await api.get(`/external/weather?lat=${lat}&lng=${lng}`, { silent: true });
  return data;
}

export interface TransitConnection {
  from: { station?: string; platform?: string; departure?: string; delay: number };
  to: { station?: string; arrival?: string; arrivalDelay: number };
  duration?: string;
  transfers?: number;
  products?: string[];
}

export async function fetchTransit(from: string, to: string): Promise<{ connections: TransitConnection[] }> {
  const { data } = await api.get(`/external/transit?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { silent: true });
  return data;
}

export interface TrafficData {
  enabled: boolean;
  durationSec?: number;
  durationNoTrafficSec?: number;
  delaySec?: number;
  distanceM?: number;
  congestion?: 'free' | 'moderate' | 'heavy';
}

export async function fetchTraffic(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<TrafficData> {
  const { data } = await api.get(
    `/external/traffic?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`,
    { silent: true },
  );
  return data;
}

export interface ProviderStatus {
  weather: boolean;
  transit: boolean;
  traffic: boolean;
}

export async function fetchProviderStatus(): Promise<ProviderStatus> {
  const { data } = await api.get('/external/status', { silent: true });
  return data;
}

// Open-Meteo Weather-Codes (https://open-meteo.com/en/docs)
export function weatherCodeIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if (code >= 61 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '🌨️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95 && code <= 99) return '⛈️';
  return '🌥️';
}
