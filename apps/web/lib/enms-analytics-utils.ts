export function asTimestampMs(value: string | number | Date): number | null {
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) ? ts : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function mad(values: number[]): number | null {
  const mid = median(values);
  if (mid === null) {
    return null;
  }
  const distances = values.map((value) => Math.abs(value - mid));
  return median(distances);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function inferIntervalMinutes(timestampsMs: number[]): number {
  if (timestampsMs.length < 2) {
    return 15;
  }
  const deltas: number[] = [];
  for (let index = 1; index < timestampsMs.length; index += 1) {
    const delta = timestampsMs[index] - timestampsMs[index - 1];
    if (delta > 0) {
      deltas.push(delta / 60_000);
    }
  }
  const inferred = median(deltas);
  if (!inferred || !Number.isFinite(inferred)) {
    return 15;
  }
  const rounded = Math.max(5, Math.round(inferred / 5) * 5);
  return rounded;
}

export function minuteOfDay(timestampMs: number): number {
  const date = new Date(timestampMs);
  return date.getHours() * 60 + date.getMinutes();
}

export function isWeekend(timestampMs: number): boolean {
  const day = new Date(timestampMs).getDay();
  return day === 0 || day === 6;
}

export function percentageDelta(current: number | null, baseline: number | null): number {
  if (current === null || baseline === null || baseline === 0) {
    return 0;
  }
  return (current - baseline) / baseline;
}

export function maxOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}
