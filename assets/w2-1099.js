// 1099 vs W-2 comparison on top of tax-engine.js (federal only, for this income alone).
// W-2 side: employee Social Security 6.2% up to the wage base + Medicare 1.45% (IRS Topic 751),
// plus income tax and Additional Medicare Tax from TaxEngine.estimate with the salary as wages.
// 1099 side: TaxEngine.estimate with the contract profit (SE tax, half-SE deduction, QBI).
// Every tax figure is the increase over a baseline where you earn nothing (a spouse's wages
// stay in both), so a working spouse moves the bracket without being counted as your pay.
(function (root) {
  const T = root.TaxEngine || (typeof require !== 'undefined' ? require('./tax-engine.js') : null);

  function household(inp, extra) {
    return T.estimate(Object.assign({ year: inp.year, status: inp.status, profit: 0, wages: 0,
      spouseWages: inp.spouseWages || 0 }, extra));
  }

  function w2(inp, base) {
    const salary = Math.max(0, inp.salary || 0);
    const e = household(inp, { wages: salary });
    const addl = e.addlMedicare - base.addlMedicare;
    const fica = 0.062 * Math.min(salary, T.YEARS[inp.year].ssWageBase) + 0.0145 * salary + addl;
    const incomeTax = e.totalTax - base.totalTax - addl;
    const takeHome = salary - fica - incomeTax;
    const benefits = Math.max(0, inp.benefits || 0);
    return { gross: salary, expenses: 0, fica, incomeTax, takeHome, benefits, value: takeHome + benefits };
  }

  function contract(inp, base, gross) {
    const expenses = Math.max(0, inp.expenses || 0);
    const e = household(inp, { profit: gross - expenses });
    const addl = e.addlMedicare - base.addlMedicare;
    const fica = e.se.tax + addl;
    const incomeTax = e.totalTax - base.totalTax - e.se.tax - addl;
    const takeHome = gross - expenses - fica - incomeTax;
    return { gross, expenses, fica, incomeTax, takeHome, benefits: 0, value: takeHome };
  }

  // Yearly 1099 pay whose take-home equals target (bisection; take-home rises with pay).
  function breakEvenGross(inp, base, target) {
    let lo = 0, hi = 2 * Math.max(target, 0) + Math.max(0, inp.expenses || 0) + 100000;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (contract(inp, base, mid).value < target) lo = mid; else hi = mid;
    }
    return hi;
  }

  function compare(inp) {
    const base = household(inp, {});
    const hours = Math.max(0, inp.hours || 0) * Math.max(0, inp.weeks || 0);
    const W = w2(inp, base);
    const C = contract(inp, base, Math.max(0, inp.rate || 0) * hours);
    const g = breakEvenGross(inp, base, W.value);
    return { w2: W, c1099: C, breakEvenGross: g, breakEvenRate: hours > 0 ? g / hours : null };
  }

  const api = { compare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.W2vs1099 = api;
})(typeof window !== 'undefined' ? window : globalThis);
