// Business mileage deduction (IRS standard mileage rate) and the federal tax it saves, on top of tax-engine.js.
// Sources: IRS "Standard mileage rates" page (irs.gov/tax-professionals/standard-mileage-rates):
//   2026: 72.5 cents Jan 1 - Jun 30 (IR-2025-128, Notice 2026-10), 76 cents Jul 1 - Dec 31 (IR-2026-29, Announcement 2026-11).
//   Each mile uses the rate for the period it was driven.
// Parking fees and tolls for business trips are deductible on top of the rate (Pub 463, ch. 4).
(function (root) {
  const T = root.TaxEngine || (typeof require !== 'undefined' ? require('./tax-engine.js') : null);

  const RATES = {
    2026: [
      { label: 'Jan 1 – Jun 30, 2026', business: 0.725, medical: 0.205, charity: 0.14 },
      { label: 'Jul 1 – Dec 31, 2026', business: 0.76, medical: 0.235, charity: 0.14 },
    ],
  };

  const pos = x => (isFinite(x) && x > 0 ? x : 0);
  const cents = x => Math.round(x * 100) / 100;

  // miles: one number per rate period for the year. Returns the deduction (Schedule C line 9).
  function deduction(year, miles, parkingTolls = 0) {
    const byPeriod = RATES[year].map((p, i) => {
      const m = pos(miles[i]);
      return { label: p.label, rate: p.business, miles: m, amount: cents(m * p.business) };
    });
    const mileage = cents(byPeriod.reduce((s, p) => s + p.amount, 0));
    return { byPeriod, miles: byPeriod.reduce((s, p) => s + p.miles, 0), mileage,
      parkingTolls: cents(pos(parkingTolls)), total: cents(mileage + pos(parkingTolls)) };
  }

  // Federal tax saved by deducting `amount` from self-employment profit (SE tax + income tax,
  // standard deduction, no other income unless given). spouseWages only counts for joint filers.
  function taxSaved(year, status, profit, amount, spouseWages = 0) {
    const base = { year, status, profit: pos(profit), spouseWages };
    const before = T.estimate(base);
    const after = T.estimate(Object.assign({}, base, { profit: Math.max(0, pos(profit) - pos(amount)) }));
    const se = before.se.tax - after.se.tax;
    const total = before.totalTax - after.totalTax;
    return { total, se, income: total - se, before: before.totalTax, after: after.totalTax };
  }

  const api = { RATES, deduction, taxSaved };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mileage = api;
})(typeof window !== 'undefined' ? window : globalThis);
