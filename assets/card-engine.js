// Single credit card payoff math, shared by the calculator page and the node tests.
// Model: interest accrues monthly (APR / 12) on the balance, then the payment is applied.
// Card issuers usually charge daily interest, so real statements differ slightly.
(function (root) {
  const MAX_MONTHS = 1200;

  // Pay the same amount every month until the balance is gone.
  function fixedPayoff(balance, apr, payment) {
    const r = apr / 100 / 12;
    let bal = balance, month = 0, interest = 0, paid = 0;
    const schedule = [];
    if (balance <= 0) return { months: 0, interest: 0, paid: 0, finished: true, schedule };
    while (bal > 0.005 && month < MAX_MONTHS) {
      month++;
      const i = bal * r;
      bal += i;
      interest += i;
      const pay = Math.min(payment, bal);
      bal -= pay;
      paid += pay;
      if (bal <= 0.005) bal = 0;
      schedule.push({ month, payment: pay, interest: i, balance: bal });
      if (month === 1 && payment <= i) break; // never pays down
    }
    return { months: month, interest, paid, finished: bal === 0, schedule };
  }

  // Fixed monthly payment that clears the balance in exactly n months (standard amortization).
  function paymentForMonths(balance, apr, n) {
    const r = apr / 100 / 12;
    if (n <= 0) return balance;
    if (r === 0) return balance / n;
    return balance * r / (1 - Math.pow(1 + r, -n));
  }

  // Common minimum payment formulas. Check your card agreement for the exact one.
  const MIN_RULES = {
    'pct1-interest': { label: '1% of balance + interest', fn: (bal, i) => 0.01 * bal + i },
    pct2: { label: '2% of balance', fn: (bal, i) => 0.02 * (bal + i) },
    pct3: { label: '3% of balance', fn: (bal, i) => 0.03 * (bal + i) },
  };

  // Pay only the minimum each month (it shrinks as the balance shrinks).
  function minimumPayoff(balance, apr, rule, floor) {
    const r = apr / 100 / 12;
    const f = MIN_RULES[rule].fn;
    let bal = balance, month = 0, interest = 0, paid = 0, first = 0;
    while (bal > 0.005 && month < MAX_MONTHS) {
      month++;
      const i = bal * r;
      const due = Math.min(bal + i, Math.max(floor, f(bal, i)));
      if (month === 1) first = due;
      bal += i - due;
      interest += i;
      paid += due;
      if (bal <= 0.005) bal = 0;
    }
    return { months: month, interest, paid, firstPayment: first, finished: bal === 0 };
  }

  const api = { fixedPayoff, paymentForMonths, minimumPayoff, MIN_RULES, MAX_MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CardEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
