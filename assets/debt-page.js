// UI for the debt snowball vs avalanche calculator page.
(function () {
  const KEY = 'sms-debts-v1';
  const DEFAULTS = {
    extra: 200,
    debts: [
      { name: 'Credit card', balance: 4200, apr: 24.99, min: 120 },
      { name: 'Store card', balance: 850, apr: 29.99, min: 35 },
      { name: 'Car loan', balance: 9800, apr: 7.4, min: 290 },
      { name: 'Personal loan', balance: 3100, apr: 11.5, min: 110 },
    ],
  };
  const $ = id => document.getElementById(id);
  const money = n => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money2 = n => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function monthLabel(offset) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  function duration(m) {
    const y = Math.floor(m / 12), r = m % 12;
    return [y ? `${y} yr` : '', r ? `${r} mo` : ''].filter(Boolean).join(' ') || '0 mo';
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.debts) && s.debts.length) return s;
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function rowHtml(d, i) {
    return `<div class="debt-row" data-i="${i}">
      <div class="name"><label for="n${i}">Name</label><input id="n${i}" data-f="name" value="${esc(d.name)}"></div>
      <div><label for="b${i}">Balance ($)</label><input id="b${i}" data-f="balance" type="number" min="0" step="0.01" inputmode="decimal" value="${d.balance}"></div>
      <div><label for="a${i}">APR (%)</label><input id="a${i}" data-f="apr" type="number" min="0" step="0.01" inputmode="decimal" value="${d.apr}"></div>
      <div><label for="m${i}">Min. payment ($)</label><input id="m${i}" data-f="min" type="number" min="0" step="0.01" inputmode="decimal" value="${d.min}"></div>
      <button type="button" data-remove="${i}" aria-label="Remove ${esc(d.name)}">&times;</button>
    </div>`;
  }

  let state = load();

  function renderRows() {
    $('debt-list').innerHTML = state.debts.map(rowHtml).join('');
    $('extra').value = state.extra;
  }

  function readInputs() {
    state.extra = Math.max(0, parseFloat($('extra').value) || 0);
    document.querySelectorAll('.debt-row').forEach(row => {
      const d = state.debts[+row.dataset.i];
      row.querySelectorAll('input').forEach(inp => {
        d[inp.dataset.f] = inp.dataset.f === 'name' ? inp.value : Math.max(0, parseFloat(inp.value) || 0);
      });
    });
    save(state);
  }

  function render() {
    const debts = state.debts.filter(d => d.balance > 0).map((d, i) => ({ ...d, name: d.name.trim() || `Debt ${i + 1}` }));
    const warn = $('warning');
    if (!debts.length) {
      $('stats').innerHTML = '<p class="muted">Add at least one debt with a balance to see your plan.</p>';
      ['per-debt', 'schedule', 'chart'].forEach(id => { $(id).innerHTML = ''; });
      warn.classList.add('hidden');
      return;
    }
    const s = DebtEngine.simulate(debts, state.extra, 'snowball');
    const a = DebtEngine.simulate(debts, state.extra, 'avalanche');

    if (!s.finished || !a.finished) {
      warn.textContent = `At ${money(s.budget)} per month, these debts won't be paid off within ${DebtEngine.MAX_MONTHS / 12} years, because at least one payment doesn't cover the interest. Try raising the extra payment.`;
      warn.classList.remove('hidden');
    } else warn.classList.add('hidden');

    const saved = s.totalInterest - a.totalInterest;
    const fewer = s.months - a.months;
    const aWins = saved > 0.5;
    $('stats').innerHTML = `
      <div class="stat"><div class="k">Monthly budget</div><div class="v">${money(s.budget)}</div></div>
      <div class="stat${aWins ? '' : ' win'}"><div class="k">Snowball debt-free</div><div class="v">${s.finished ? monthLabel(s.months) : 'Never'}</div><div class="small muted">${duration(s.months)} &middot; ${money(s.totalInterest)} interest</div></div>
      <div class="stat${aWins ? ' win' : ''}"><div class="k">Avalanche debt-free</div><div class="v">${a.finished ? monthLabel(a.months) : 'Never'}</div><div class="small muted">${duration(a.months)} &middot; ${money(a.totalInterest)} interest</div></div>
      <div class="stat"><div class="k">Avalanche saves</div><div class="v">${money(Math.max(0, saved))}</div><div class="small muted">${fewer > 0 ? `${fewer} month${fewer > 1 ? 's' : ''} sooner` : 'same payoff month'}</div></div>`;

    const rows = debts.map((d, i) => {
      const sd = s.debts[i], ad = a.debts[i];
      return `<tr><td>${esc(d.name)}</td><td class="num">${money(d.balance)}</td><td class="num">${d.apr}%</td>
        <td class="num">${sd.paidOffMonth ? monthLabel(sd.paidOffMonth) : '&mdash;'}</td>
        <td class="num">${ad.paidOffMonth ? monthLabel(ad.paidOffMonth) : '&mdash;'}</td></tr>`;
    }).join('');
    $('per-debt').innerHTML = `<thead><tr><th>Debt</th><th class="num">Balance</th><th class="num">APR</th><th class="num">Snowball payoff</th><th class="num">Avalanche payoff</th></tr></thead><tbody>${rows}</tbody>`;

    const total = debts.reduce((t, d) => t + d.balance, 0);
    const last = Math.max(s.months, a.months);
    const step = last <= 24 ? 3 : last <= 60 ? 6 : 12;
    const points = [0];
    for (let m = step; m < last; m += step) points.push(m);
    points.push(last);
    const remAt = (r, m) => (m === 0 ? total : (r.schedule[Math.min(m, r.schedule.length) - 1] || { remaining: 0 }).remaining);
    $('chart').innerHTML = points.map(m => {
      const sv = remAt(s, m), av = remAt(a, m);
      return `<div class="bar" title="Snowball ${money(sv)}, avalanche ${money(av)}">
        <span>${m === 0 ? 'Today' : monthLabel(m)}</span>
        <span><span class="track" style="display:block;margin-bottom:2px"><span class="fill" style="display:block;width:${(sv / total) * 100}%"></span></span><span class="track" style="display:block"><span class="fill alt" style="display:block;width:${(av / total) * 100}%"></span></span></span>
        <span class="num small">${money(sv)}<br>${money(av)}</span></div>`;
    }).join('') + '<p class="small muted">Top bar: snowball. Bottom bar: avalanche.</p>';

    renderSchedule(debts, $('sched-pick').value === 'avalanche' ? a : s);
  }

  function renderSchedule(debts, r) {
    $('sched-method').textContent = r.method;
    const head = `<thead><tr><th>Month</th>${debts.map(d => `<th class="num">${esc(d.name)}</th>`).join('')}<th class="num">Total left</th></tr></thead>`;
    const body = r.schedule.slice(0, 360).map(row => `<tr><td>${monthLabel(row.month)}</td>${row.payments.map((p, i) =>
      `<td class="num">${p ? money2(p) : '&mdash;'}<br><span class="small muted">${money(row.balances[i])}</span></td>`).join('')}<td class="num">${money(row.remaining)}</td></tr>`).join('');
    $('schedule').innerHTML = head + `<tbody>${body}</tbody>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderRows();
    render();
    $('debt-list').addEventListener('input', () => { readInputs(); render(); });
    $('extra').addEventListener('input', () => { readInputs(); render(); });
    $('sched-pick').addEventListener('change', render);
    $('debt-list').addEventListener('click', e => {
      const i = e.target.dataset.remove;
      if (i === undefined) return;
      readInputs();
      state.debts.splice(+i, 1);
      save(state);
      renderRows();
      render();
    });
    $('add-debt').addEventListener('click', () => {
      readInputs();
      state.debts.push({ name: `Debt ${state.debts.length + 1}`, balance: 1000, apr: 15, min: 40 });
      save(state);
      renderRows();
      render();
    });
  });
})();
