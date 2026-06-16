// Central site config — nav, features, pricing, region content. Edit here, not in pages.

export const SITE = {
  name: 'MSRM',
  tagline: 'Run your whole restaurant on one platform',
  appUrl: 'https://petpooja-admin.vercel.app', // → app login / signup
  email: 'hello@getmsrm.com',
  // Where the demo form POSTs leads. Override per-env with PUBLIC_LEADS_ENDPOINT
  // (e.g. http://localhost:5001/api/leads for local dev).
  leadsEndpoint: import.meta.env.PUBLIC_LEADS_ENDPOINT || 'https://petpooja-saas.onrender.com/api/leads',
};

export const NAV = [
  { label: 'Features', href: '/features' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Solutions', href: '/solutions' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Integrations', href: '/integrations' },
];

export const FEATURES = [
  { slug: 'pos', name: 'POS Terminal', icon: 'pos', group: 'Front of house',
    blurb: 'Touch-fast billing with split-bill, multi-tender, modifiers, KOT routing and full offline mode.' },
  { slug: 'kds', name: 'Kitchen Display', icon: 'kds', group: 'Kitchen',
    blurb: 'Station routing, bump timers, cook-time SLAs and automatic 86 when stock runs out.' },
  { slug: 'inventory', name: 'Inventory & Purchasing', icon: 'box', group: 'Back office',
    blurb: 'Recipe-based auto-deduction, reorder alerts, purchase orders and central kitchen transfers.' },
  { slug: 'online-orders', name: 'Online Orders & Aggregators', icon: 'bag', group: 'Growth',
    blurb: 'Swiggy, Zomato, Uber Eats, DoorDash & Menulog in one screen — plus your own QR ordering.' },
  { slug: 'accounting', name: 'Accounting & Compliance', icon: 'ledger', group: 'Back office',
    blurb: 'GST & BAS, Xero sync and payroll for Australia; GST and e-invoicing for India.' },
  { slug: 'analytics', name: 'Analytics & Reports', icon: 'chart', group: 'Growth',
    blurb: 'Live sales, menu performance, per-channel analytics and one-click end-of-day.' },
  { slug: 'multi-outlet', name: 'Multi-Outlet & Chains', icon: 'building', group: 'Front of house',
    blurb: 'Central menu, per-outlet pricing, chain-wide reporting and granular staff roles.' },
];

export const PLANS = [
  { name: 'Starter', tag: 'Single outlet', inr: 999, aud: 39,
    features: ['POS + KDS', 'Menu & tables', 'Basic reports', '1 outlet', 'Email support'] },
  { name: 'Growth', popular: true, tag: 'Most popular', inr: 1999, aud: 79,
    features: ['Everything in Starter', 'Inventory & purchasing', 'Online orders & aggregators', 'Loyalty & CRM', 'Priority support'] },
  { name: 'Chain', tag: 'Multi-outlet', inr: 0, aud: 0, custom: true,
    features: ['Everything in Growth', 'Multi-outlet & central kitchen', 'Accounting & payroll', 'Advanced analytics', 'Dedicated manager'] },
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
    intro: 'Built for delivery: every aggregator unified, per-brand menus and stock that deducts itself.',
    challenges: ['Many brands & channels', 'Tablet chaos', 'Stock & cost control'],
    features: ['online-orders', 'kds', 'inventory'] },
  { slug: 'cafe', name: 'Café & Bakery', need: 'Quick counter + stock',
    intro: 'Fast counter service, modifiers, and recipe-based stock so you always know what to reorder.',
    challenges: ['Fast counter turnover', 'Wastage & stock', 'Knowing best-sellers'],
    features: ['pos', 'inventory', 'analytics'] },
  { slug: 'chains', name: 'Chains & Franchises', need: 'Central control',
    intro: 'One central menu, per-outlet pricing, chain-wide reporting and clean accounting across every store.',
    challenges: ['Consistency across outlets', 'Central vs local pricing', 'Roll-up reporting & compliance'],
    features: ['multi-outlet', 'accounting', 'analytics'] },
];

// ── Case studies (ILLUSTRATIVE — replace with real customers before launch) ──
export const CASE_STUDIES = [
  { region: 'in', name: 'Spice Garden', type: 'Multi-outlet · Mumbai',
    summary: 'Consolidated POS, Swiggy/Zomato and books into one system across 3 outlets.',
    metrics: [{ v: '4→1', l: 'tools replaced' }, { v: '12 hrs/wk', l: 'saved on reconciliation' }, { v: '99.9%', l: 'uptime' }],
    quote: 'Orders, kitchen, stock and our books finally talk to each other.' },
  { region: 'au', name: 'Coastal Kitchen', type: 'Café · Bondi, Sydney',
    summary: 'Unified Uber Eats, DoorDash & Menulog with EFTPOS and Xero for BAS.',
    metrics: [{ v: '5', l: 'channels in one screen' }, { v: '1 day', l: 'to go live' }, { v: 'A$0', l: 'missed-order downtime' }],
    quote: 'We see every channel’s real margin after commission — finally.' },
  { region: 'in', name: 'Tandoor Express', type: 'QSR · Delhi',
    summary: 'Cut queue times with fast POS + KDS and auto-86 across delivery apps.',
    metrics: [{ v: '30%', l: 'faster order-to-kitchen' }, { v: '0', l: 'oversells after auto-86' }, { v: '2 days', l: 'staff onboarded' }],
    quote: 'New staff are productive on day one — no training manual needed.' },
];

// ── Blog (real, useful SEO posts) ──
export const POSTS = [
  {
    slug: 'cut-restaurant-food-cost', title: 'Cut your restaurant food cost in 5 steps', tag: 'Operations', date: '2026-06-01',
    excerpt: 'Food cost quietly eats your margin. Here’s a practical, no-nonsense way to bring it under control.',
    body: `<p>Food cost is the single biggest controllable expense in most restaurants. Get it 3–4 points lower and you’ve added real profit without selling a single extra plate.</p>
<h2>1. Cost every recipe</h2><p>You can’t manage what you don’t measure. Build a recipe for each menu item with exact ingredient quantities, then let the system deduct stock on every sale — so theoretical usage and actual usage can be compared.</p>
<h2>2. Watch variance, not just stock</h2><p>The gap between what <em>should</em> have been used (recipe × sales) and what <em>was</em> used is where waste, theft and over-portioning hide. Review variance weekly.</p>
<h2>3. Reorder on data, not gut</h2><p>Set par levels and let low-stock alerts trigger purchase orders. You stop both stockouts and over-ordering.</p>
<h2>4. Kill the dead menu items</h2><p>Use menu analytics to find low-margin, low-selling “dogs” and either re-engineer or remove them.</p>
<h2>5. Reconcile daily</h2><p>An end-of-day close that ties sales, payments and stock together catches problems while they’re small.</p>
<p>MSRM does steps 1–5 automatically — recipes, variance, reorder alerts, menu analytics and one-click EOD.</p>` },
  {
    slug: 'aggregator-commissions-india', title: 'Swiggy vs Zomato commissions: what to actually track', tag: 'Delivery', date: '2026-05-20',
    excerpt: 'Aggregators bring volume but take a big cut. Track net-per-channel, not gross, to know what’s really working.',
    body: `<p>Delivery aggregators can be 18–30% in commission once you add packaging and ad spend. The mistake most owners make is celebrating gross delivery sales while ignoring what lands in the bank.</p>
<h2>Track net, per channel</h2><p>The number that matters is <strong>net revenue after commission</strong> for each platform. A channel doing high gross at 30% commission may make you less than a smaller one at 15%.</p>
<h2>Price per channel</h2><p>Many restaurants set delivery menu prices higher to absorb commission. Per-channel pricing lets you do this cleanly instead of eating the cut.</p>
<h2>Stop overselling</h2><p>When an item runs out, it should 86 across <em>every</em> channel instantly — or you’ll get cancellations and bad ratings.</p>
<p>MSRM’s channel analytics shows gross, commission and net side by side, supports per-channel pricing, and auto-86s items everywhere at once.</p>` },
  {
    slug: 'switch-pos-without-losing-orders', title: 'How to switch POS without losing your online orders', tag: 'Migration', date: '2026-05-05',
    excerpt: 'Changing POS feels risky when Swiggy/Zomato or Uber Eats run through it. Here’s how to switch with zero downtime.',
    body: `<p>The number-one fear when changing POS is: “what happens to my delivery orders during the switch?” Done right, the answer is: nothing — they keep flowing.</p>
<h2>Run in parallel</h2><p>Don’t flip a switch overnight. Bring your menu, tables and staff into the new system and run it alongside the old one until you’re confident.</p>
<h2>Keep aggregators live through cutover</h2><p>Your Swiggy/Zomato (or Uber Eats/DoorDash/Menulog) links should stay active and only move at cutover, outlet by outlet.</p>
<h2>Import, don’t re-type</h2><p>Your menu, tables, staff and exportable customer data should be migrated for you — not re-entered by hand.</p>
<p>That’s exactly how MSRM migrations work. <a href="/migration">See the migration process →</a></p>` },
];

export const REGIONS = {
  in: { code: 'in', flag: '🇮🇳', label: 'India', cur: '₹', per: '/outlet / mo',
        aggregators: ['Swiggy', 'Zomato', 'ONDC'], tax: 'GST & e-invoicing', pay: 'UPI · Razorpay · Cards' },
  au: { code: 'au', flag: '🇦🇺', label: 'Australia', cur: 'A$', per: '/outlet / mo',
        aggregators: ['Uber Eats', 'DoorDash', 'Menulog'], tax: 'GST, BAS & Xero', pay: 'EFTPOS · Square · Stripe' },
};
