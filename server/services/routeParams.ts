export function normalizeRouteParam(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
