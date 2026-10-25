import { historyPoints } from './PriceChart';

const day = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
const obs = (...dates: string[]) => dates.map(d => ({ date: d, price: 50000, timestamp: day(d) }));

describe('chart history points', () => {
  it('daily and weekly data draw as one line', () => {
    const points = historyPoints(obs('2026-01-01', '2026-01-02', '2026-01-09'));
    expect(points.map(p => p.actualPrice)).toEqual([50000, 50000, 50000]);
  });

  it('a missing stretch gets a null-price break so the line is not drawn across it', () => {
    const points = historyPoints(obs('2024-12-30', '2024-12-31', '2026-01-09', '2026-01-10'));
    expect(points.map(p => p.actualPrice)).toEqual([50000, 50000, null, 50000, 50000]);
    expect(points[2]).toMatchObject({ missingHistory: true, date: '2025-01-01' });
  });

  it('a known CSV / live discontinuity breaks the line even when only a day is missing', () => {
    const history = obs('2026-09-29', '2026-09-30', '2026-10-02');
    expect(historyPoints(history).map(p => p.actualPrice)).toEqual([50000, 50000, 50000]);
    expect(historyPoints(history, day('2026-09-30')).map(p => p.actualPrice)).toEqual([50000, 50000, null, 50000]);
  });
});
