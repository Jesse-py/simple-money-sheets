// Federal quarterly estimated tax for the self-employed, following the IRS 2026 Form 1040-ES
// "Estimated Tax Worksheet" and "Self-Employment Tax and Deduction Worksheet" line by line.
// Shared by the calculator page and the node tests (scripts/test-tax-engine.js).
// Sources (every number below):
//   2026 brackets, standard deduction, QBI thresholds: Rev. Proc. 2025-32 (irs.gov/pub/irs-drop/rp-25-32.pdf)
//   2027 brackets, standard deduction, QBI thresholds: Rev. Proc. 2026-35 (irs.gov/pub/irs-drop/rp-26-35.pdf)
//   SE tax rates, $1,000 rule, 90% / 100% / 110% safe harbor, due dates, $400 minimum QBI deduction: 2026 Form 1040-ES
//   Social Security wage base: 2026 Form 1040-ES ($184,500); SSA 2027 COLA fact sheet ($192,300)
//   Additional Medicare Tax thresholds: IRC 1401(b)(2) / Form 8959 (not indexed)
(function (root) {
  // Brackets: [lower bound of the rate, rate]. Statuses: single, mfj, mfs, hoh.
  const YEARS = {
    2026: {
      brackets: {
        single: [[0, .10], [12400, .12], [50400, .22], [105700, .24], [201775, .32], [256225, .35], [640600, .37]],
        mfj: [[0, .10], [24800, .12], [100800, .22], [211400, .24], [403550, .32], [512450, .35], [768700, .37]],
        mfs: [[0, .10], [12400, .12], [50400, .22], [105700, .24], [201775, .32], [256225, .35], [384350, .37]],
        hoh: [[0, .10], [17700, .12], [67450, .22], [105700, .24], [201750, .32], [256200, .35], [640600, .37]],
      },
      standard: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150 },
      ssWageBase: 184500,
      // 199A(e)(2) threshold and the end of the phase-in range.
      qbi: { mfj: [403500, 553500], mfs: [201775, 276775], single: [201750, 276750], hoh: [201750, 276750] },
      qbiMin: { income: 1000, deduction: 400 },
      due: ['Apr 15, 2026', 'Jun 15, 2026', 'Sep 15, 2026', 'Jan 15, 2027'],
      dueConfirmed: true,
    },
    2027: {
      brackets: {
        single: [[0, .10], [12800, .12], [52025, .22], [109125, .24], [208325, .32], [264550, .35], [661375, .37]],
        mfj: [[0, .10], [25600, .12], [104050, .22], [218250, .24], [416650, .32], [529100, .35], [793650, .37]],
        mfs: [[0, .10], [12800, .12], [52025, .22], [109125, .24], [208325, .32], [264550, .35], [396825, .37]],
        hoh: [[0, .10], [18250, .12], [69650, .22], [109100, .24], [208300, .32], [264550, .35], [661350, .37]],
      },
      standard: { single: 16600, mfj: 33200, mfs: 16600, hoh: 24925 },
      ssWageBase: 192300,
      qbi: { mfj: [416600, 566600], mfs: [208325, 283325], single: [208300, 283300], hoh: [208300, 283300] },
      qbiMin: { income: 1030, deduction: 415 },
      // Jan 15, 2028 is a Saturday and Jan 17 is Martin Luther King Jr. Day, so the 4th payment
      // moves to the next business day. The 2027 Form 1040-ES isn't out yet; check it in January.
      due: ['Apr 15, 2027', 'Jun 15, 2027', 'Sep 15, 2027', 'Jan 18, 2028'],
      dueConfirmed: false,
    },
  };
  const ADDL_MEDICARE = { single: 200000, hoh: 200000, mfj: 250000, mfs: 125000 };
  const CHARITY_MAX = { single: 1000, hoh: 1000, mfs: 1000, mfj: 2000 };

  function incomeTax(taxable, year, status) {
    const b = YEARS[year].brackets[status];
    let tax = 0;
    for (let i = 0; i < b.length; i++) {
      const lo = b[i][0], hi = i + 1 < b.length ? b[i + 1][0] : Infinity;
      if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * b[i][1];
    }
    return tax;
  }

  // SE Tax and Deduction Worksheet (lines 3-11). wages = W-2 wages subject to Social Security tax.
  function seTax(profit, wages, year) {
    const earnings = Math.max(0, profit) * 0.9235;               // line 3
    if (earnings < 400) return { earnings, medicare: 0, socialSecurity: 0, tax: 0, deduction: 0 };
    const medicare = earnings * 0.029;                            // line 4
    const room = Math.max(0, YEARS[year].ssWageBase - wages);     // line 7
    const socialSecurity = Math.min(earnings, room) * 0.124;      // lines 8-9
    const tax = medicare + socialSecurity;                        // line 10
    return { earnings, medicare, socialSecurity, tax, deduction: tax / 2 };  // line 11
  }

  // Simplified QBI deduction for a sole proprietor with no employees and no depreciable
  // business property (W-2 wage / UBIA limit = 0). Below the threshold: 20% of QBI, limited
  // to 20% of taxable income. In the phase-in range it shrinks (faster for a specified
  // service business); above the range it's zero. The OBBBA $400 minimum applies when
  // active QBI is at least $1,000.
  function qbiDeduction(qbi, tiBeforeQbi, year, status, sstb) {
    if (qbi <= 0 || tiBeforeQbi <= 0) return 0;
    const [thr, end] = YEARS[year].qbi[status];
    let ded;
    if (tiBeforeQbi <= thr) ded = 0.2 * qbi;
    else if (tiBeforeQbi >= end) ded = 0;
    else {
      const ap = 1 - (tiBeforeQbi - thr) / (end - thr);
      ded = 0.2 * qbi * (sstb ? ap * ap : ap);
    }
    ded = Math.min(ded, 0.2 * tiBeforeQbi);
    const m = YEARS[year].qbiMin;
    if (qbi >= m.income) ded = Math.max(ded, m.deduction);
    return Math.min(ded, tiBeforeQbi);
  }

  // Inputs (all annual dollars for the tax year):
  //   year, status, profit (net SE profit, Schedule C line 31), wages (the self-employed
  //   person's own W-2 wages), spouseWages (joint filers: the other spouse's W-2 wages), otherIncome,
  //   adjustments (other above-the-line deductions, e.g. SEP-IRA, SE health insurance),
  //   itemized (0 = take the standard deduction), charity (cash gifts if not itemizing),
  //   extraDeductions (Schedule 1-A: tips, overtime, car loan interest, senior deduction),
  //   sstb (specified service business), credits (nonrefundable), refundableCredits,
  //   withholding (federal income tax withheld for the year), priorTax (total tax on last
  //   year's return; null = unknown), priorAgi, paid (estimated payments already made).
  function estimate(inp) {
    const year = inp.year, status = inp.status;
    const n = k => Math.max(0, Number(inp[k]) || 0);
    const profit = Number(inp.profit) || 0;
    const wages = n('wages');
  const spouseWages = inp.status === 'mfj' ? n('spouseWages') : 0;
    const se = seTax(profit, wages, year);
    const agi = Math.max(0, profit + wages + spouseWages + (Number(inp.otherIncome) || 0) - se.deduction - n('adjustments'));  // line 1
    const itemizing = n('itemized') > 0;
    const stdDed = YEARS[year].standard[status];
    const charity = itemizing ? 0 : Math.min(n('charity'), CHARITY_MAX[status]);
    const deduction = itemizing ? n('itemized') : stdDed + charity;                                  // line 2a
    const extra = n('extraDeductions');                                                              // line 2c
    const tiBeforeQbi = Math.max(0, agi - deduction - extra);
    const qbi = qbiDeduction(profit - se.deduction, tiBeforeQbi, year, status, !!inp.sstb);          // line 2b
    const taxable = Math.max(0, tiBeforeQbi - qbi);                                                  // line 3
    const regularTax = incomeTax(taxable, year, status);                                             // line 4
    const afterCredits = Math.max(0, regularTax - n('credits'));                                     // lines 6-8
    const addlMedicare = 0.009 * Math.max(0, wages + spouseWages + se.earnings - ADDL_MEDICARE[status]);          // line 10
    const totalTax = Math.max(0, afterCredits + se.tax + addlMedicare - n('refundableCredits'));     // line 11c
    const ninety = 0.9 * totalTax;                                                                   // line 12a
    const hasPrior = inp.priorTax !== null && inp.priorTax !== undefined && inp.priorTax !== '';
    const priorPct = n('priorAgi') > (status === 'mfs' ? 75000 : 150000) ? 1.1 : 1.0;
    const priorReq = hasPrior ? priorPct * n('priorTax') : Infinity;                                 // line 12b
    const required = Math.min(ninety, priorReq);                                                     // line 12c
    const withholding = n('withholding');                                                            // line 13
    const afterWithholding = required - withholding;                                                 // line 14a
    let mustPay = afterWithholding > 0 && totalTax - withholding >= 1000;                            // line 14b
    let reason = '';
    if (afterWithholding <= 0) reason = 'withholding';
    else if (totalTax - withholding < 1000) reason = 'under1000';
    if (hasPrior && n('priorTax') === 0) { mustPay = false; reason = 'noPriorTax'; }
    const annual = mustPay ? afterWithholding : 0;
    const quarterly = annual / 4;                                                                    // line 15
    const remaining = Math.max(0, annual - n('paid'));
    return {
      year, status, se, agi, stdDed, itemizing, charity, deduction, extra, tiBeforeQbi, qbi, taxable,
      regularTax, afterCredits, addlMedicare, totalTax, ninety, priorReq: hasPrior ? priorReq : null,
      priorPct, required, withholding, mustPay, reason, annual, quarterly, remaining,
      balanceDue: Math.max(0, totalTax - withholding - Math.max(annual, n('paid'))),
      due: YEARS[year].due, dueConfirmed: YEARS[year].dueConfirmed,
      setAside: profit > 0 ? (totalTax - incomeTaxWithout(inp)) / profit : 0,
    };
  }

  // Total tax with zero SE profit, so the page can show what share of each extra
  // self-employed dollar to set aside.
  function incomeTaxWithout(inp) {
    if (!(Number(inp.profit) > 0)) return 0;
    return estimate(Object.assign({}, inp, { profit: 0 })).totalTax;
  }

  const api = { YEARS, ADDL_MEDICARE, CHARITY_MAX, incomeTax, seTax, qbiDeduction, estimate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaxEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
