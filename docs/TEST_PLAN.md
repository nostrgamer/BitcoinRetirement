# Retirement Calculator – Test Plan

Everything runs locally with `./VERIFY.sh` (type check, unit tests, build, Playwright). No CI.

## 1. Power Law — `src/models/PowerLaw.test.ts`
- Fair value = 10 ** (-16.509 + 5.690 × log10(days since genesis)); regression values across history and the retirement horizon
- Floor = 0.42 × fair value, upper bound = 2 × fair value, floor < fair < upper

## 2. Stress path and simulation — `src/simulation/retirementPlan.test.ts`
| Check | Expectation |
|---|---|
| Price path | Years 1–3 = 0.42×, year 4 = 0.855×, years 5–50 = 0.84× fair value; never above fair value |
| Floor forever | 0.42× every year |
| Reference fixture | $60k/yr, BTC only: from 1 Jan 2027 the stress path needs 2.90 BTC and floor forever 3.81 BTC; from 1 Nov 2026 the stress path needs 3.04 BTC |
| Start date | Retirement starts on the first of next month + N years (December rolls into January); retirement year k starts on the same day k years later |
| Funded-year count | Consecutive fully funded withdrawals; a partly funded year doesn't count (BTC-only, cash-only, mixed, cash running out mid-year, first-year shortfall, all 50) |
| Floor vs stress | Floor-forever never outlasts the stress path for the same inputs |
| Savings dates | Monthly buys from next month until the month before retirement starts (12N purchases); priced at monthly fair value; projected BTC = sum of buys |
| Valuation | Live price when retiring now; fair value on the retirement start date otherwise |
| Cash-only | Gets a verdict |
| Historical what-if | Earliest passing year with current holdings; every earlier year fails |

## 3. Validation — `src/simulation/validation.test.ts`
Blocking: empty, non-numeric, negative, zero withdrawal, fractional or >50 years, no assets. Warnings only: >1,000 BTC, >$10M/yr (boundaries 1000 / 1000.01 and 10M / 10M+1).

## 4. Historical figures — `src/models/historicalStats.test.ts`
`historicalStats.json` must match the bundled CSV (extremes and dates, % of days below/above fair value).

## 5. Market data — `src/services/*.test.ts`
CSV parsing and merge; same-origin function: validation, timeouts, fallbacks, window count from the CSV baseline (capped at 4), `coverage.complete` false on cap or failed window.

## 6. Browser — `e2e/`
| Spec | Covers |
|---|---|
| `retirement-plan.spec.ts` | Stress-path rows (incl. RETIRE row), pass/fail around 2.90 BTC, cash-only, Total Assets consistency, chart horizon for retire-in 0/10/40/50, one years input, no Double Down, savings stop at retirement, what-if, validation, no "$$" or inflation wording, 5-minute refresh keeps inputs/focus/scroll |
| `golden-v2.spec.ts` | Full table + verdicts for 20 scenarios at 2026-10-24 (`golden/v2-stress-path.json`); re-record only with `GOLDEN_WRITE=1` and a stated reason |
| `retirement-withdrawal-shortfall.spec.ts` | Shortfalls are shown, never counted as funded |
| `live-market-data.spec.ts` | Same-origin live data and fallback provenance (live tests need `PLAYWRIGHT_LIVE_DATA`) |
