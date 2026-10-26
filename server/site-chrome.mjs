// The shared chrome, rendered into each page when it is served so it is part of the first
// paint (no layout shift when scripts run). public/site.js adds the behaviour.
// The landing page (the Booking Desk) gets the floating pill nav. Every other page is part of
// the app and gets the sidebar shell instead; the 404 page gets neither.
// Organizer tools are uncalibrated and sit behind a menu so judges land on the Booking Desk.
const pages = [['booking', '/judge.html', 'Booking Desk'], ['evidence', '/evidence.html', 'Evidence & limits'], ['proof', '/proof-lab.html', 'Qloo Proof Lab']];
const tools = [['/workspace.html', 'Organizer workspace', false], ['/index.html', 'Slate studio', false], ['/demand.html', 'Demand Lab and Audience Twin', true], ['/financial.html', 'Financial Risk Lab', true], ['/index.html#gauntlet', 'Festival GM and Gauntlet', true]];
const e = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function navHtml(current) {
  return `<nav class="site-nav" aria-label="Main navigation"><a class="site-brand" href="/judge.html"><img src="/assets/brand/portal-logo-v2.webp" alt="" width="36" height="36"><span>Houselights<span class="site-brand-dot">.</span></span></a>`
    + `<button class="site-burger" type="button" aria-expanded="false" aria-controls="site-links" aria-label="Open menu"><span aria-hidden="true"></span></button>`
    + `<div id="site-links" class="site-links">${pages.map(([key, href, label]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${e(label)}</a>`).join('')}`
    + `<details class="site-tools"><summary>Organizer tools</summary><div class="site-tools-menu">${tools.map(([href, label, uncalibrated]) => `<a href="${href}">${e(label)}${uncalibrated ? ' <span class="badge badge-warn">uncalibrated</span>' : ''}</a>`).join('')}<p>Private planning tools. Their forecasts are not calibrated against real outcomes.</p></div></details></div>`
    + `<a class="site-cta sketch-btn" href="/judge.html#planner">Plan a show</a></nav>`;
}

// ---------- The app sidebar ----------
const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15H9v5.5H5.5A1.5 1.5 0 0 1 4 19z"/>',
  plan: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/>',
  evidence: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M8.5 13l2 2 4-4"/>',
  proof: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 15h9"/>',
  workspace: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  slate: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 10h16M10 10v10"/>',
  desk: '<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>',
  demand: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  financial: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  collapse: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M9.5 4v16M15.5 10l-2 2 2 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
};
const icon = name => `<svg class="app-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const APP = [
  [null, [['booking', '/judge.html', 'Booking Desk', 'home'], ['plan', '/judge.html#planner', 'Plan a show', 'plan']]],
  ['Evidence', [['evidence', '/evidence.html', 'Evidence & limits', 'evidence'], ['proof', '/proof-lab.html', 'Qloo Proof Lab', 'proof']]],
  ['Organizer', [['workspace', '/workspace.html', 'Workspace', 'workspace', [['/workspace.html#example', 'Recorded session']]], ['slate', '/index.html', 'Slate studio', 'slate'], ['desk', '/desk.html', 'Booking Desk lab', 'desk']]],
  ['Labs', [['demand', '/demand.html', 'Demand Lab', 'demand', null, 'beta'], ['financial', '/financial.html', 'Financial Risk', 'financial', null, 'beta']]],
];
export const APP_KEYS = new Set(['evidence', 'proof', 'workspace', 'slate', 'desk', 'demand', 'financial']);

// The bar above each app page: back, the section and the page, and a share action.
export function topHtml(current) {
  const [group, row] = APP.flatMap(([name, rows]) => rows.map(r => [name, r])).find(([, r]) => r[0] === current) ?? [];
  if (!row) return '';
  return `<div class="app-top"><nav class="app-crumbs" aria-label="Breadcrumb"><a class="app-back" href="/judge.html" aria-label="Back to the Booking Desk">${icon('back')}</a><span class="app-sep" aria-hidden="true"></span>`
    + (group ? `<span class="app-crumb">${e(group)}</span>${icon('chevron')}` : '')
    + `<span class="app-crumb" aria-current="page">${icon(row[3])}<span>${e(row[2])}</span></span></nav>`
    + `<button class="app-share" type="button" data-share>${icon('share')}<span>Share</span></button></div>`;
}

// Slate studio switches views in place (public/app.js), so its views are buttons nested under
// its row. decision.js, gm.js and advanced.js add the Decision Room, Festival GM, Event
// portfolio and Independent evaluation views to the same group when they load.
const SLATE_VIEWS = '<div class="app-sub slate-views" role="group" aria-label="Slate studio views">'
  + '<button class="nav-item active" type="button" data-view="slate" aria-current="page"><span class="app-copy">Slate studio</span><span class="nav-key">01</span></button>'
  + '<button class="nav-item" type="button" data-view="gauntlet"><span class="app-copy">Decision Gauntlet</span><span id="gauntlet-count" class="nav-count">0/6</span></button>'
  + '<button class="nav-item" type="button" data-view="evidence"><span class="app-copy">Evidence ledger</span><span id="receipt-count" class="nav-count">0</span></button>'
  + '<button class="nav-item" type="button" data-view="method"><span class="app-copy">Decision policy</span><span class="nav-key">04</span></button></div>';
const CONNECTION = '<div class="connection app-copy"><span id="connection-dot" class="status-dot"></span><div><strong id="connection-label">Connecting</strong><small id="connection-detail">Checking data source</small></div></div>';

export function sideHtml(current) {
  const row = ([key, href, label, glyph, children, tag]) => {
    const here = key === current;
    return `<li><a class="app-row${here ? ' is-current' : ''}${here && key === 'slate' ? ' has-child-here' : ''}" href="${href}" data-row${here ? ' aria-current="page"' : ''}>${icon(glyph)}<span class="app-copy">${e(label)}</span>${tag ? `<span class="app-tag app-copy">${e(tag)}</span>` : ''}</a>`
      + (key === 'slate' && here ? SLATE_VIEWS : '')
      + (children && here ? `<ul class="app-sub">${children.map(([subHref, subLabel]) => `<li><a class="app-row app-subrow" href="${subHref}" data-row><span class="app-copy">${e(subLabel)}</span></a></li>`).join('')}</ul>` : '')
      + '</li>';
  };
  return `<div class="app-side-top"><a class="app-brand" href="/judge.html"><img src="/assets/brand/portal-logo-v2.webp" alt="" width="32" height="32"><span class="app-copy">Houselights<span class="site-brand-dot">.</span></span></a>`
    + `<button class="app-collapse" type="button" data-side-toggle aria-label="Collapse sidebar" aria-expanded="true">${icon('collapse')}</button>`
    + `<button class="app-menu" type="button" data-side-menu aria-label="Open menu" aria-expanded="false" aria-controls="app-nav">${icon('menu')}</button></div>`
    + `<nav id="app-nav" class="app-nav" aria-label="Main navigation"><span class="app-glide" aria-hidden="true"></span>`
    + APP.map(([group, rows]) => `${group ? `<p class="app-group app-copy">${e(group)}</p>` : ''}<ul>${rows.map(row).join('')}</ul>`).join('')
    + `</nav><div class="app-side-foot">${current === 'slate' ? CONNECTION : ''}<a class="px-btn" href="https://github.com/codewithanshuman/houselights" aria-label="Source on GitHub, built by Anshu"><span class="px-cells" aria-hidden="true"></span><span class="px-text"><svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg><span class="app-copy app-sign">Anshu</span></span><span class="px-div app-copy" aria-hidden="true"></span><span class="px-arrow app-copy" aria-hidden="true">→</span></a>`
    + `<p class="app-release app-copy">Release <code data-release>…</code></p></div>`;
}

// The landing page footer: a quiet, centred block of text written on the pale sky of the
// owner's pencil drawing of the Golden Gate Bridge, with the small print on the water.
const GH = 'https://github.com/codewithanshuman/houselights';
export function footerHtml() {
  return `<picture class="footer-art"><source media="(max-width: 640px)" srcset="/assets/brand/footer-bridge-phone.webp"><img src="/assets/brand/footer-bridge.webp" alt="Pencil drawing of the Golden Gate Bridge in morning fog, with the city skyline behind it" width="2000" height="667" loading="lazy"></picture>`
    + `<div class="plan-footer-inner"><a class="footer-logo" href="/judge.html"><img src="/assets/brand/portal-logo-v2.webp" alt="" width="32" height="32"><span>Houselights<span class="footer-dot">.</span></span></a>`
    + `<p class="footer-tag">Booking decisions grounded in what your city’s fans already love, with a receipt for every claim.</p>`
    + `<nav class="footer-links" aria-label="Footer"><a href="/judge.html#planner">Plan a show</a><a href="/evidence.html">Evidence</a><a href="/proof-lab.html">Qloo Proof Lab</a><a href="/workspace.html">Workspace</a><a href="${GH}">GitHub</a><a href="${GH}/blob/main/docs/security.md">Security</a></nav>`
    + `<p class="footer-built"><span>Built with</span><img class="footer-qloo" src="/assets/brand/qloo-logo.webp" alt="Qloo" width="96" height="38" loading="lazy"><span>for the Qloo Agentic Hackathon 2026</span></p></div>`
    + `<div class="footer-bottom"><p class="footer-legal">Fees on saved plans are illustrative and fees for new acts are estimates. Nothing is booked.</p><p class="footer-release site-release">MIT license · Release <code id="site-release">…</code></p></div>`;
}

// Fills every empty <header ... data-site-nav="key"></header> and, on the landing page, the empty site footer.
// App pages get the sidebar and the app-shell body class; key "none" drops the header.
export function withSiteNav(html) {
  let app = false;
  let out = html.replace(/(<header\b[^>]*\bdata-site-nav="([\w-]*)"[^>]*>)(<\/header>)/g, (_, open, key, close) => {
    if (key === 'none') return '';
    if (APP_KEYS.has(key)) { app = true; return `<header class="app-side" data-site-nav="${key}">${sideHtml(key)}</header>${key === 'workspace' || key === 'slate' ? '' : topHtml(key)}`; }
    return open + navHtml(key) + close;
  });
  // Only the landing page has a footer; the app pages and the 404 page end with their content.
  const landing = /data-site-nav="booking"/.test(html);
  out = out.replace(/<footer class="site-footer" data-site-footer><\/footer>/g, landing ? `<footer class="site-footer plan-footer" data-site-footer>${footerHtml()}</footer>` : '');
  return app ? out.replace(/<body class="/, '<body class="app-shell ').replace(/<body>/, '<body class="app-shell">') : out;
}
