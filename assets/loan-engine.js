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

  const api = { payment, amortize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoanEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
