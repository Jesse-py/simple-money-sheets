// Home office deduction (business use of home, Schedule C line 30): simplified method vs regular
// (actual expense) method, plus the federal tax each saves, on top of tax-engine.js.
// Sources:
//   Pub 587 (2025), Business Use of Your Home: business percentage, direct vs indirect expenses,
//     deduction limit and the order expenses are allowed in (depreciation last), carryover,
//     Table 2 (MACRS 39-year nonresidential real property, first-year % by month), simplified
//     method ($5 per sq ft, 300 sq ft cap, average monthly area for part-year use, gross income limit).
//   Instructions for Form 8829 (2025): standard-deduction filers put all mortgage interest and real
//     estate taxes on lines 16-17 (with operating expenses), not lines 10-11; employees can't deduct.
//   Pub 946, Table A-7a: 2.564% for recovery years 2-39.
//   IRS "Simplified option for home office deduction" page: no depreciation or recapture for
//     simplified-method years; excess over the gross income limit can't be carried over.
(function (root) {
  const T = root.TaxEngine || (typeof require !== 'undefined' ? require('./tax-engine.js') : null);

  const RATE = 5, MAX_SQFT = 300;
  // Pub 587 Table 2, by month first used for business (1 = January).
  const FIRST_YEAR = [0, 0.02461, 0.02247, 0.02033, 0.01819, 0.01605, 0.01391, 0.01177, 0.00963, 0.00749, 0.00535, 0.00321, 0.00107];
  const LATER_YEAR = 0.02564;  // Pub 946 Table A-7a, years 2-39

  const pos = x => (isFinite(x) && x > 0 ? Number(x) : 0);
  const cents = x => Math.round(x * 100) / 100;

  // Simplified method. months = whole months used (15+ days each) this year.
  function simplified({ officeSqft, months = 12, limit }) {
    const area = Math.min(pos(officeSqft), MAX_SQFT) * Math.min(12, pos(months)) / 12;  // average monthly allowable area
    const tentative = cents(area * RATE);
    const allowed = cents(Math.min(tentative, pos(limit)));
    return { area, tentative, allowed, lost: cents(tentative - allowed) };
  }

  // Regular method, following Form 8829 Parts I-III.
  //   limit: Schedule C line 29 (profit before the home office deduction) = Form 8829 line 8.
  //   indirect: whole-home expenses {mortgage, taxes, insurance, rent, repairs, utilities, other}.
  //   direct: expenses only for the office (e.g. painting it).
  //   buildingBasis: smaller of adjusted basis or fair market value, excluding land (Form 8829 line 39).
  //   firstMonth: 1-12 if business use began this year, 0 if in an earlier year.
  //   itemize: true moves the business share of mortgage interest and taxes to lines 10-11 (allowed first,
  //   assuming Schedule A limits don't cut them); false (standard deduction) puts them on lines 16-17.
  function regular({ officeSqft, homeSqft, limit, indirect = {}, direct = 0, buildingBasis = 0, firstMonth = 0,
    itemize = false, pct: pctIn }) {
    const pct = pctIn !== undefined ? pctIn : (pos(homeSqft) > 0 ? Math.min(1, pos(officeSqft) / pos(homeSqft)) : 0);
    const ind = k => pos(indirect[k]);
    const lim = pos(limit);
    const tier1 = itemize ? (ind('mortgage') + ind('taxes')) * pct : 0;                        // lines 10-14
    const afterTier1 = Math.max(0, lim - tier1);                                              // line 15
    const indirectRest = ind('insurance') + ind('rent') + ind('repairs') + ind('utilities') + ind('other') +
      (itemize ? 0 : ind('mortgage') + ind('taxes'));
    const operating = pos(direct) + indirectRest * pct;                                       // line 26
    const operatingAllowed = Math.min(operating, afterTier1);                                 // line 27
    const rate = firstMonth >= 1 && firstMonth <= 12 ? FIRST_YEAR[firstMonth] : LATER_YEAR;  // line 41
    const depreciation = pos(buildingBasis) * pct * rate;                                     // lines 40-42
    const depreciationAllowed = Math.min(depreciation, afterTier1 - operatingAllowed);        // line 31
    // Itemizers' business share of mortgage interest and taxes is deductible either way, so it's allowed in full.
    const allowed = tier1 + operatingAllowed + depreciationAllowed;                           // line 36
    return {
      pct, tier1: cents(tier1), operating: cents(operating), operatingAllowed: cents(operatingAllowed),
      depreciationRate: rate, depreciation: cents(depreciation), depreciationAllowed: cents(depreciationAllowed),
      allowed: cents(allowed),
      carryover: cents(operating - operatingAllowed + depreciation - depreciationAllowed),
    };
  }

  // Federal tax saved by deducting `amount` from SE profit (standard deduction; spouseWages only for joint filers).
  function taxSaved(year, status, profit, amount, spouseWages = 0) {
    const base = { year, status, profit: pos(profit), spouseWages };
    const before = T.estimate(base);
    const after = T.estimate(Object.assign({}, base, { profit: Math.max(0, pos(profit) - pos(amount)) }));
    const se = before.se.tax - after.se.tax;
    const total = before.totalTax - after.totalTax;
    return { total, se, income: total - se };
  }

  const api = { RATE, MAX_SQFT, FIRST_YEAR, LATER_YEAR, simplified, regular, taxSaved };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HomeOffice = api;
})(typeof window !== 'undefined' ? window : globalThis);
