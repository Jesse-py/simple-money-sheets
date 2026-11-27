// 2025 Schedule 1-A deductions (no tax on tips, overtime, car loan interest; enhanced senior deduction) and the
// federal refund from claiming them on an amended return (Form 1040-X).
// Sources:
//   Schedule 1-A (Form 1040) 2025, irs.gov/pub/irs-pdf/f1040s1a.pdf: every line below (MAGI = Form 1040 line 11b plus
//     excluded Puerto Rico / Form 2555 / Form 4563 amounts; caps; thresholds; $100 or $200 per $1,000 rounding; 6% senior
//     phase-out; married must file jointly for tips, overtime and seniors; total goes on Form 1040 line 13b).
//   Rev. Proc. 2024-40 section 3.01 Tables 1-4: 2025 rate schedules (OBBBA changed the 2025 standard deduction, not these).
//   IRS "Working Families Tax Cuts" page: 2025 standard deduction $15,750 / $31,500 / $23,625; overtime = the premium part only.
//   Instructions for Form 1040-X (12/2025), When To File: 3 years after filing (an early return counts as filed on the due date)
//     or 2 years after paying, whichever is later.
(function (root) {
  const pos = x => (isFinite(x) && x > 0 ? Number(x) : 0);
  const joint = s => s === 'mfj';

  // Rev. Proc. 2024-40 Tables 1-4. [over, rate]
  const RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  const EDGES = {
    single: [0, 11925, 48475, 103350, 197300, 250525, 626350],
    mfj:    [0, 23850, 96950, 206700, 394600, 501050, 751600],
    qss:    [0, 23850, 96950, 206700, 394600, 501050, 751600],
    hoh:    [0, 17000, 64850, 103350, 197300, 250500, 626350],
    mfs:    [0, 11925, 48475, 103350, 197300, 250525, 375800],
  };
  const STD_2025 = { single: 15750, mfs: 15750, mfj: 31500, qss: 31500, hoh: 23625 };

  // Tax from the 2025 rate schedule. The Form 1040 Tax Table (taxable income under $100,000) uses $50 bands, so a
  // real return can differ by a few dollars.
  function tax2025(status, taxable) {
    const e = EDGES[status] || EDGES.single, ti = pos(taxable);
    let t = 0;
    for (let i = 0; i < e.length; i++) {
      const top = i + 1 < e.length ? e[i + 1] : Infinity;
      if (ti > e[i]) t += (Math.min(ti, top) - e[i]) * RATES[i];
    }
    return Math.round(t * 100) / 100;
  }

  function bracket2025(status, taxable) {
    const e = EDGES[status] || EDGES.single, ti = pos(taxable);
    let r = RATES[0];
    for (let i = 0; i < e.length; i++) if (ti > e[i]) r = RATES[i];
    return r;
  }

  // Part I: line 3.
  const magi = (agi, excluded = 0) => pos(agi) + pos(excluded);

  // Parts II and III share the $150,000 ($300,000 MFJ) threshold and lose $100 per whole $1,000 over it (lines 9-13, 17-21).
  function phaseDown(capped, m, threshold, per, roundUp) {
    const over = m - threshold;
    if (over <= 0) return capped;
    const steps = roundUp ? Math.ceil(over / 1000) : Math.floor(over / 1000);
    return Math.max(0, capped - steps * per);
  }

  // Part II, lines 7-13. qualified = line 6 (W-2 / 4137 / 1099 qualified tips).
  function tips(status, qualified, m) {
    if (status === 'mfs') return 0;
    return phaseDown(Math.min(pos(qualified), 25000), m, joint(status) ? 300000 : 150000, 100, false);
  }

  // Part III, lines 15-21. qualified = line 14c (the premium part of FLSA overtime only).
  function overtime(status, qualified, m) {
    if (status === 'mfs') return 0;
    return phaseDown(Math.min(pos(qualified), joint(status) ? 25000 : 12500), m, joint(status) ? 300000 : 150000, 100, false);
  }

  // Part IV, lines 24-30: $200 per $1,000 over, and here the IRS rounds UP (line 28). The form doesn't bar MFS.
  function carLoan(status, interest, m) {
    return phaseDown(Math.min(pos(interest), 10000), m, joint(status) ? 200000 : 100000, 200, true);
  }

  // Part V, lines 31-37. people = how many of you (and a joint-filing spouse) were born before January 2, 1961.
  function senior(status, people, m) {
    if (status === 'mfs') return 0;
    const n = Math.min(joint(status) ? 2 : 1, Math.max(0, Math.floor(pos(people))));
    const line33 = Math.max(0, m - (joint(status) ? 150000 : 75000));
    const line35 = Math.max(0, Math.round((6000 - line33 * 0.06) * 100) / 100);
    return line35 * n;
  }

  // Whole estimate.
  //   agi: Form 1040 line 11b as filed (Schedule 1-A doesn't change it). excluded: Part I line 2e.
  //   taxableFiled: line 15 as filed. claimedFiled: line 13b as filed (0 if you claimed nothing).
  function estimate(o) {
    const status = EDGES[o.status] ? o.status : 'single';
    const m = magi(o.agi, o.excluded);
    const parts = {
      tips: tips(status, o.tips, m),
      overtime: overtime(status, o.overtime, m),
      carLoan: carLoan(status, o.carInterest, m),
      senior: senior(status, o.seniors, m),
    };
    const total = Math.round((parts.tips + parts.overtime + parts.carLoan + parts.senior) * 100) / 100;
    const claimed = pos(o.claimedFiled);
    const extra = Math.max(0, total - claimed);
    const tiFiled = pos(o.taxableFiled);
    const tiNew = Math.max(0, tiFiled - extra);
    const taxFiled = tax2025(status, tiFiled), taxNew = tax2025(status, tiNew);
    return {
      status, magi: m, parts, total, claimed, extra, tiFiled, tiNew, taxFiled, taxNew,
      refund: Math.round((taxFiled - taxNew) * 100) / 100,
      unused: Math.max(0, extra - tiFiled),  // deduction that can't be used because taxable income hit zero
      rate: bracket2025(status, tiFiled),
    };
  }

  // Last day to file Form 1040-X for a 2025 refund under the 3-year rule. filed = 'yyyy-mm-dd' or ''.
  // A return filed before April 15, 2026 counts as filed on April 15, 2026. (The 2-year-from-payment rule can be later.)
  function amendDeadline(filed) {
    const due = '2026-04-15';
    const d = filed && /^\d{4}-\d{2}-\d{2}$/.test(filed) && filed > due ? filed : due;
    const [y, mo, da] = d.split('-').map(Number);
    let out = new Date(Date.UTC(y + 3, mo - 1, da));
    if (out.getUTCMonth() !== mo - 1) out = new Date(Date.UTC(y + 3, mo, 0));  // Feb 29 -> Feb 28
    const ymd = out.toISOString().slice(0, 10);
    const dow = out.getUTCDay();
    return { date: ymd, weekend: dow === 0 || dow === 6 };
  }

  const api = { tax2025, bracket2025, magi, tips, overtime, carLoan, senior, estimate, amendDeadline, STD_2025, EDGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Amend1A = api;
})(typeof window !== 'undefined' ? window : this);
