// Underpayment of estimated tax penalty for individuals: Form 2210, Part III (regular method) and its penalty worksheet.
// Sources:
//   Instructions for Form 2210 (2025): required annual payment (90% of this year / 100% or 110% of last year), the $1,000 and
//     no-prior-tax exceptions, payments applied to the earliest underpayment first, days counted from the due date to the
//     payment date, rate periods ending 06/30, 09/30, 12/31 and 04/15, "× days / 365 × rate", and the January 31 rule
//     (for 2026, Form 1040-ES moves it to February 1, 2027).
//   IRC 6654(g): withholding is treated as paid in equal parts on each due date (unless the taxpayer elects actual dates).
//   Underpayment rates (IRC 6621, per quarter): 2025 all quarters 7% (2025 Form 2210 worksheet uses 0.07 in every period).
//     2026: Q1 7% (IRB 2025-48), Q2 6% (Rev. Rul. 2026-5, IRB 2026-8), Q3 7% (Rev. Rul. 2026-10, IRB 2026-22),
//     Q4 7% (Rev. Rul. 2026-15, IRB 2026-36). Q1 2027 not announced yet (IRS usually announces it in late November).
(function (root) {
  const DAY = 86400000;
  const dn = s => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const ds = n => new Date(n * DAY).toISOString().slice(0, 10);
  const cents = x => Math.round(x * 100) / 100;
  const pos = x => (isFinite(x) && x > 0 ? Number(x) : 0);

  // due: the dates the penalty is figured from (the column headings on the worksheet).
  // onTime: last day a payment still counts as on time (next business day when the due date is a weekend).
  // ends: the end of each rate period; period 1 starts on the first due date, and the last period ends on the return due date.
  const YEARS = {
    2025: {
      due: ['2025-04-15', '2025-06-15', '2025-09-15', '2026-01-15'],
      onTime: ['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15'], // June 15, 2025 was a Sunday
      ends: ['2025-06-30', '2025-09-30', '2025-12-31', '2026-04-15'],
      rates: [0.07, 0.07, 0.07, 0.07],
      jan31: '2026-01-31',
    },
    2026: {
      due: ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'],
      onTime: ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'],
      ends: ['2026-06-30', '2026-09-30', '2026-12-31', '2027-04-15'],
      rates: [0.06, 0.07, 0.07, null], // null: Q1 2027 rate not announced yet; pass lastRate (default 7%)
      jan31: '2027-02-01', // Form 1040-ES (2026): file by February 1, 2027 (January 31 is a Sunday)
    },
  };
  const DEFAULT_LAST_RATE = 0.07;

  // Penalty on `amount` that was due on `start` and paid on `paid` (day numbers), split across the rate periods.
  function chunkPenalty(Y, rates, amount, start, paid) {
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const lo = Math.max(start, k === 0 ? dn(Y.due[0]) : dn(Y.ends[k - 1]));
      const hi = Math.min(paid, dn(Y.ends[k]));
      if (hi > lo) total += amount * (hi - lo) / 365 * rates[k];
    }
    return total;
  }

  // inp: { year, currentTax, withholding, priorTax (null = unknown / no 12-month return), priorAgiHigh,
  //        payments: [{ date: 'yyyy-mm-dd', amount }], lastRate, jan31 (file and pay in full by January 31) }
  function compute(inp) {
    const year = Number(inp.year) in YEARS ? Number(inp.year) : 2026;
    const Y = YEARS[year];
    const lastRate = isFinite(inp.lastRate) && inp.lastRate >= 0 ? Number(inp.lastRate) : DEFAULT_LAST_RATE;
    const rates = Y.rates.map(r => (r === null ? lastRate : r));
    const currentTax = pos(inp.currentTax), withholding = pos(inp.withholding);
    const priorTax = inp.priorTax === null || inp.priorTax === undefined || inp.priorTax === '' || !isFinite(inp.priorTax)
      ? null : Math.max(0, Number(inp.priorTax));
    const priorPct = inp.priorAgiHigh ? 1.1 : 1;
    const ninety = cents(0.9 * currentTax);
    const priorReq = priorTax === null ? null : cents(priorPct * priorTax);
    const required = priorReq === null ? ninety : Math.min(ninety, priorReq);
    const installment = cents(required / 4);
    const end = dn(Y.ends[3]);
    const base = { year, rates, ninety, priorReq, priorPct, required, installment, due: Y.due, end: Y.ends[3] };

    let exception = null;
    if (currentTax - withholding < 1000) exception = 'under1000';
    else if (priorTax === 0) exception = 'noPriorTax';
    if (exception) return Object.assign(base, { exception, installments: [], penalty: 0, unpaid: 0 });

    const payments = (inp.payments || [])
      .filter(p => p && pos(p.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date || ''))
      .map(p => ({ day: dn(p.date), amount: pos(p.amount) }));
    if (inp.jan31) payments.push({ day: dn(Y.jan31), amount: Infinity, jan31: true });
    payments.sort((a, b) => a.day - b.day);

    const inst = Y.due.map((d, i) => ({ due: d, required: installment, credited: 0, underpayment: 0, chunks: [], penalty: 0 }));
    const open = []; // { i, bal } unpaid installment balances, earliest first
    let pool = 0;    // paid but not yet needed (counts toward the next installment)
    // Apply `amount` paid on `day` to the earliest unpaid balances first; returns what's left.
    const payOpen = (amount, day) => {
      while (amount > 1e-9 && open.length) {
        const o = open[0], used = Math.min(o.bal, amount);
        inst[o.i].chunks.push({ paid: ds(day), amount: cents(used), days: day - dn(Y.due[o.i]),
          penalty: chunkPenalty(Y, rates, used, dn(Y.due[o.i]), day) });
        o.bal -= used; amount -= used;
        if (o.bal <= 1e-9) open.shift();
      }
      return amount;
    };

    let p = 0;
    for (let i = 0; i < 4; i++) {
      for (; p < payments.length && payments[p].day <= dn(Y.onTime[i]); p++) pool += payOpen(payments[p].amount, payments[p].day);
      const due = dn(Y.due[i]);
      const credit = payOpen(pool + withholding / 4, due); // withholding is deemed paid on each due date
      const applied = Math.min(credit, installment);
      inst[i].credited = cents(applied);
      inst[i].underpayment = cents(installment - applied);
      pool = credit - applied;
      if (installment - applied > 1e-9) open.push({ i, bal: installment - applied });
    }
    for (; p < payments.length && payments[p].day < end; p++) payOpen(payments[p].amount, payments[p].day);
    let unpaid = 0;
    for (const o of open) unpaid += o.bal;
    payOpen(Infinity, end); // whatever is still unpaid stops counting on the return due date

    inst.forEach((x, i) => {
      if (inp.jan31 && i === 3) x.chunks.forEach(c => { c.penalty = 0; });
      x.chunks.forEach(c => { c.penalty = cents(c.penalty); });
      x.penalty = cents(x.chunks.reduce((s, c) => s + c.penalty, 0));
    });
    return Object.assign(base, { exception, installments: inst, penalty: cents(inst.reduce((s, x) => s + x.penalty, 0)),
      unpaid: cents(unpaid) });
  }

  // As of `asOf`: how much is overdue, what one more day costs, and the penalty if it's all paid that day.
  function payNow(inp, asOf) {
    const Y = YEARS[Number(inp.year) in YEARS ? Number(inp.year) : 2026];
    const t = dn(asOf);
    if (inp.jan31 || t <= dn(Y.due[0]) || t >= dn(Y.ends[3])) return null;
    const past = compute(Object.assign({}, inp, { payments: (inp.payments || []).filter(p => p && p.date && dn(p.date) <= t) }));
    if (past.exception) return null;
    let behind = 0;
    past.installments.forEach(x => {
      if (dn(x.due) >= t) return;
      x.chunks.forEach(c => { if (dn(c.paid) > t) behind += c.amount; });
    });
    behind = cents(behind);
    if (behind <= 0) return { behind: 0, perDay: 0, penalty: null };
    let k = 0;
    while (k < 3 && t >= dn(Y.ends[k])) k++;
    const later = (inp.payments || []).filter(p => p && p.date && dn(p.date) > t);
    const r = compute(Object.assign({}, inp, { payments: (inp.payments || []).filter(p => p && p.date && dn(p.date) <= t)
      .concat([{ date: asOf, amount: behind }], later) }));
    return { behind, perDay: cents(behind * past.rates[k] / 365), penalty: r.penalty };
  }

  const api = { YEARS, DEFAULT_LAST_RATE, compute, payNow, chunkPenalty, dn, ds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PenaltyEngine = api;
})(typeof window !== 'undefined' ? window : this);
