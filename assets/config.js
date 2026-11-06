// Where each product is sold. Leave url empty until the product is live; links tagged with
// data-product="<key>" then show a "coming soon" state instead of a dead link.
window.SITE_PRODUCTS = {
  debtPlanner: { url: 'https://jamccormick.gumroad.com/l/debt-payoff-planner', price: '$9' },
  budgetKit: { url: 'https://jamccormick.gumroad.com/l/monthly-budget-kit', price: '$7' },
  sinkingFunds: { url: 'https://jamccormick.gumroad.com/l/sinking-funds-tracker', price: '$6' },
};

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
