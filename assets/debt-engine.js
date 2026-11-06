// Debt payoff simulation shared by the calculator page and the node tests.
// Model: a fixed total monthly budget = sum of minimums + extra. Each month interest
// accrues (APR / 12), every open debt gets its minimum (capped at its balance), and the
// leftover goes to debts in priority order. Freed-up minimums roll into the leftover.
(function (root) {
  const MAX_MONTHS = 600;

  function order(debts, method) {
    const idx = debts.map((_, i) => i);
    if (method === 'avalanche') {
      idx.sort((a, b) => debts[b].apr - debts[a].apr || debts[a].balance - debts[b].balance || a - b);
    } else {
      idx.sort((a, b) => debts[a].balance - debts[b].balance || debts[b].apr - debts[a].apr || a - b);
    }
    return idx;
  }

  function simulate(debtsIn, extra, method) {
    const debts = debtsIn.filter(d => d.balance > 0);
    const budget = debts.reduce((s, d) => s + d.min, 0) + Math.max(0, extra || 0);
    const pri = order(debts, method);
    const bal = debts.map(d => d.balance);
    const paidOff = debts.map(() => null);
    const interestPaid = debts.map(() => 0);
    const schedule = [];
    let month = 0;
    let totalInterest = 0;
    let totalPaid = 0;

    while (bal.some(b => b > 0.005) && month < MAX_MONTHS) {
      month++;
      const pay = bal.map(() => 0);
      for (let i = 0; i < debts.length; i++) {
        if (bal[i] <= 0.005) continue;
        const interest = bal[i] * debts[i].apr / 100 / 12;
        bal[i] += interest;
        interestPaid[i] += interest;
        totalInterest += interest;
      }
      let left = budget;
      for (let i = 0; i < debts.length; i++) {
        if (bal[i] <= 0.005) continue;
        pay[i] = Math.min(debts[i].min, bal[i]);
        left -= pay[i];
      }
      for (const i of pri) {
        if (left <= 0.005) break;
        if (bal[i] <= 0.005) continue;
        const add = Math.min(bal[i] - pay[i], left);
        pay[i] += add;
        left -= add;
      }
      for (let i = 0; i < debts.length; i++) {
        if (pay[i] === 0) continue;
        bal[i] -= pay[i];
        totalPaid += pay[i];
        if (bal[i] <= 0.005) { bal[i] = 0; if (paidOff[i] === null) paidOff[i] = month; }
      }
      schedule.push({ month, payments: pay.slice(), balances: bal.slice(), remaining: bal.reduce((s, b) => s + b, 0) });
    }

    return {
      method,
      budget,
      months: month,
      finished: !bal.some(b => b > 0.005),
      totalInterest,
      totalPaid,
      order: pri.map(i => debts[i].name),
      debts: debts.map((d, i) => ({ name: d.name, paidOffMonth: paidOff[i], interest: interestPaid[i] })),
      schedule,
    };
  }

  const api = { simulate, MAX_MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DebtEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
