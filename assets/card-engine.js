// Single credit card payoff math, shared by the calculator page and the node tests.
// Model: interest accrues each payment period (APR / 12 monthly, APR / 26 every two weeks, APR / 52 weekly) on the
// balance, then the payment is applied. Card issuers usually charge daily interest, so real statements differ slightly.
(function (root) {
  const MAX_MONTHS = 1200;

  // Pay the same amount every period until the balance is gone. perYear: 12 monthly (default), 26 biweekly, 52 weekly.
  // `month` in the result and schedule counts payment periods.
  function fixedPayoff(balance, apr, payment, perYear = 12) {
    const r = apr / 100 / perYear;
    const maxPeriods = Math.round(MAX_MONTHS * perYear / 12);
    let bal = balance, month = 0, interest = 0, paid = 0;
    const schedule = [];
    if (balance <= 0) return { months: 0, interest: 0, paid: 0, finished: true, schedule };
    while (bal > 0.005 && month < maxPeriods) {
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

  // Fixed payment that clears the balance in exactly n periods (standard amortization; perYear as in fixedPayoff).
  function paymentForMonths(balance, apr, n, perYear = 12) {
    const r = apr / 100 / perYear;
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

  // Balance transfer: the fee is added to the new card's balance on day one, then the intro APR applies
  // for introMonths, then the regular APR. Same fixed payment every month, same monthly interest model.
  function transferFee(balance, feePct, feeMin) {
    return balance > 0 ? Math.max(feeMin || 0, balance * feePct / 100) : 0;
  }

  function transferPayoff(balance, feePct, feeMin, introApr, introMonths, postApr, payment) {
    const fee = transferFee(balance, feePct, feeMin);
    let bal = balance + fee, month = 0, interest = 0, paid = 0, promoEndBalance = null;
    const schedule = [];
    if (balance <= 0) return { fee: 0, months: 0, interest: 0, paid: 0, cost: 0, promoEndBalance: 0, finished: true, schedule };
    while (bal > 0.005 && month < MAX_MONTHS) {
      month++;
      const promo = month <= introMonths;
      const i = bal * (promo ? introApr : postApr) / 100 / 12;
      bal += i;
      interest += i;
      const pay = Math.min(payment, bal);
      bal -= pay;
      paid += pay;
      if (bal <= 0.005) bal = 0;
      schedule.push({ month, promo, payment: pay, interest: i, balance: bal });
      if (month === introMonths) promoEndBalance = bal;
      if (!promo && pay <= i && bal > 0) break; // never pays down after the promo
    }
    if (introMonths <= 0) promoEndBalance = balance + fee; // no promo: nothing is paid before the regular rate
    else if (promoEndBalance === null) promoEndBalance = bal; // paid off before the promo ended (0), or stopped early
    return { fee, months: month, interest, paid, cost: fee + interest, promoEndBalance, finished: bal === 0, schedule };
  }

  // Fixed payment that clears balance + fee by the last promo month.
  function paymentToClearPromo(balance, feePct, feeMin, introApr, introMonths) {
    return paymentForMonths(balance + transferFee(balance, feePct, feeMin), introApr, introMonths);
  }

  const api = { fixedPayoff, paymentForMonths, minimumPayoff, transferFee, transferPayoff, paymentToClearPromo, MIN_RULES, MAX_MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CardEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
