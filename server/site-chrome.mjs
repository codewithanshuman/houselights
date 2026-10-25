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

// Fills every empty <header ... data-site-nav="key"></header> in a page.
export function withSiteNav(html) {
  return html.replace(/(<header\b[^>]*\bdata-site-nav="([\w-]*)"[^>]*>)(<\/header>)/g, (_, open, key, close) => open + navHtml(key) + close);
}
