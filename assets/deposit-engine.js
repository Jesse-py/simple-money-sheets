// Security deposit interest math, shared by the calculator page and scripts/test-pages.js.
// Dates are 'YYYY-MM-DD' strings and are handled in UTC, so the result never depends on the visitor's time zone.
(function (root) {
  const DAY = 86400000;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayNum = s => { const { y, m, d } = parse(s); return Date.UTC(y, m - 1, d) / DAY; };
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Same day n months later; a day that doesn't exist (Jan 31 + 1 month, Feb 29 + 1 year) becomes the month's last day.
  function addMonths(s, n) {
    const { y, m, d } = parse(s);
    const t = y * 12 + (m - 1) + n, ny = Math.floor(t / 12), nm = t % 12 + 1;
    return fmt(ny, nm, Math.min(d, daysIn(ny, nm)));
  }
  const addYears = (s, n) => addMonths(s, 12 * n);
  const cents = x => Math.round(x * 100 + 1e-9) / 100;
  const pos = x => (isFinite(x) && x > 0 ? x : 0);

  // San Francisco Rent Board, form 572 "Security Deposit Interest Rates" (1/26): each rate runs March 1 - Feb 28/29.
  const SF_RATES = [
    ['1983-09-01', 5.0], ['2002-08-04', 3.4], ['2003-03-01', 1.2], ['2004-03-01', 1.2], ['2005-03-01', 1.7], ['2006-03-01', 3.7],
    ['2007-03-01', 5.2], ['2008-03-01', 5.2], ['2009-03-01', 3.1], ['2010-03-01', 0.9], ['2011-03-01', 0.4], ['2012-03-01', 0.4],
    ['2013-03-01', 0.4], ['2014-03-01', 0.3], ['2015-03-01', 0.1], ['2016-03-01', 0.2], ['2017-03-01', 0.6], ['2018-03-01', 1.2],
    ['2019-03-01', 2.2], ['2020-03-01', 2.2], ['2021-03-01', 0.6], ['2022-03-01', 0.1], ['2023-03-01', 2.3], ['2024-03-01', 5.2],
    ['2025-03-01', 5.0], ['2026-03-01', 4.2],
  ];
  const SF_KNOWN_TO = '2027-02-28';
  function sfRate(date) {
    let r = null;
    for (const [from, rate] of SF_RATES) if (date >= from) r = rate;
    return date > SF_KNOWN_TO ? null : r;
  }

  // Connecticut Department of Banking, "Deposit Index and Interest Rates" (CY 2026 page) and "Previous Interest Rates" (12/2025):
  // the rental security deposit rate for each calendar year.
  const CT_RATES = {
    1994: 2.5, 1995: 2.8, 1996: 3.1, 1997: 2.8, 1998: 2.6, 1999: 2.3, 2000: 2.2, 2001: 2.4, 2002: 1.5, 2003: 1.5, 2004: 1.5,
    2005: 1.5, 2006: 1.5, 2007: 1.5, 2008: 1.5, 2009: 1.5, 2010: 1.5, 2011: 1.5, 2012: 0.16, 2013: 0.11, 2014: 0.09, 2015: 0.08,
    2016: 0.08, 2017: 0.08, 2018: 0.09, 2019: 0.15, 2020: 0.15, 2021: 0.08, 2022: 0.06, 2023: 0.27, 2024: 0.55, 2025: 0.52, 2026: 0.49,
  };

  // Maryland, Real Property 8-203(e) for leases from Jan 1, 2015 (SB 345 of 2014): the greater of 1.5% or the 1-year Treasury
  // yield curve rate on the first business day of each year. Treasury daily par yield curve, 1 Yr column, on that day:
  const MD_TREASURY = {
    2015: 0.25, 2016: 0.61, 2017: 0.89, 2018: 1.83, 2019: 2.60, 2020: 1.56, 2021: 0.10, 2022: 0.40, 2023: 4.72,
    2024: 4.80, 2025: 4.17, 2026: 3.47,
  };
  const mdRate = y => (MD_TREASURY[y] == null ? null : Math.max(1.5, MD_TREASURY[y]));

  // Illinois Security Deposit Interest Act rate (IDFPR, Jan 5, 2026): the largest Illinois bank's minimum-deposit savings rate as
  // of Dec 31 of the year before the lease began. Only the rate for leases that began in 2026 is built in.
  const IL_RATES = { 2026: 0.005 };

  const J = {
    sf: { name: 'San Francisco, CA', short: 'San Francisco' },
    ct: { name: 'Connecticut', short: 'Connecticut' },
    md: { name: 'Maryland', short: 'Maryland' },
    ma: { name: 'Massachusetts', short: 'Massachusetts' },
    mn: { name: 'Minnesota', short: 'Minnesota' },
    oh: { name: 'Ohio', short: 'Ohio' },
    ny: { name: 'New York', short: 'New York' },
    il: { name: 'Illinois (outside Chicago)', short: 'Illinois' },
  };

  // Tenancy years from the deposit date: full years ending on or before `end`, then the part year (if any).
  function tenancyYears(start, end) {
    const out = [];
    for (let k = 1; ; k++) {
      const from = addYears(start, k - 1), to = addYears(start, k);
      if (to <= end) out.push({ from, to, full: true, days: dayNum(to) - dayNum(from) });
      else { if (end > from) out.push({ from, to: end, full: false, days: dayNum(end) - dayNum(from) }); break; }
    }
    return out;
  }
  // Part-year interest: by days, over the days in that tenancy year.
  const partShare = (row, start, k) => row.days / (dayNum(addYears(start, k)) - dayNum(addYears(start, k - 1)));

  // A simple-interest yearly schedule: rateFor(row, k) -> % for tenancy year k (1-based); null = rate not known.
  function yearly(base, start, end, rateFor, { partial = true } = {}) {
    const rows = [];
    tenancyYears(start, end).forEach((row, i) => {
      const k = i + 1, rate = rateFor(row, k);
      const share = row.full ? 1 : partShare(row, start, k);
      if (!row.full && !partial) return;
      rows.push({ from: row.from, to: row.to, full: row.full, rate, interest: rate == null ? null : cents(base * rate / 100 * share) });
    });
    return rows;
  }

  // Full months the deposit was held, as [{ from, to }]: month n runs from the deposit date + n-1 months to + n months.
  function fullMonths(start, end) {
    const out = [];
    for (let n = 1; ; n++) {
      const to = addMonths(start, n);
      if (to > end) break;
      out.push({ from: addMonths(start, n - 1), to });
    }
    return out;
  }

  // inputs: { juris, deposit, start, end, ongoing, rent (OH), units (NY, IL), bankRate (MA, NY, IL override), lmr (MA last month's rent) }
  function calc(inp) {
    const deposit = pos(inp.deposit), start = inp.start, end = inp.end;
    const res = { rows: [], total: 0, owed: true, reason: '', notes: [], unknown: false, base: deposit };
    if (!J[inp.juris]) { res.owed = false; res.reason = 'Pick where the rental is.'; return res; }
    if (!start || !end || end <= start) { res.owed = false; res.reason = 'The end date has to be after the date the deposit was paid.'; return res; }
    const heldDays = dayNum(end) - dayNum(start);
    const heldMonths = fullMonths(start, end).length;
    const fin = () => {
      res.unknown = res.rows.some(r => r.interest == null);
      res.total = cents(res.rows.reduce((s, r) => s + (r.interest || 0), 0));
      return res;
    };
    switch (inp.juris) {
      case 'sf': {
        // Rent Board: simple interest at the rate in effect on each annual due date; nothing if the tenant leaves before one
        // full year; a final part year is prorated at the rate in effect on the move-out date.
        if (addYears(start, 1) > end) {
          if (inp.ongoing) { res.owed = false; res.reason = 'The first interest payment is due one year after the deposit was paid.'; return res; }
          res.owed = false; res.reason = 'San Francisco: no interest is due if the tenant moves out before one full year.'; return res;
        }
        res.rows = yearly(deposit, start, end, row => sfRate(row.full ? row.to : end));
        if (start < '2003-06-15') res.notes.push('If an annual due date fell between August 4, 2002 and June 14, 2003, the Rent Board has special rules for that year; ask the Rent Board.');
        return fin();
      }
      case 'ma': {
        // G.L. c.186 s.15B(3)(b): 5% a year from the first day of the tenancy, or the lesser rate the bank actually paid,
        // payable at the end of each tenancy year; on an early end, all accrued interest within 30 days.
        const rate = inp.bankRate != null && inp.bankRate !== '' && pos(inp.bankRate) < 5 ? pos(inp.bankRate) : 5;
        if (addYears(start, 1) > end) {
          res.owed = false;
          res.reason = inp.ongoing ? 'Interest is first due at the end of the first year of the tenancy.' :
            'Massachusetts requires interest on a deposit the landlord holds for one year or longer, so a deposit held less than a year isn’t covered by the law.';
          return res;
        }
        res.rows = yearly(deposit, start, end, () => rate);
        const lmr = pos(inp.lmr);
        if (lmr > 0) {
          // s.15B(2)(a): same rate on last month's rent paid in advance, but none accrues for that last month.
          const lmEnd = inp.ongoing ? end : addMonths(end, -1);
          if (lmEnd > start) yearly(lmr, start, lmEnd, () => rate).forEach(r => res.rows.push({ ...r, lmr: true }));
        }
        return fin();
      }
      case 'mn': {
        // 504B.178 subd. 2: 1% simple, from the first day of the month after the deposit was paid in full to the last day
        // of the month the deposit is returned; under $1 isn't owed.
        const { y, m } = parse(start), e = parse(end);
        const months = Math.max(0, (e.y * 12 + e.m) - (y * 12 + m));
        const interest = cents(deposit * 0.01 * months / 12);
        res.rows = [{ from: addMonths(fmt(y, m, 1), 1), to: fmt(e.y, e.m, daysIn(e.y, e.m)), months, rate: 1, interest }];
        if (interest < 1) { res.owed = false; res.reason = `That’s ${interest.toFixed(2)} dollars; Minnesota excludes interest under $1.`; res.rows = []; return res; }
        return fin();
      }
      case 'oh': {
        // R.C. 5321.16(A): 5% a year on the part of the deposit over $50 or one month's rent, whichever is greater, if the
        // tenant stays six months or more; computed and paid annually.
        const free = Math.max(50, pos(inp.rent));
        res.base = Math.max(0, deposit - free);
        if (res.base <= 0) { res.owed = false; res.reason = `Ohio only pays interest on the part of the deposit over ${free === 50 ? '$50' : 'one month’s rent'}, and this deposit isn’t more than that.`; return res; }
        if (heldMonths < 6) { res.owed = false; res.reason = 'Ohio interest is owed only if the tenant stays six months or more.'; return res; }
        res.rows = yearly(res.base, start, end, () => 5);
        return fin();
      }
      case 'ny': {
        // GOL 7-103: buildings with six or more units: an interest-bearing account at the prevailing rate; the landlord may
        // keep 1% a year for administration; the rest belongs to the tenant.
        if (!(inp.units >= 6)) { res.owed = false; res.reason = 'New York’s interest rule covers buildings with six or more apartments. In a smaller building the law doesn’t require interest unless the lease or local law does.'; return res; }
        const bank = pos(inp.bankRate), net = Math.max(0, bank - 1);
        res.rows = yearly(deposit, start, end, () => net);
        if (bank <= 1) res.notes.push('At a bank rate of 1% or less, the landlord’s 1% fee takes all of it.');
        return fin();
      }
      case 'il': {
        // 765 ILCS 715: 25 or more units, deposit held six months or more; paid within 30 days after each 12-month rental
        // period at the rate as of Dec 31 of the year before the lease began.
        if (!(inp.units >= 25)) { res.owed = false; res.reason = 'The Illinois Security Deposit Interest Act covers buildings or complexes with 25 or more units. (Chicago has its own ordinance.)'; return res; }
        if (heldMonths < 6) { res.owed = false; res.reason = 'Illinois interest is owed on a deposit held six months or more.'; return res; }
        const leaseYear = parse(start).y;
        const rate = inp.bankRate != null && inp.bankRate !== '' ? pos(inp.bankRate) : (IL_RATES[leaseYear] ?? null);
        res.rows = yearly(deposit, start, end, () => rate);
        return fin();
      }
      case 'ct': {
        // C.G.S. 47a-21(i): at least the deposit index for each calendar year; paid or credited on each anniversary; accrued
        // interest within 21 days after the tenancy ends. "Accrued interest" is compounded annually to the extent applicable (a)(1).
        if (start < '1994-01-01') { res.owed = false; res.reason = 'This calculator has Connecticut rates from 1994 on.'; return res; }
        res.rows = monthlyRows(deposit, start, end, y => CT_RATES[y]);
        // If none of it was paid along the way: each tenancy year earns interest on the deposit plus the unpaid interest so far.
        let unpaid = 0;
        for (const r of res.rows) if (r.interest != null) unpaid += cents(r.interest * (1 + unpaid / deposit));
        res.compounded = cents(unpaid);
        if (!res.rows.length) { res.owed = false; res.reason = 'No full month has passed yet.'; return res; }
        return fin();
      }
      case 'md': {
        // Real Property 8-203(e): simple interest, accruing at monthly intervals from the day the deposit was paid, none for a part
        // month, none unless held at least 6 months, only on deposits of $50 or more. Leases before 2015: 3% a year (DHCD).
        if (deposit < 50) { res.owed = false; res.reason = 'Maryland interest is payable only on deposits of $50 or more.'; return res; }
        if (heldMonths < 6) { res.owed = false; res.reason = 'Maryland: no interest is due unless the landlord has held the deposit for at least 6 months.'; return res; }
        res.rows = monthlyRows(deposit, start, end, start < '2015-01-01' ? () => 3 : mdRate);
        return fin();
      }
    }
    return fin();
  }

  // Full months grouped by tenancy year; each month earns 1/12 of the rate for the calendar year it starts in.
  function monthlyRows(deposit, start, end, rateOf) {
    const months = fullMonths(start, end);
    const rows = [];
    for (let k = 0; k * 12 < months.length; k++) {
      const grp = months.slice(k * 12, k * 12 + 12);
      let interest = 0, unknown = false;
      const rates = new Set();
      for (const mo of grp) {
        const r = rateOf(parse(mo.from).y);
        if (r == null) { unknown = true; continue; }
        rates.add(r);
        interest += deposit * r / 100 / 12;
      }
      rows.push({ from: grp[0].from, to: grp[grp.length - 1].to, full: grp.length === 12, months: grp.length,
        rate: rates.size === 1 ? [...rates][0] : [...rates], interest: unknown ? null : cents(interest) });
    }
    return rows;
  }

  const api = { J, SF_RATES, CT_RATES, MD_TREASURY, mdRate, IL_RATES, sfRate, calc, addMonths, addYears, tenancyYears, fullMonths, dayNum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DepositEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
