import { timingSafeEqual } from 'node:crypto';

const API = 'https://bak1-h.goatcounter.com/api/v0';
const RANGE_DAYS = 30;

function isAuthorized(provided) {
  const expected = process.env.STATS_KEY ?? '';
  const a = Buffer.from(provided ?? '');
  const b = Buffer.from(expected);
  return expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

async function goatcounter(path, params) {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.GOATCOUNTER_TOKEN}` } });
  if (!res.ok) throw new Error(`GoatCounter ${path} respondió ${res.status}`);
  return res.json();
}

export default async (req) => {
  if (!isAuthorized(req.headers.get('x-stats-key'))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const start = new Date(Date.now() - RANGE_DAYS * 864e5);
  start.setUTCMinutes(0, 0, 0);
  const range = { start: start.toISOString(), end: new Date().toISOString() };

  try {
    const [total, hits, refs, locations] = await Promise.all([
      goatcounter('/stats/total', range),
      goatcounter('/stats/hits', { ...range, limit: 20 }),
      goatcounter('/stats/toprefs', { ...range, limit: 8 }),
      goatcounter('/stats/locations', { ...range, limit: 8 }),
    ]);

    return Response.json(
      {
        days: RANGE_DAYS,
        total: total.total - total.total_events,
        daily: total.stats.map(({ day, daily }) => ({ day, count: daily })),
        projects: hits.hits.filter((h) => h.event).map(({ title, path, count }) => ({ name: title || path, count })),
        referrers: refs.stats.map(({ name, count }) => ({ name: name || 'Directo', count })),
        countries: locations.stats.map(({ name, count }) => ({ name, count })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }
};

export const config = { path: '/api/stats' };
