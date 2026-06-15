// Central site config — nav, features, pricing, region content. Edit here, not in pages.

export const SITE = {
  name: 'MSRM',
  tagline: 'Run your whole restaurant on one platform',
  appUrl: 'https://petpooja-admin.vercel.app', // → app login / signup
  email: 'hello@getmsrm.com',
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

export const REGIONS = {
  in: { code: 'in', flag: '🇮🇳', label: 'India', cur: '₹', per: '/outlet / mo',
        aggregators: ['Swiggy', 'Zomato', 'ONDC'], tax: 'GST & e-invoicing', pay: 'UPI · Razorpay · Cards' },
  au: { code: 'au', flag: '🇦🇺', label: 'Australia', cur: 'A$', per: '/outlet / mo',
        aggregators: ['Uber Eats', 'DoorDash', 'Menulog'], tax: 'GST, BAS & Xero', pay: 'EFTPOS · Square · Stripe' },
};
