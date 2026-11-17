// Holiday budget math, shared by the calculator page and scripts/test-pages.js.
(function (root) {
  // NRF winter holiday survey, press release 2025-10-16 (8,247 adults, Oct. 1-7): average planned spending per person.
  // NRF's 2026 survey (released 2026-10-20) didn't publish a per-person figure.
  const NRF_2025 = { total: 890.49, gifts: 627.93, seasonal: 262.56 };

  const pos = x => (isFinite(x) && x > 0 ? x : 0);
  const whole = x => Math.floor(pos(x));
  const sum = a => a.reduce((s, x) => s + x, 0);
  // Round up to the cent, so the per-paycheck amounts always add up to at least the total.
  const centsUp = x => Math.ceil(Math.round(x * 1e6) / 1e4) / 100;

  // groups: [{ count, each }] gift recipients; extras: other holiday costs ($); saved: already set aside;
  // paychecks: paydays left before the shopping is done.
  function budget({ groups = [], extras = [], saved = 0, paychecks = 0 }) {
    const people = sum(groups.map(g => whole(g.count)));
    const gifts = sum(groups.map(g => whole(g.count) * pos(g.each)));
    const other = sum(extras.map(pos));
    const total = gifts + other;
    const left = Math.max(0, total - pos(saved));
    const n = whole(paychecks);
    return {
      people, gifts, other, total, left,
      perPaycheck: n && left ? centsUp(left / n) : 0,
      giftShare: total ? gifts / total : 0,
      // A sinking fund for next year: the same total saved evenly from January.
      monthly: centsUp(total / 12), biweekly: centsUp(total / 26), weekly: centsUp(total / 52),
    };
  }

  // Default shopping deadline: December 20 this year, or next year's once it has passed.
  function deadlineFor(today) {
    const y = today.getFullYear();
    const d = new Date(y, 11, 20);
    return today > d ? new Date(y + 1, 11, 20) : d;
  }
  // Every-two-weeks paychecks left before the deadline (at least 1), counting whole 14-day periods.
  function paychecksLeft(today, deadline = deadlineFor(today)) {
    const days = Math.round((Date.UTC(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
    return Math.max(1, Math.floor(days / 14));
  }

  root.HolidayEngine = { NRF_2025, centsUp, budget, deadlineFor, paychecksLeft };
})(typeof window !== 'undefined' ? window : module.exports);
