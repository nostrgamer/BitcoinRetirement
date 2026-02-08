# Retirement Calculator – Test Plan

Use this to guard against miscalculations in the Bear Market Test, 50-year simulation, chart projected prices, and years-until-retirement behavior.

---

## 1. Power Law (already in `PowerLaw.test.ts`)

- [x] Fair value = A × (days_since_genesis)^B
- [x] Floor = 0.42 × fair value
- [x] Upper bound = 2 × fair value
- [x] Floor < fair value < upper bound for any date

Run: `npm test -- PowerLaw.test.ts`

---

## 2. Bear Market Test (2 years at floor, then recovery)

**Rule:** 2 consecutive years at floor price, then 1 year at recovery (75% from floor to fair value), then 20+ years runway at fair value. Use cash before selling Bitcoin.

| # | Scenario | Expect |
|---|----------|--------|
| 2.1 | Sufficient BTC + enough cash to cover 2 years at floor | Pass; cash used first, BTC preserved |
| 2.2 | Enough cash for 2 years withdrawal, then need BTC in year 3 | Pass; year 3 recovery price used for year-3 withdrawal |
| 2.3 | Zero cash, barely enough BTC at floor for 2 years + recovery | Pass only if after year 3 remaining portfolio ≥ 20 × annual withdrawal |
| 2.4 | Zero cash, not enough BTC to cover 2 years at floor | Fail (run out in year 1 or 2) |
| 2.5 | Zero cash, survive 2 years + recovery but remaining value < 20 × withdrawal | Fail (runway test) |
| 2.6 | Annual withdrawal = 0 | Fail (invalid) |
| 2.7 | Bitcoin holdings = 0 | Fail (invalid) |

**Unit tests:** `npm test -- RetirementLogic.test.ts` (see “Bear Market Test” describe block).

**Sanity check:** For a fixed year (e.g. 2026), compute floor and recovery; manually run 2 years at floor + 1 at recovery; verify remaining value and 20-year runway.

---

## 3. 50-Year Withdrawal Simulation – Cycle sequence

**Rule:** Withdrawal phase starts at `currentYear + max(yearsUntilRetirement, yearsToRetirement from savings)`. First two years at floor, then one year recovery, then 4-year cycle: floor → recovery → bull → peak (repeat).

| # | Check | How to verify |
|----|--------|----------------|
| 3.1 | Year 0 and 1 of withdrawal = Power Law floor for that year | Table “BTC Price” = floor for years 0 and 1 |
| 3.2 | Year 2 = recovery (floor + 0.75×(fair − floor)) | Table price equals formula for year 2 |
| 3.3 | Year 3 = floor, 4 = recovery, 5 = bull, 6 = peak, 7 = floor… | Cycle repeats; (yearIndex - 3) % 4 gives 0,1,2,3 |
| 3.4 | Bull price = fair + 0.7×(upper − fair) | Compare table to PowerLaw fair/upper for that year |
| 3.5 | Peak price = fair + 0.3×(upper − fair) | Same |
| 3.6 | Withdrawals happen in year 0 (no “year 0 = no withdrawal”) | First withdrawal row has non-zero Cash Flow and strategy text |

**Unit tests:** `RetirementLogic.test.ts` – “50-year simulation cycle prices” (formulas only, no React).

**Manual:** Set years until retirement = 0; check first table row is current year, “Retirement Start (Deep Bear — Year 1)”, and has withdrawal amount.

---

## 4. Chart projected price line (purple)

**Rule:** Anchor = retirement start year = `currentYear + max(yearsUntilRetirement, yearsToRetirement)`. From that year: offset 0,1 = floor; 2 = recovery; 3+ = 4-year cycle (same as table).

| # | Check | How to verify |
|----|--------|----------------|
| 4.1 | No plan line when no retirement inputs / no simulation | With 0 BTC and 0 withdrawal, purple line absent |
| 4.2 | Plan line starts at retirement start year | First purple point at Jan 1 of that year |
| 4.3 | First two years of plan = floor | First two points’ Y = Power Law floor for those years |
| 4.4 | Plan prices match table for same year | For a given calendar year, table “BTC Price” = chart plan value (same formula) |

**Manual:** Set e.g. 2 years until retirement; note retirement start year; confirm purple line begins that year and first two points are at floor.

---

## 5. Years until retirement

**Rule:** Retirement start year = `currentYear + max(retirementInputs.yearsUntilRetirement, monthlySavingsInputs.yearsToRetirement)` (when savings enabled).

| # | Check | How to verify |
|----|--------|----------------|
| 5.1 | Years until retirement = 0 → first withdrawal year = current year | Table first withdrawal row year = current year |
| 5.2 | Years until retirement = 5 → first withdrawal year = current + 5 | Table first withdrawal row year = current + 5 |
| 5.3 | Monthly savings enabled, 10 years to retirement; years until retirement = 3 | Start year = current + 10 (max wins) |
| 5.4 | Monthly savings enabled, 3 years to retirement; years until retirement = 10 | Start year = current + 10 (max wins) |

**Manual:** Change “Years until retirement” and confirm table and chart first year update accordingly.

---

## 6. Smart Withdrawal Strategy (optional)

**Rule:** At floor → prefer cash; above fair value → prefer Bitcoin; etc. (see `SmartWithdrawalStrategy.ts`).

| # | Check | How to verify |
|----|--------|----------------|
| 6.1 | Deep bear year → “Cash First” or high cash % in table “Activity” | Inspect table for floor years |
| 6.2 | Bull year → “Bitcoin Only” or high BTC % | Inspect table for bull years |
| 6.3 | Withdrawal amount = cash used + (BTC sold × price) | For each row, cashUsed + bitcoinSold×bitcoinPrice ≈ annual withdrawal |

**Manual:** Pick a few table rows and check cash + (BTC sold × price) ≈ annual withdrawal.

---

## 7. End-to-end sanity checks

| # | Check | How to verify |
|----|--------|----------------|
| 7.1 | Pass/fail and table agree | If “Ready to Retire” then 50-year table does not show DEPLETED before 50 years |
| 7.2 | Historical “could have retired on” uses same bear test | Same 2-year floor + recovery + 20-year runway logic |
| 7.3 | No negative BTC or cash in table | All “Total BTC” and “Remaining Cash” ≥ 0 until DEPLETED |
| 7.4 | Accumulation phase (if enabled) ends the year before first withdrawal row | Last SAVE row year = first withdrawal row year − 1 |

---

## 8. Edge-case tests

**RetirementLogic.test.ts** (“Edge cases” describe block):

| Area | Test |
|------|------|
| Bear Market | Negative cash treated as zero (clamped) |
| Bear Market | Pass when runway is exactly 20 years after bear |
| Bear Market | Fail when runway is just under 20 years |
| Bear Market | Fail in year 1 when withdrawal exceeds what 1 BTC at floor can provide |
| 50-year cycle | Year 49 has valid phase (floor/recovery/bull/peak) |
| 50-year cycle | Cycle phases consistent for different retirement start years (2026, 2035, 2044) |
| Chart plan | Far future year (anchor + 50) returns price within floor–upper |
| Chart plan | Offset 0 and 1 are floor for any anchor year |

**SmartWithdrawalStrategy.test.ts** (new file):

| Area | Test |
|------|------|
| Zero / insufficient | withdrawalNeeded = 0 → total used = 0 |
| Zero / insufficient | availableCash = 0, availableBitcoin = 0 → returns decision without throwing |
| Zero / insufficient | When assets suffice, useCashAmount + useBitcoinAmount × price = withdrawalNeeded |
| Boundary ratios | 0.5 → HODL_BITCOIN, cash first |
| Boundary ratios | 0.8 → HODL_BITCOIN |
| Boundary ratios | 1.25 (overvalued) → SPEND_BITCOIN, total used = withdrawal |
| Boundary ratios | 2.5 → SPEND_BITCOIN |
| Boundary ratios | > 5 → Bitcoin only, SPEND_BITCOIN |
| Emergency mode | Prefer cash first when available |
| Emergency mode | Cash then Bitcoin when cash insufficient |
| getRebalancingAdvice | Zero total value (no throw); normal allocation returns string |

Run: `npm test -- RetirementLogic.test.ts` and `npm test -- SmartWithdrawalStrategy.test.ts`

---

## Running automated tests

```bash
# All tests
npm test

# Power Law only
npm test -- PowerLaw.test.ts

# Retirement logic (Bear Market + 50-year cycle + chart plan)
npm test -- RetirementLogic.test.ts

# Existing retirement calculations (separate module)
npm test -- RetirementCalculations.test.ts
```

---

## Adding or changing tests

- **Power Law:** `src/models/PowerLaw.test.ts`
- **Retirement logic used by chart/table:** `src/utils/RetirementLogic.test.ts` (formulas, rules, edge cases)
- **Smart Withdrawal Strategy:** `src/utils/SmartWithdrawalStrategy.test.ts` (ratios, emergency, zero assets)
- **Legacy RetirementCalculations:** `src/utils/RetirementCalculations.test.ts`

When you change the Bear Market Test (e.g. number of years at floor) or the 50-year cycle sequence, update both the code and the corresponding describe blocks in `RetirementLogic.test.ts` and this plan.
