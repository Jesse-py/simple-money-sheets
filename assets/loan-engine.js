// Fixed-rate installment loan math (auto, personal, student, mortgage principal + interest),
// shared by the loan calculator page and the node tests.
// Model: monthly interest = balance x APR / 12, then the payment is applied.
(function (root) {
  // Standard amortized payment that pays off `principal` in exactly n months.
  function payment(principal, apr, n) {
    const r = apr / 100 / 12;
    if (n <= 0) return principal;
    if (r === 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }

  // Pay the scheduled payment plus `extra` every month, plus an optional one-time `lump`
  // in month `lumpMonth` (1 = first payment). Stops when the balance reaches zero.
  function amortize(principal, apr, n, extra = 0, lump = 0, lumpMonth = 0) {
    const r = apr / 100 / 12;
    const pay = payment(principal, apr, n);
    let bal = principal, month = 0, interest = 0, paid = 0;
    const schedule = [];
    while (bal > 0.005 && month < n) {
      month++;
      const i = bal * r;
      const due = pay + extra + (month === lumpMonth ? lump : 0);
      const amt = Math.min(due, bal + i);
      bal += i - amt;
      if (bal <= 0.005) bal = 0;
      interest += i;
      paid += amt;
      schedule.push({ month, payment: amt, principal: amt - i, interest: i, balance: bal });
    }
    return { payment: pay, months: month, interest, paid, schedule };
  }

  // Debt consolidation loan that pays off `payoff` dollars of debt. An origination fee (percent) is either taken out of
  // the loan ('deducted': you borrow payoff / (1 - fee) so the proceeds still cover the debts) or added on top ('added':
  // you borrow payoff x (1 + fee)). The fee is a finance charge (12 CFR 1026.4(b)(3)), so the loan's APR, the rate that
  // makes the payments worth exactly the money you receive (the amount financed, 1026.18(b)), is above the interest rate.
  function consolidation(payoff, ratePct, n, feePct = 0, feeMode = 'deducted', budget = 0) {
    const f = Math.max(0, feePct) / 100;
    const principal = !(payoff > 0) ? 0 : feeMode === 'added' ? payoff * (1 + f) : f < 1 ? payoff / (1 - f) : 0;
    const fee = principal - payoff;
    const loan = amortize(principal, ratePct, n);
    const res = { principal, fee, payment: loan.payment, months: loan.months, interest: loan.interest, cost: loan.interest + fee,
      apr: principal > 0 ? aprFor(payoff, loan.payment, n) : 0 };
    // Paying a larger monthly budget into the same loan (no prepayment penalty assumed).
    if (budget > loan.payment + 0.005) {
      const fast = amortize(principal, ratePct, n, budget - loan.payment);
      res.atBudget = { months: fast.months, interest: fast.interest, cost: fast.interest + fee };
    }
    return res;
  }
  // APR (percent, monthly compounding x 12) at which n payments of `pay` are worth `amount` today. Bisection on the
  // monthly rate; the present value falls as the rate rises.
  function aprFor(amount, pay, n) {
    if (!(amount > 0) || !(pay > 0) || n <= 0 || pay * n <= amount) return 0;
    const pv = r => pay * (1 - Math.pow(1 + r, -n)) / r;
    let lo = 1e-12, hi = 1;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (pv(mid) > amount) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2 * 12 * 100;
  }

  const api = { payment, amortize, consolidation, aprFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoanEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
