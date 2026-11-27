// Form 990-N (e-Postcard) lapse math, shared by the nonprofit-990n-checker page and scripts/test-990n.js.
// Rules (irs.gov 990-N and automatic revocation pages; IRC 6033(j)): the 990-N is due by the 15th day of the 5th month
// after the tax year ends; an org that files nothing for 3 consecutive years loses its exemption automatically on the
// original due date of the third return. Dates are 'YYYY-MM-DD' strings in UTC.
(function (root) {
  const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  // A due date this recent may be filed but not yet in the monthly IRS file, so it isn't counted as missed.
  const POSTING_LAG_DAYS = 45;

  // One line of the e/<prefix>.txt data files -> record.
  function parseLine(line) {
    const [ein, year, end, term, rev, rein, name, city, st] = line.split('|');
    const [m, d, y] = end.split('-').map(Number);
    return { ein, taxYear: Number(year), end: fmt(y, m, d), terminated: term === 'T', rev, rein, name, city, st };
  }

  // Period end and due date of the return k years after a period ending on `end` (k = 0 is that period itself).
  function period(end, k) {
    const [y, m, d] = end.split('-').map(Number);
    const ey = y + k, lastDay = d === daysIn(y, m);
    const pe = fmt(ey, m, lastDay ? daysIn(ey, m) : Math.min(d, daysIn(ey, m)));
    const t = ey * 12 + (m - 1) + 5, due = fmt(Math.floor(t / 12), t % 12 + 1, 15);
    return { end: pe, due, fileBy: fileBy(due) };
  }

  // A due date on a Saturday, Sunday, or legal holiday moves to the next business day. The 15th is a federal holiday only
  // when it's the third Monday of January (MLK Day) or February (Washington's Birthday). The revocation itself still takes
  // effect on the original due date.
  function fileBy(due) {
    let t = Date.UTC(...due.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
    for (;;) {
      const dt = new Date(t), wd = dt.getUTCDay(), mo = dt.getUTCMonth(), d = dt.getUTCDate();
      const holiday = wd === 1 && (mo === 0 || mo === 1) && d >= 15 && d <= 21;
      if (wd !== 0 && wd !== 6 && !holiday) return dt.toISOString().slice(0, 10);
      t += 86400000;
    }
  }

  // Status of one org as of the data file date `asOf`.
  function status(r, asOf) {
    const out = { r, asOf, periods: [] };
    const revoked = r.rev && !(r.rein && r.rein >= r.rev);
    // A revocation older than the latest e-Postcard is history: the org has filed since.
    const revCurrent = revoked && r.rev > r.end;
    if (r.rev && r.rein && r.rein >= r.rev) out.reinstated = { rev: r.rev, rein: r.rein };
    else if (revoked && !revCurrent) out.oldRevocation = r.rev;
    if (r.terminated) { out.code = 'terminated'; return out; }
    let missed = 0, k = 1;
    for (; k <= 12; k++) {
      const p = period(r.end, k);
      p.taxYear = r.taxYear + k;
      if (dayNum(p.due) > dayNum(asOf) - POSTING_LAG_DAYS) { out.next = p; break; }
      missed++;
      out.periods.push(p);
    }
    out.missed = missed;
    if (dayNum(out.next.due) <= dayNum(asOf)) out.justDue = true;
    if (revCurrent) { out.code = 'revoked'; out.revDate = r.rev; return out; }
    if (missed === 0) out.code = 'current';
    else if (missed === 1) out.code = 'one';
    else if (missed === 2) { out.code = 'two'; out.revokeOn = out.next.due; }
    else { out.code = 'three'; out.expectedRev = period(r.end, 3).due; }
    return out;
  }

  // Name search over s/<ST>.txt lines (ein|name|city): every query word must start a word of the name (or the city).
  function search(lines, q, limit) {
    const words = q.toUpperCase().replace(/[^A-Z0-9& ]+/g, ' ').split(/\s+/).filter(w => w && w !== 'THE' && w !== 'OF' && w !== 'INC');
    if (!words.length) return [];
    const hits = [];
    for (const line of lines) {
      if (!line) continue;
      const [ein, name, city] = line.split('|');
      const toks = (name + ' ' + city).split(/[^A-Z0-9&]+/);
      if (words.every(w => toks.some(t => t.startsWith(w)))) {
        hits.push({ ein, name, city });
        if (hits.length >= limit) break;
      }
    }
    return hits;
  }

  const cleanEin = s => (s || '').replace(/\D/g, '');

  const api = { parseLine, period, fileBy, status, search, cleanEin, dayNum, POSTING_LAG_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Npo990nEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
