// The shared navigation, rendered into each page when it is served so it is part of the
// first paint (no layout shift when scripts run). public/site.js adds the menu behaviour.
// Organizer tools are uncalibrated and sit behind a menu so judges land on the Booking Desk.
const pages = [['booking', '/judge.html', 'Booking Desk'], ['evidence', '/evidence.html', 'Evidence & limits'], ['proof', '/proof-lab.html', 'Qloo Proof Lab']];
const tools = [['/workspace.html', 'Organizer workspace', false], ['/index.html', 'Slate studio', false], ['/demand.html', 'Demand Lab and Audience Twin', true], ['/financial.html', 'Financial Risk Lab', true], ['/index.html#gauntlet', 'Festival GM and Gauntlet', true]];
const e = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function navHtml(current) {
  return `<nav class="site-nav" aria-label="Main navigation"><a class="site-brand" href="/judge.html"><img src="/assets/brand/portal-logo-v2.webp" alt="" width="36" height="36"><span>Houselights<span class="site-brand-dot">.</span></span></a>`
    + `<div class="site-links">${pages.map(([key, href, label]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${e(label)}</a>`).join('')}`
    + `<details class="site-tools"><summary>Organizer tools</summary><div class="site-tools-menu">${tools.map(([href, label, uncalibrated]) => `<a href="${href}">${e(label)}${uncalibrated ? ' <span class="badge badge-warn">uncalibrated</span>' : ''}</a>`).join('')}<p>Private planning tools. Their forecasts are not calibrated against real outcomes.</p></div></details></div></nav>`;
}

// The shared footer: link columns on paper, then the owner's festival drawing.
const GH = 'https://github.com/codewithanshuman/houselights';
export function footerHtml() {
  return `<div class="plan-footer-inner"><div class="footer-brand"><a class="footer-logo" href="/judge.html"><img src="/assets/brand/portal-logo-v2.webp" alt="" width="32" height="32"><span>Houselights<span class="footer-dot">.</span></span></a>`
    + `<p>Booking decisions grounded in what your city’s fans already love, with a receipt for every claim.</p><p class="footer-release site-release">Release <code id="site-release">…</code></p></div>`
    + `<nav class="footer-cols" aria-label="Footer"><div><h2>Product</h2><a href="/judge.html#planner">Plan a show</a><a href="/judge.html">Booking Desk</a><a href="/desk.html">Booking Desk lab</a></div>`
    + `<div><h2>Evidence</h2><a href="/evidence.html">Evidence and limits</a><a href="/proof-lab.html">Qloo Proof Lab</a><a href="${GH}/blob/main/docs/claims-audit.md">Claims audit</a></div>`
    + `<div><h2>Project</h2><a href="${GH}">Source on GitHub</a><a href="${GH}/blob/main/docs/security.md">Security</a><a href="${GH}/blob/main/LICENSE">MIT license</a></div>`
    + `<div><h2>Built for</h2><p>The Qloo Agentic Hackathon 2026, on Qloo’s taste graph.</p></div></nav></div>`
    + `<p class="footer-legal">Fees on saved plans are illustrative and fees for new acts are estimates. Nothing is booked.</p>`
    + `<picture class="footer-art"><source media="(max-width: 640px)" srcset="/assets/brand/footer-festival-phone.webp"><img src="/assets/brand/footer-festival.webp" alt="Pen and ink drawing of a festival crowd facing an outdoor stage by the water, under string lights" width="2000" height="528" loading="lazy"></picture>`;
}

// Fills every empty <header ... data-site-nav="key"></header> and the empty site footer.
export function withSiteNav(html) {
  return html.replace(/(<header\b[^>]*\bdata-site-nav="([\w-]*)"[^>]*>)(<\/header>)/g, (_, open, key, close) => open + navHtml(key) + close)
    .replace(/<footer class="site-footer" data-site-footer><\/footer>/g, `<footer class="site-footer plan-footer" data-site-footer>${footerHtml()}</footer>`);
}
