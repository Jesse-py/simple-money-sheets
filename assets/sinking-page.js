// Sinking funds calculator: same math as the Sinking Funds Tracker spreadsheet (products/sinking-funds-tracker/build.py).
// Months left = deposits you can still make before the month a fund is due, counting this month.
(function () {
  const KEY = 'sms-sinking-v1';
  const MAX = 30;
  const $ = id => document.getElementById(id);
  const money = n => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money2 = n => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const periodName = { 26: 'every 2 weeks', 24: 'twice a month', 52: 'weekly' };

  // 'YYYY-MM' (month input) or 'MM/YYYY' (browsers without a month picker) -> months since year 0, or null.
  function parseMonth(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return +m[1] * 12 + (+m[2] - 1);
    m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return +m[2] * 12 + (+m[1] - 1);
    return null;
  }
  const monthValue = k => `${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`;
  const monthLabel = k => new Date(Math.floor(k / 12), k % 12, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  function thisMonth() {
    const d = new Date();
    return d.getFullYear() * 12 + d.getMonth();
  }

  function plan(f, asof) {
    const goal = Math.max(0, f.goal), saved = Math.max(0, f.saved), monthly = Math.max(0, f.plan);
    const still = Math.max(0, goal - saved);
    const due = parseMonth(f.due);
    const r = { still, progress: goal > 0 ? Math.min(1, saved / goal) : null, left: null, need: null, short: null };
    if (due !== null) {
      r.left = Math.max(0, due - asof);
      r.need = still <= 0 ? 0 : r.left === 0 ? still : still / r.left;
      r.short = Math.max(0, r.need - monthly);
    }
    if (still <= 0) r.status = 'Funded';
    else if (due === null) r.status = 'No due date';
    else if (r.left === 0) r.status = 'Due now';
    else r.status = monthly + 0.005 >= r.need ? 'On track' : 'Behind';
    r.by = still <= 0 ? 'Funded' : monthly <= 0 ? 'Set a monthly amount' : monthLabel(asof + Math.ceil(still / monthly) - 1);
    return r;
  }

  function defaults() {
    const now = thisMonth();
    const dec = Math.floor(now / 12) * 12 + 11;
    return [
      { name: 'Car insurance', goal: 720, due: monthValue(now + 6), saved: 0, plan: 120 },
      { name: 'Holidays and gifts', goal: 800, due: monthValue(dec - now >= 6 ? dec : dec + 12), saved: 150, plan: 75 },
      { name: 'Vacation', goal: 1500, due: monthValue(now + 10), saved: 400, plan: 100 },
      { name: 'Car registration', goal: 150, due: monthValue(now + 4), saved: 0, plan: 0 },
      { name: 'Car repairs', goal: 1000, due: '', saved: 300, plan: 50 },
    ];
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.funds) && s.funds.length) return s;
    } catch (e) {}
    return { funds: defaults() };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function rowHtml(f, i) {
    return `<div class="debt-row fund-row" data-i="${i}">
      <div class="name"><label for="fn${i}">Fund</label><input id="fn${i}" data-f="name" value="${esc(f.name)}"></div>
      <div><label for="fg${i}">Goal ($)</label><input id="fg${i}" data-f="goal" type="number" min="0" step="1" inputmode="decimal" value="${f.goal}"></div>
      <div><label for="fd${i}">Due month</label><input id="fd${i}" data-f="due" type="month" placeholder="YYYY-MM" value="${esc(f.due)}"></div>
      <div><label for="fs${i}">Saved ($)</label><input id="fs${i}" data-f="saved" type="number" min="0" step="1" inputmode="decimal" value="${f.saved}"></div>
      <div><label for="fp${i}">Plan / month ($)</label><input id="fp${i}" data-f="plan" type="number" min="0" step="1" inputmode="decimal" value="${f.plan}"></div>
      <button type="button" data-remove="${i}" aria-label="Remove ${esc(f.name)}">&times;</button>
    </div>`;
  }

  let state = load();

  function renderRows() {
    $('fund-list').innerHTML = state.funds.map(rowHtml).join('');
    $('add-fund').disabled = state.funds.length >= MAX;
  }
  function readInputs() {
    document.querySelectorAll('.fund-row').forEach(row => {
      const f = state.funds[+row.dataset.i];
      row.querySelectorAll('input').forEach(inp => {
        const k = inp.dataset.f;
        f[k] = k === 'name' || k === 'due' ? inp.value : Math.max(0, parseFloat(inp.value) || 0);
      });
    });
    save();
  }

  function render() {
    let asof = parseMonth($('asof').value);
    if (asof === null) asof = thisMonth();
    const per = +$('period').value;
    const funds = state.funds.map((f, i) => ({ ...f, name: f.name.trim() || `Fund ${i + 1}` })).filter(f => f.goal > 0);
    if (!funds.length) {
      $('stats').innerHTML = '<p class="muted">Add a fund with a goal to see how much to save.</p>';
      $('results').innerHTML = '';
      $('advice').textContent = '';
      return;
    }
    const rows = funds.map(f => ({ f, r: plan(f, asof) }));
    const need = rows.reduce((s, x) => s + (x.r.need || 0), 0);
    const planned = funds.reduce((s, f) => s + f.plan, 0);
    const saved = funds.reduce((s, f) => s + f.saved, 0);
    const goal = funds.reduce((s, f) => s + f.goal, 0);
    const gap = need - planned;
    const stat = (k, v, win) => `<div class="stat${win ? ' win' : ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    $('stats').innerHTML = stat('Needed per month', money2(need), true) +
      (periodName[per] ? stat(`Per paycheck (${periodName[per]})`, money2(need * 12 / per)) : '') +
      stat('You plan to save', money2(planned)) +
      stat(gap > 0.005 ? 'Short per month' : 'Spare per month', money2(Math.abs(gap))) +
      stat('Saved so far', `${money(saved)} of ${money(goal)}`);
    $('results').innerHTML = '<thead><tr><th>Fund</th><th class="num">Still needed</th><th class="num">Progress</th><th class="num">Months left</th>' +
      '<th class="num">Needed / month</th><th>Fully funded by</th><th>Status</th></tr></thead><tbody>' +
      rows.map(({ f, r }) => `<tr><td>${esc(f.name)}</td><td class="num">${money(r.still)}</td>` +
        `<td class="num">${r.progress === null ? '' : Math.round(r.progress * 100) + '%'}</td>` +
        `<td class="num">${r.left === null ? '' : r.left}</td><td class="num">${r.need === null ? '' : money2(r.need)}</td>` +
        `<td>${r.by}</td><td>${r.status}</td></tr>`).join('') + '</tbody>';
    const behind = rows.filter(x => x.r.status === 'Behind');
    const dueNow = rows.filter(x => x.r.status === 'Due now');
    const open = rows.filter(x => x.r.status === 'No due date');
    const tips = [];
    if (dueNow.length) tips.push(`${dueNow.map(x => x.f.name).join(', ')} ${dueNow.length > 1 ? 'are' : 'is'} due this month and still short; that shortfall is counted in full in "Needed per month".`);
    if (behind.length) tips.push(`Behind: ${behind.map(x => `${x.f.name} (${money2(x.r.short)} more a month)`).join(', ')}.`);
    if (open.length) tips.push(`Funds with no due date (${open.map(x => x.f.name).join(', ')}) aren't in "Needed per month"; their planned amount still counts.`);
    if (!tips.length) tips.push('Every fund with a due date is on track at your planned amounts.');
    $('advice').textContent = tips.join(' ');
  }

  window.SinkingFunds = { plan, parseMonth };

  document.addEventListener('DOMContentLoaded', () => {
    $('asof').value = monthValue(thisMonth());
    renderRows();
    render();
    $('fund-list').addEventListener('input', () => { readInputs(); render(); });
    $('asof').addEventListener('input', render);
    $('period').addEventListener('input', render);
    $('fund-list').addEventListener('click', e => {
      const i = e.target.dataset.remove;
      if (i === undefined) return;
      readInputs();
      state.funds.splice(+i, 1);
      save();
      renderRows();
      render();
    });
    $('add-fund').addEventListener('click', () => {
      readInputs();
      state.funds.push({ name: `Fund ${state.funds.length + 1}`, goal: 500, due: monthValue(thisMonth() + 12), saved: 0, plan: 0 });
      save();
      renderRows();
      render();
    });
    $('reset-funds').addEventListener('click', () => {
      state = { funds: defaults() };
      try { localStorage.removeItem(KEY); } catch (e) {}
      renderRows();
      render();
    });
  });
})();
