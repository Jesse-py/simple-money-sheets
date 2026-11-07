// How much car can I afford: works backward from a monthly budget to a loan amount and a car price,
// on top of loan-engine.js (same payment formula as the loan calculator). Shared by the page and the node tests.
// Model: the monthly budget covers the loan payment plus insurance; sales tax and fees are a percentage of
// the price and are paid out of the down payment or financed; down payment includes any trade-in value.
(function (root) {
  const L = root.LoanEngine || (typeof require !== 'undefined' ? require('./loan-engine.js') : null);
  const pos = x => (isFinite(x) && x > 0 ? x : 0);

  // Largest principal that `pay` a month repays in n months at `apr` (inverse of LoanEngine.payment).
  function maxLoan(pay, apr, n) {
    const r = pos(apr) / 100 / 12;
    if (!(n > 0) || !(pay > 0)) return 0;
    return r === 0 ? pay * n : pay * (1 - Math.pow(1 + r, -n)) / r;
  }

  // income: gross per year. pct: share of gross monthly income for payment + insurance.
  function afford({ income, pct = 10, insurance = 0, down = 0, apr = 7, term = 48, taxPct = 0 }) {
    const monthly = pos(income) / 12;
    const budget = monthly * pos(pct) / 100;
    const payment = Math.max(0, budget - pos(insurance));
    const loan = maxLoan(payment, apr, term);
    // price * (1 + tax) = loan + down
    const price = (loan + pos(down)) / (1 + pos(taxPct) / 100);
    const check = loan > 0 ? L.amortize(loan, pos(apr), term) : { interest: 0, paid: 0 };
    return {
      monthly, budget, payment, loan, price,
      tax: price * pos(taxPct) / 100,
      interest: check.interest,
      totalCost: pos(down) + check.paid, // what you pay for the car, tax, and financing
      downPct: price > 0 ? pos(down) / price : 0,
    };
  }

  const TERMS = [36, 48, 60, 72, 84];
  const api = { maxLoan, afford, TERMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CarAfford = api;
})(typeof window !== 'undefined' ? window : globalThis);
