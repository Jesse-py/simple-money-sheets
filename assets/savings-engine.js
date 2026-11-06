// Savings goal math, shared by the calculator page and the node tests.
// Model: interest is quoted as APY and compounds monthly, at the monthly rate (1 + APY)^(1/12) - 1.
// Each month the balance earns interest, then that month's deposit is added (end-of-month deposits).
(function (root) {
  const MAX_MONTHS = 1200;

  const monthlyRate = apy => Math.pow(1 + apy / 100, 1 / 12) - 1;

  // Balance after n months, starting with `start` and adding `deposit` at the end of each month.
  function futureValue(start, apy, deposit, n) {
    const r = monthlyRate(apy), g = Math.pow(1 + r, n);
    return start * g + (r === 0 ? deposit * n : deposit * (g - 1) / r);
  }

  // Monthly deposit that reaches `goal` in exactly n months (0 if interest alone gets there).
  function depositForMonths(goal, start, apy, n) {
    const r = monthlyRate(apy), g = Math.pow(1 + r, n);
    const gap = goal - start * g;
    if (gap <= 0) return 0;
    return r === 0 ? gap / n : gap * r / (g - 1);
  }

  // Month-by-month growth. Stops when the goal is reached, or after `months` if given.
  function project(goal, start, apy, deposit, months) {
    const r = monthlyRate(apy);
    const limit = months || MAX_MONTHS;
    let bal = start, interest = 0, deposits = 0, month = 0, reachedAt = start >= goal ? 0 : null;
    const schedule = [];
    while (month < limit && (months || reachedAt === null)) {
      month++;
      const i = bal * r;
      bal += i + deposit;
      interest += i;
      deposits += deposit;
      schedule.push({ month, deposit, interest: i, balance: bal });
      if (reachedAt === null && bal >= goal - 0.005) reachedAt = month;
      if (!months && month === 1 && deposit <= 0 && r === 0) break; // never grows
    }
    return { reachedAt, months: month, interest, deposits, balance: bal, schedule };
  }

  root.SavingsEngine = { MAX_MONTHS, monthlyRate, futureValue, depositForMonths, project };
})(typeof window !== 'undefined' ? window : module.exports);
