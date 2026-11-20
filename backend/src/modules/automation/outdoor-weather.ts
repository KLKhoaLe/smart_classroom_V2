// All rooms in this installation share a site. The backend owns the provider cache.
type Weather = {
  source: 'open-meteo' | 'demo-dry' | 'demo-humid' | 'unavailable';
  dew_point: number | null;
  observed_at: string | null;
};

const missing: Weather = { source: 'unavailable', dew_point: null, observed_at: null };
const minute = 60_000;

export class OutdoorWeather {
  private cached?: { value: Weather; retryAt: number };
  private pending?: Promise<Weather>;

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async read(): Promise<Weather> {
    const mode = process.env.WEATHER_MODE || 'live';
    if (mode === 'demo-dry' || mode === 'demo-humid') {
      return { source: mode, dew_point: mode === 'demo-dry' ? 15 : 28, observed_at: new Date().toISOString() };
    }
    if (mode !== 'live') return missing;
    if (this.cached && Date.now() < this.cached.retryAt) return this.cached.value;
    if (!this.pending) this.pending = this.load().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async load(): Promise<Weather> {
    const latitude = Number(process.env.WEATHER_LATITUDE || 16.05);
    const longitude = Number(process.env.WEATHER_LONGITUDE || 108.20);
    let value = missing;
    try {
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
          !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('Invalid coordinates');
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({
        latitude: String(latitude), longitude: String(longitude),
        current: 'dew_point_2m', timeformat: 'unixtime'
      }).toString();
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error('Weather provider unavailable');
      const { current } = await response.json();
      const dew = current?.dew_point_2m;
      const age = Date.now() - current?.time * 1000;
      if (Number.isFinite(dew) && dew >= -80 && dew <= 60 && Number.isFinite(age) && age >= -minute && age <= 45 * minute) {
        value = { source: 'open-meteo', dew_point: dew, observed_at: new Date(current.time * 1000).toISOString() };
      }
    } catch {
      // Keep the indoor policy available when the provider is unreachable.
    }
    const retryAt = value.observed_at
      ? Math.min(Date.now() + 10 * minute, Date.parse(value.observed_at) + 45 * minute)
      : Date.now() + minute;
    this.cached = { value, retryAt };
    return value;
  }
}
