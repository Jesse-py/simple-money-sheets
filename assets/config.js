// Where each product is sold. Leave url empty until the product is live; links tagged with
// data-product="<key>" then show a "coming soon" state instead of a dead link.
window.SITE_PRODUCTS = {
  debtPlanner: { url: 'https://jamccormick.gumroad.com/l/debt-payoff-planner', price: '$9' },
  budgetKit: { url: 'https://jamccormick.gumroad.com/l/monthly-budget-kit', price: '$7' },
  sinkingFunds: { url: 'https://jamccormick.gumroad.com/l/sinking-funds-tracker', price: '$6' },
  bundle: { url: 'https://jamccormick.gumroad.com/l/money-sheets-bundle', price: '$15' },
};

// Cookieless page-view counting (GoatCounter: no cookies, no personal data). Empty = off.
window.SITE_ANALYTICS = { goatcounter: 'simplemoneysheets' };
(function () {
  const code = window.SITE_ANALYTICS.goatcounter;
  if (!code || !/\.github\.io$/.test(location.hostname)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(s);
})();

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-product]').forEach(el => {
    const p = window.SITE_PRODUCTS[el.dataset.product];
    if (p && p.url) {
      el.href = p.url;
      el.querySelectorAll('[data-price]').forEach(s => { s.textContent = p.price; });
    } else {
      el.removeAttribute('href');
      el.classList.add('ghost');
      el.setAttribute('aria-disabled', 'true');
      el.textContent = 'Coming soon';
    }
  });
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
});
