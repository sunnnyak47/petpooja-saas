// Central site config — nav, features, pricing, region content. Edit here, not in pages.
//
// BRAND NOTE: this India site is branded "MSRM", NOT "Petpooja". "Petpooja" is an
// established Indian restaurant-POS company; launching under that name would collide
// with their trademark. MSRM is used throughout. Revisit before launch (see DEPLOY.md).

export const SITE = {
  name: 'MSRM',
  tagline: 'Run your entire restaurant on one platform',
  domain: 'msrm.in',                                 // placeholder — confirm before launch
  appUrl: 'https://petpooja-admin.vercel.app',       // → app login / signup
  email: 'hello@msrm.in',
  // Where the demo form POSTs leads. Override per-env with PUBLIC_LEADS_ENDPOINT
  // (e.g. http://localhost:5001/api/leads for local dev).
  leadsEndpoint: import.meta.env.PUBLIC_LEADS_ENDPOINT || 'https://petpooja-saas.onrender.com/api/leads',
};

export const NAV = [
  { label: 'Features', href: '/features' },
  { label: 'Why MSRM', href: '/why-msrm' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Solutions', href: '/solutions' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Integrations', href: '/integrations' },
];

export const FEATURES = [
  { slug: 'pos', name: 'POS Billing', icon: 'pos', group: 'Front of house',
    blurb: 'Touch-fast billing with split-bill, multi-tender (UPI / card / cash), modifiers, KOT printing and full offline mode.' },
  { slug: 'kds', name: 'Kitchen Display', icon: 'kds', group: 'Kitchen',
    blurb: 'Station routing, bump timers, cook-time SLAs and automatic 86 when stock runs out.' },
  { slug: 'inventory', name: 'Inventory & Purchasing', icon: 'box', group: 'Back office',
    blurb: 'Recipe-based auto-deduction, reorder alerts, purchase orders and central-kitchen transfers.' },
  { slug: 'online-orders', name: 'Online Orders & Aggregators', icon: 'bag', group: 'Growth',
    blurb: 'Zomato & Swiggy in one screen — plus your own commission-free QR ordering.' },
  { slug: 'accounting', name: 'GST & Accounting', icon: 'ledger', group: 'Back office',
    blurb: 'GST invoicing, GSTR-1 & GSTR-3B-ready reports and Tally sync — automatic and compliant.' },
  { slug: 'analytics', name: 'Analytics & Reports', icon: 'chart', group: 'Growth',
    blurb: 'Live sales, item performance, per-channel analytics and one-tap day-end close.' },
  { slug: 'multi-outlet', name: 'Multi-Outlet & Chains', icon: 'building', group: 'Front of house',
    blurb: 'Central menu, per-outlet pricing, chain-wide reporting and granular staff roles.' },
];

// Prices in ₹ per outlet / month (existing INR plan values). GST extra.
export const PLANS = [
  { name: 'Starter', tag: 'Single outlet', inr: 999,
    features: ['POS + KDS', 'Menu & tables', 'GST billing', 'Basic reports', '1 outlet', 'Email support'] },
  { name: 'Growth', popular: true, tag: 'Most popular', inr: 1999,
    features: ['Everything in Starter', 'Inventory & purchasing', 'Zomato & Swiggy + QR ordering', 'Loyalty & CRM', 'Priority support'] },
  { name: 'Chain', tag: 'Multi-outlet', inr: 0, custom: true,
    features: ['Everything in Growth', 'Multi-outlet & central kitchen', 'GSTR & Tally, advanced accounting', 'Advanced analytics', 'Dedicated manager'] },
];

// ── Solutions (by restaurant type) → deep-link to the features that matter ──
export const SOLUTIONS = [
  { slug: 'qsr', name: 'QSR & Fast Food', need: 'Speed & throughput',
    intro: 'Move queues fast: rapid order entry, instant kitchen tickets and every delivery app in one screen.',
    challenges: ['Long queues at peak', 'Orders scattered across aggregator tablets', 'Slow kitchen handoff'],
    features: ['pos', 'kds', 'online-orders'] },
  { slug: 'fine-dine', name: 'Fine Dine', need: 'Table service & experience',
    intro: 'Run the floor with confidence — table plans, course-paced KOTs, split bills and a calm back office.',
    challenges: ['Complex table service', 'Split bills & multi-tender', 'Owner needs clear numbers'],
    features: ['pos', 'multi-outlet', 'analytics'] },
  { slug: 'cloud-kitchen', name: 'Cloud Kitchen', need: 'Delivery-only, many brands',
    intro: 'Built for delivery: Zomato & Swiggy unified, per-brand menus and stock that deducts itself.',
    challenges: ['Many brands & channels', 'Tablet chaos', 'Stock & food-cost control'],
    features: ['online-orders', 'kds', 'inventory'] },
  { slug: 'cafe', name: 'Café & Bakery', need: 'Quick counter + stock',
    intro: 'Fast counter service, modifiers, and recipe-based stock so you always know what to reorder.',
    challenges: ['Fast counter turnover', 'Wastage & stock', 'Knowing best-sellers'],
    features: ['pos', 'inventory', 'analytics'] },
  { slug: 'chains', name: 'Chains & Franchises', need: 'Central control',
    intro: 'One central menu, per-outlet pricing, chain-wide reporting and clean GST accounting across every store.',
    challenges: ['Consistency across outlets', 'Central vs local pricing', 'Roll-up reporting & GST compliance'],
    features: ['multi-outlet', 'accounting', 'analytics'] },
];

// ── Case studies (ILLUSTRATIVE — replace with real customers before launch) ──
export const CASE_STUDIES = [
  { name: 'Tulsi Kitchen', type: 'Multi-outlet · Mumbai',
    summary: 'Consolidated POS, Zomato & Swiggy and GST books into one system across 3 outlets.',
    metrics: [{ v: '4→1', l: 'tools replaced' }, { v: '12 hrs/wk', l: 'saved on reconciliation' }, { v: '99.9%', l: 'uptime' }],
    quote: 'Orders, kitchen, stock and our GST filing finally talk to each other.' },
  { name: 'Filter & Co.', type: 'Café · Bengaluru',
    summary: 'Unified Zomato & Swiggy with UPI billing and GSTR-1/3B-ready reports.',
    metrics: [{ v: '2', l: 'apps in one screen' }, { v: '1 day', l: 'to go live' }, { v: '₹0', l: 'missed-order downtime' }],
    quote: 'We finally see each channel’s real margin after commission.' },
  { name: 'Highway Rolls', type: 'QSR · Delhi NCR',
    summary: 'Cut queue times with fast POS + KDS and auto-86 across delivery apps.',
    metrics: [{ v: '30%', l: 'faster order-to-kitchen' }, { v: '0', l: 'oversells after auto-86' }, { v: '2 days', l: 'staff onboarded' }],
    quote: 'New staff are productive on day one — no training manual needed.' },
];

// ── Blog (real, useful SEO posts, India context) ──
export const POSTS = [
  {
    slug: 'cut-restaurant-food-cost', title: 'Cut your restaurant food cost in 5 steps', tag: 'Operations', date: '2026-06-01',
    excerpt: 'Food cost quietly eats your margin. Here’s a practical, no-nonsense way to bring it under control.',
    body: `<p>Food cost is the single biggest controllable expense in most restaurants. Get it 3–4 points lower and you’ve added real profit without selling a single extra plate.</p>
<h2>1. Cost every recipe</h2><p>You can’t manage what you don’t measure. Build a recipe for each menu item with exact ingredient quantities, then let the system deduct stock on every sale — so theoretical usage and actual usage can be compared.</p>
<h2>2. Watch variance, not just stock</h2><p>The gap between what <em>should</em> have been used (recipe × sales) and what <em>was</em> used is where wastage, pilferage and over-portioning hide. Review variance weekly.</p>
<h2>3. Reorder on data, not gut</h2><p>Set par levels and let low-stock alerts trigger purchase orders. You stop both stockouts and over-ordering.</p>
<h2>4. Kill the dead menu items</h2><p>Use menu analytics to find low-margin, low-selling “dogs” and either re-engineer or remove them.</p>
<h2>5. Reconcile daily</h2><p>A day-end close that ties sales, payments and stock together catches problems while they’re small.</p>
<p>MSRM does steps 1–5 automatically — recipes, variance, reorder alerts, menu analytics and one-tap day-end.</p>` },
  {
    slug: 'zomato-swiggy-commissions', title: 'Zomato vs Swiggy: the delivery numbers to actually track', tag: 'Delivery', date: '2026-05-20',
    excerpt: 'Aggregators bring volume but take a big cut. Track net-per-channel, not gross, to know what’s really working.',
    body: `<p>Delivery aggregators can run 18–28% in commission once you add packaging and promoted listings. The mistake most owners make is celebrating gross delivery sales while ignoring what lands in the bank.</p>
<h2>Track net, per channel</h2><p>The number that matters is <strong>net revenue after commission</strong> for each platform. A channel doing high gross at 28% commission may make you less than a smaller one at 18%.</p>
<h2>Price per channel</h2><p>Many restaurants set delivery menu prices higher to absorb commission. Per-channel pricing lets you do this cleanly instead of eating the cut.</p>
<h2>Stop overselling</h2><p>When an item runs out, it should 86 across <em>every</em> channel instantly — or you’ll get cancellations and bad ratings.</p>
<p>MSRM’s channel analytics shows gross, commission and net side by side, supports per-channel pricing, and auto-86s items everywhere at once.</p>` },
  {
    slug: 'gst-filing-for-restaurants', title: 'GST for restaurants: GSTR-1 and GSTR-3B without the last-minute panic', tag: 'Compliance', date: '2026-05-05',
    excerpt: 'Filing shouldn’t mean a month-end scramble through printouts. Here’s how to keep your books return-ready every day.',
    body: `<p>For most restaurant owners, GST filing means a stressful month-end: chasing bill books, matching aggregator payouts, and hoping the totals tie out before the deadline. It doesn’t have to.</p>
<h2>Bill it right the first time</h2><p>Every sale should raise a GST-correct tax invoice at the point of billing — with the right rate and a proper invoice series. Get this right and your outward-supply data is clean from the start.</p>
<h2>Keep returns data ready daily</h2><p>Your sales, tax collected and channel-wise breakup should roll up into GSTR-1 and GSTR-3B-ready summaries as you trade — not be reconstructed at month-end.</p>
<h2>Reconcile aggregator payouts</h2><p>Zomato and Swiggy deduct commission and their own taxes before payout. Match each payout against orders so nothing goes missing from your books.</p>
<h2>Sync to Tally</h2><p>Push clean, categorised entries to Tally instead of re-keying — fewer errors, faster closes.</p>
<p>MSRM raises GST-correct invoices, keeps GSTR-1 and GSTR-3B summaries ready, reconciles aggregator payouts, and syncs to Tally. <a href="/features/accounting">See GST & accounting →</a></p>` },
];

export const REGION = {
  code: 'in', flag: '🇮🇳', label: 'India', cur: '₹', per: '/outlet / mo',
  aggregators: ['Zomato', 'Swiggy'],
  tax: 'GST, GSTR-1 & GSTR-3B, Tally',
  pay: 'UPI · Razorpay · Cards · Cash',
};

// ── Support / company details ───────────────────────────────────────────────
// TODO(owner): replace the phone + GSTIN placeholders with your real details
// before launch. Email + demo are live; phone/GSTIN are intentionally blank so we
// never show a fake number.
export const SUPPORT = {
  phone: '',            // e.g. '+91 80 1234 5678' — leave '' to hide the call CTA
  gstin: '',            // e.g. '29ABCDE1234F1Z5' — shown in the footer when set
  onboarding: 'India-based onboarding — we migrate you over and stay on through go-live.',
  hours: 'Real people, not a ticket queue.',
};

// ── Capability comparison — CATEGORIES, not named brands ─────────────────────
// India positioning avoids naming/disparaging specific incumbents (trademark +
// misleading-claim risk). Compare by capability category only.
export const CATEGORY_COMPARE = {
  cols: ['MSRM', 'Typical cloud POS', 'Legacy / desktop POS'],
  rows: [
    ['All-in-one — one price', 'yes', 'addon', 'module'],
    ['Delivery apps built in (Zomato · Swiggy)', 'yes', 'middleware', 'addon'],
    ['Net margin per channel (commission reconciliation)', 'yes', 'no', 'limited'],
    ['Auto-86 across every channel', 'yes', 'no', 'limited'],
    ['Offline mode (keep billing without internet)', 'yes', 'limited', 'yes'],
    ['GST invoicing, GSTR-1 & GSTR-3B', 'yes', 'addon', 'addon'],
    ['Tally sync', 'yes', 'addon', 'addon'],
    ['Split bill & multi-tender (UPI / card / cash)', 'yes', 'limited', 'yes'],
    ['Own QR ordering (zero commission)', 'yes', 'addon', 'limited'],
    ['Multi-outlet central control', 'yes', 'limited', 'yes'],
    ['Live in a day', 'yes', 'yes', 'weeks'],
    ['Zero-downtime migration', 'yes', 'na', 'na'],
  ] as const,
  cell: {
    yes:        { t: '✓',                c: '#16a34a', w: 700 },
    no:         { t: '—',                c: '#94a3b8', w: 400 },
    limited:    { t: 'Limited',          c: '#f59e0b', w: 500 },
    addon:      { t: 'Paid add-on',      c: '#f59e0b', w: 500 },
    middleware: { t: 'Via middleware',   c: '#f59e0b', w: 500 },
    module:     { t: 'Module-by-module', c: '#f59e0b', w: 500 },
    weeks:      { t: 'Weeks',            c: '#94a3b8', w: 400 },
    na:         { t: '—',                c: '#94a3b8', w: 400 },
  } as Record<string, { t: string; c: string; w: number }>,
};

// ── Homepage hero — the 5 modules that "assemble into one platform" ──────────
// Drives BOTH the Three.js hero (exploded → docked) and the static CSS
// ModulesTurn echo. `offset` = exploded position (three.js world units, x,y,z);
// `color` = edge glow.
export const HERO_MODULES = [
  { key: 'pos',        label: 'POS',        color: '#2563eb', shot: 'pos',         offset: [-2.7,  1.5,  0.8] },
  { key: 'kds',        label: 'Kitchen',    color: '#f59e0b', shot: 'kds',         offset: [ 2.7,  1.3, -0.6] },
  { key: 'inventory',  label: 'Inventory',  color: '#16a34a', shot: 'inventory',   offset: [-2.9, -1.5, -0.4] },
  { key: 'delivery',   label: 'Delivery',   color: '#7c3aed', shot: 'aggregators', offset: [ 2.9, -1.4,  0.7] },
  { key: 'accounting', label: 'GST & Books',color: '#0891b2', shot: 'gst',         offset: [ 0.0,  2.4, -1.3] },
] as const;

// ── Pain points (problem → answer) ───────────────────────────────────────────
export const PAINS = [
  { title: 'Add-on creep', icon: 'spark',
    before: 'You pay for the POS — then again for delivery, inventory, GST filing and loyalty. The bill balloons every quarter.',
    after:  'One platform, one per-outlet price. POS, delivery, stock, GST and accounting included — no add-on surprises.' },
  { title: 'Zomato & Swiggy tablet chaos', icon: 'bag',
    before: 'A separate tablet per delivery app, each re-keyed into the till. Missed orders, wrong items, angry ratings.',
    after:  'Zomato & Swiggy land on one screen beside your dine-in orders — nothing re-typed, and items 86 everywhere at once.' },
  { title: 'No real margin view', icon: 'chart',
    before: 'You see gross delivery sales, never the net after 18–28% commission — so you can’t tell what actually pays.',
    after:  'Every channel side by side: gross, commission and the net that actually hits your account.' },
];

// ── Offline-first spotlight (the differentiator) ─────────────────────────────
export const OFFLINE = {
  eyebrow: 'Never stops billing',
  title: 'The internet drops mid-dinner rush. Your POS doesn’t.',
  body: 'MSRM is offline-first — built for real Indian connectivity. Keep taking orders, printing KOTs and settling bills with no internet; everything syncs automatically the moment you’re back online.',
  points: [
    'Orders & KOTs keep flowing',
    'UPI, card + cash still settle',
    'Auto-syncs on reconnect',
    'No lost sales, no manual re-entry',
  ],
};
