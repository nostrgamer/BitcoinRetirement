import { RawPlanInputs, validatePlanInputs } from './validation';

const base: RawPlanInputs = {
  bitcoinAmount: '1',
  cashAmount: '10000',
  annualWithdrawal: '60000',
  yearsUntilRetirement: '0',
  monthlySavingsEnabled: false,
  monthlySavingsAmount: '500'
};

const check = (overrides: Partial<RawPlanInputs>) => validatePlanInputs({ ...base, ...overrides });

describe('validatePlanInputs', () => {
  it('accepts valid inputs and parses them', () => {
    const result = check({ bitcoinAmount: '0.5' });
    expect(result.errors).toEqual([]);
    expect(result.inputs).toMatchObject({ bitcoinAmount: 0.5, cashAmount: 10000, annualWithdrawal: 60000, yearsUntilRetirement: 0 });
  });

  it.each([
    ['empty', { bitcoinAmount: '' }, /required/],
    ['whitespace', { cashAmount: '   ' }, /required/],
    ['negative', { cashAmount: '-1' }, /negative/],
    ['not a number', { annualWithdrawal: 'abc' }, /must be a number/],
    ['zero withdrawal', { annualWithdrawal: '0' }, /greater than zero/],
    ['fractional years', { yearsUntilRetirement: '2.5' }, /whole number/],
    ['years above 50', { yearsUntilRetirement: '51' }, /whole number/],
    ['no assets', { bitcoinAmount: '0', cashAmount: '0' }, /Enter some Bitcoin/],
    ['empty savings when enabled', { monthlySavingsEnabled: true, monthlySavingsAmount: '' }, /Monthly savings is required/]
  ])('blocks %s', (_name, overrides, message) => {
    const result = check(overrides);
    expect(result.inputs).toBeNull();
    expect(result.errors.join(' ')).toMatch(message);
  });

  it('accepts e-notation and fractional amounts', () => {
    expect(check({ cashAmount: '1e5', bitcoinAmount: '0.12345678' }).inputs).toMatchObject({ cashAmount: 100000, bitcoinAmount: 0.12345678 });
  });

  it('accepts a cash-only or savings-only portfolio', () => {
    expect(check({ bitcoinAmount: '0' }).errors).toEqual([]);
    expect(check({ bitcoinAmount: '0', cashAmount: '0', monthlySavingsEnabled: true, monthlySavingsAmount: '500' }).errors).toEqual([]);
  });

  it.each([
    ['1000', 0],
    ['1000.01', 1]
  ])('BTC %s gives %i warning(s), never an error', (bitcoinAmount, count) => {
    const result = check({ bitcoinAmount });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(count);
  });

  it.each([
    ['10000000', 0],
    ['10000001', 1]
  ])('withdrawal %s gives %i warning(s), never an error', (annualWithdrawal, count) => {
    const result = check({ annualWithdrawal });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(count);
  });

  it('accepts the boundary years 0 and 50', () => {
    expect(check({ yearsUntilRetirement: '0' }).errors).toEqual([]);
    expect(check({ yearsUntilRetirement: '50' }).errors).toEqual([]);
  });
});
