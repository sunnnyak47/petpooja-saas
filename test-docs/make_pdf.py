#!/usr/bin/env python3
"""Generates the MS-RM / PetPooja frontend UAT test plan PDF (owner, AU profile)."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, ListFlowable, ListItem, HRFlowable)
from reportlab.lib.enums import TA_LEFT

# ---- palette ----
NAVY = colors.HexColor('#0f172a')
ACCENT = colors.HexColor('#2563eb')
GREEN = colors.HexColor('#16a34a')
AMBER = colors.HexColor('#b45309')
RED = colors.HexColor('#dc2626')
LIGHT = colors.HexColor('#f1f5f9')
BORDER = colors.HexColor('#cbd5e1')
GREY = colors.HexColor('#475569')

styles = getSampleStyleSheet()
def S(name, **kw):
    styles.add(ParagraphStyle(name, parent=styles['Normal'], **kw))

S('Cover', fontSize=26, leading=30, textColor=NAVY, spaceAfter=6, fontName='Helvetica-Bold')
S('CoverSub', fontSize=13, leading=17, textColor=ACCENT, fontName='Helvetica-Bold')
S('H1', fontSize=15, leading=19, textColor=colors.white, fontName='Helvetica-Bold',
  backColor=NAVY, borderPadding=(6,8,6,8), spaceBefore=16, spaceAfter=8)
S('H2', fontSize=12, leading=15, textColor=ACCENT, fontName='Helvetica-Bold', spaceBefore=10, spaceAfter=4)
S('Body', fontSize=9.5, leading=13.5, textColor=colors.HexColor('#1e293b'), spaceAfter=4)
S('Small', fontSize=8.5, leading=11.5, textColor=GREY)
S('Cell', fontSize=8.5, leading=11, textColor=colors.HexColor('#1e293b'))
S('CellHdr', fontSize=8.5, leading=11, textColor=colors.white, fontName='Helvetica-Bold')
S('Note', fontSize=9, leading=12.5, textColor=AMBER, fontName='Helvetica-Bold')
S('Tip', fontSize=9, leading=12.5, textColor=GREEN)

story = []
def P(t, s='Body'): story.append(Paragraph(t, styles[s]))
def sp(h=6): story.append(Spacer(1, h))
def hr(): story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceBefore=4, spaceAfter=6))

def steps_table(rows):
    """rows: list of (action, expected). Adds #, tick box, fail box columns."""
    data = [[Paragraph('#', styles['CellHdr']),
             Paragraph('Do this', styles['CellHdr']),
             Paragraph('You should see', styles['CellHdr']),
             Paragraph('Pass', styles['CellHdr']),
             Paragraph('Fail', styles['CellHdr'])]]
    for i, (a, e) in enumerate(rows, 1):
        data.append([Paragraph(str(i), styles['Cell']),
                     Paragraph(a, styles['Cell']),
                     Paragraph(e, styles['Cell']),
                     Paragraph('&#9744;', styles['Cell']),
                     Paragraph('&#9744;', styles['Cell'])])
    t = Table(data, colWidths=[8*mm, 72*mm, 72*mm, 11*mm, 11*mm], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), ACCENT),
        ('GRID',(0,0),(-1,-1),0.4, BORDER),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, LIGHT]),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),
        ('ALIGN',(3,0),(4,-1),'CENTER'),
    ]))
    story.append(t); sp(8)

def module(num, title, purpose, where, steps, tiny, links):
    P(f'{num}. {title}', 'H1')
    P(f'<b>What it is:</b> {purpose}')
    P(f'<b>Where to find it:</b> {where}', 'Small')
    sp(2)
    P('Step-by-step', 'H2')
    steps_table(steps)
    if tiny:
        P('Tiny things to also click / check', 'H2')
        story.append(ListFlowable([ListItem(Paragraph(x, styles['Body']), leftIndent=10) for x in tiny],
                                  bulletType='bullet', start='square', bulletColor=ACCENT))
        sp(6)
    if links:
        P('Interlinking check (does it flow to other screens?)', 'H2')
        story.append(ListFlowable([ListItem(Paragraph(x, styles['Body']), leftIndent=10) for x in links],
                                  bulletType='bullet', start='&rarr;', bulletColor=GREEN))
        sp(6)
    story.append(PageBreak())

# ============================ COVER ============================
sp(60)
P('MS-RM / PetPooja', 'Cover')
P('Frontend Test Plan &amp; Launch Checklist', 'CoverSub')
sp(14)
P('Role tested: <b>Restaurant Owner</b> &nbsp;|&nbsp; Region: <b>Australia (A$ / GST 10%)</b>', 'Body')
P('Goal: click through every screen, confirm each feature works, and decide if the software is ready to go live.', 'Body')
sp(20)
fill = [['Tester (intern) name', ''], ['Date of testing', ''],
        ['Owner login email (given to you)', ''], ['Owner password / temp password', ''],
        ['App URL', 'https://petpooja-admin.vercel.app'], ['Browser + version', ''],
        ['Bug log file used', 'MS-RM_Bug_Audit_Log.xlsx']]
t = Table([[Paragraph(f'<b>{k}</b>', styles['Cell']), Paragraph(v or '__________________________', styles['Cell'])] for k,v in fill],
          colWidths=[70*mm, 100*mm])
t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.4,BORDER),('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white,LIGHT]),
                       ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
                       ('LEFTPADDING',(0,0),(-1,-1),6)]))
story.append(t)
story.append(PageBreak())

# ============================ HOW TO USE ============================
P('How to use this document', 'H1')
P('You are testing the software as a real restaurant owner would. You do <b>not</b> need to be technical. '
  'For every step below, do the action and check you see the expected result.')
sp(2)
story.append(ListFlowable([
    ListItem(Paragraph('<b>Tick "Pass"</b> if it works exactly as the "You should see" column says.', styles['Body'])),
    ListItem(Paragraph('<b>Tick "Fail"</b> if anything is wrong, missing, slow, ugly, or confusing — then immediately write it in the Excel bug log (next page explains how).', styles['Body'])),
    ListItem(Paragraph('Test the modules <b>top to bottom in order</b> — later modules depend on data you create in earlier ones.', styles['Body'])),
    ListItem(Paragraph('Take a screenshot of every problem (full screen). Name it like <b>M3-step5.png</b> (module 3, step 5).', styles['Body'])),
], bulletType='bullet', start='square', bulletColor=ACCENT))
sp(8)
P('Logging a problem in the Excel (MS-RM_Bug_Audit_Log.xlsx)', 'H2')
P('Open the "Bug Log" tab and fill one row per problem:', 'Body')
loga = [
 ('Bug ID','Auto / type B-001, B-002 …'),
 ('Module','Which module number + name (e.g. "3 - POS Terminal")'),
 ('Feature','The exact button/field (e.g. "Split bill")'),
 ('Steps to reproduce','Short numbered steps so a developer can repeat it'),
 ('Expected','What should have happened'),
 ('Actual','What actually happened'),
 ('Severity','Critical / High / Medium / Low (see below)'),
 ('Screenshot','File name of your screenshot'),
 ('Status','Leave as "Open"'),
]
t = Table([[Paragraph(f'<b>{a}</b>', styles['Cell']), Paragraph(b, styles['Cell'])] for a,b in loga],
          colWidths=[40*mm, 130*mm])
t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.4,BORDER),('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white,LIGHT]),
                       ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),('LEFTPADDING',(0,0),(-1,-1),6)]))
story.append(t); sp(8)
P('How bad is it? (Severity)', 'H2')
sev = [('Critical', RED, 'Blocks work / loses money / data. Cannot launch. e.g. cannot place an order, payment fails, page crashes.'),
       ('High', AMBER, 'Major feature broken but a workaround exists. e.g. report shows wrong total, KOT not printing.'),
       ('Medium', ACCENT, 'Noticeable but not blocking. e.g. wrong label, filter not working, slow screen.'),
       ('Low', GREY, 'Cosmetic. e.g. spacing off, typo, colour, icon misaligned.')]
data=[[Paragraph('<b>Level</b>',styles['CellHdr']),Paragraph('<b>Meaning</b>',styles['CellHdr'])]]
for lv,c,m in sev:
    data.append([Paragraph(f'<font color="{c.hexval()}"><b>{lv}</b></font>', styles['Cell']), Paragraph(m, styles['Cell'])])
t=Table(data, colWidths=[28*mm,142*mm]); t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),
    ('GRID',(0,0),(-1,-1),0.4,BORDER),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),
    ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),('LEFTPADDING',(0,0),(-1,-1),6)]))
story.append(t)
sp(8)
P('Tip: if a screen is blank or shows an error toast, screenshot it, note the time, and refresh once. '
  'If it still fails, log it as Critical/High.', 'Note')
story.append(PageBreak())

# ============================ MODULES ============================
module(1, 'Login &amp; Onboarding',
   'The owner signs in and (first time only) completes the setup wizard.',
   'App URL &rarr; Sign in. Onboarding opens automatically for a brand-new owner.',
   [('Open the app URL and click Sign In', 'Login screen loads within a few seconds (first load may take ~50s if the server was asleep — wait, do not refresh repeatedly).'),
    ('Enter the owner email (any capitalisation) + password, click Login', 'You land on the Dashboard. Wrong password shows a clear error, not a blank screen.'),
    ('If the 7-step setup wizard appears, fill Business Profile (name, country = Australia)', 'Currency shows A$, ABN/ACN fields appear (not GSTIN). City placeholder = Sydney, phone prefix = +61.'),
    ('Complete the wizard or click "Skip setup & go to dashboard"', 'You reach the dashboard. No sideways/horizontal scrolling on the wizard.'),
    ('Sign out (bottom-left) and sign back in', 'Session ends and you can log in again cleanly.')],
   ['Email is case-insensitive (try ONE capital letter in the email — still logs in).',
    'Refresh the page while logged in — you stay logged in.',
    'Wizard progress bar is aligned; step icons turn green as you finish.'],
   ['Anything entered in the wizard (outlet name, tables, menu, staff) must appear later in Menu, Tables and Staff modules — you will verify this in those modules.'])

module(2, 'Dashboard &amp; Business Health',
   'The home screen with today\'s key numbers and shortcuts.',
   'Left sidebar &rarr; Dashboard / Business Health.',
   [('Open the Dashboard', 'Cards show Today\'s Revenue, Orders, Tables, Inventory alerts. Numbers are A$.'),
    ('Note the "Today\'s Revenue" and "Orders" numbers', 'Write them down — you will re-check them after placing test orders.'),
    ('Click each shortcut card (Tables, Kitchen, Reports, etc.)', 'Each opens the correct screen.'),
    ('Open Business Health', 'A score / breakdown loads without error.')],
   ['All money shows A$ (never ₹).', 'No "undefined", "NaN", or blank cards.', 'Open tab count matches reality.'],
   ['After you place + settle orders later, return here and confirm Today\'s Revenue & Orders went UP by the right amount.'])

module(3, 'POS Terminal (most important)',
   'Where staff take orders. Test this thoroughly.',
   'Sidebar &rarr; POS Terminal.',
   [('Open POS. Pick a Table (dine-in) or Takeaway', 'Menu items load with A$ prices.'),
    ('Add several items to the cart; change quantities', 'Cart updates totals live; GST (10%) shows; total is correct.'),
    ('Apply a discount / coupon if available', 'Discount reduces the total correctly.'),
    ('Add a modifier / note to an item', 'Modifier shows on the cart line.'),
    ('Send to Kitchen (KOT) / Save order', 'Success message; order gets a number.'),
    ('Click PAY → choose Cash → enter amount → confirm', 'Payment completes; receipt/bill can be viewed; cart clears.'),
    ('Do a SPLIT BILL: open Split, split equally between 2, pick methods, process', 'Each part processes; order closes only when fully paid.'),
    ('Do a PART/MULTI-TENDER: pay part by cash, leave balance', 'Order stays OPEN with a balance; you can pay the rest later.')],
   ['Payment methods shown are AU ones: Cash, EFTPOS, Card (NOT UPI/Razorpay).',
    'Change/return is calculated for cash.', 'Gratuity/tip selector works.',
    'Search a menu item by name works.', 'Switching tables keeps the right cart.'],
   ['New paid order &rarr; appears in Running Orders (module 5).',
    'Items sent to kitchen &rarr; appear on the KDS (module 4).',
    'Inventory of used ingredients &rarr; goes DOWN (module 9).',
    'Revenue &rarr; updates Dashboard (module 2), Reports (module 14) and EOD.',
    'A partly-paid order &rarr; shows a "Partial · Bal A$xx" badge in Running Orders.'])

module(4, 'Kitchen Display (KDS)',
   'The kitchen screen that shows incoming orders/tickets.',
   'Sidebar &rarr; Kitchen Display.',
   [('Open KDS after sending a KOT from POS', 'The order ticket appears with its items, table/order number and a timer.'),
    ('Mark an item / ticket as "Preparing" then "Ready"', 'Status changes; timer behaves; colour changes.'),
    ('Bump / complete a ticket', 'Ticket clears from the active board.')],
   ['Timer counts up; late orders highlight.', 'Sound/visual alert on new ticket (if enabled in Settings).',
    'Station routing (if used) shows the item on the right station.'],
   ['"Ready" status &rarr; should reflect on Running Orders (module 5).',
    'Aggregator orders (module 13) &rarr; should ALSO appear here automatically.'])

module(5, 'Running / Live Orders',
   'All currently-open orders across the restaurant.',
   'Sidebar &rarr; Live Orders.',
   [('Open Live Orders', 'Your open test orders are listed with status, table, amount, timer.'),
    ('Use the status filters (Pending / Confirmed / Billed) and search', 'List filters correctly.'),
    ('Find the partly-paid order from module 3', 'It shows an amber "Partial · Bal A$xx" badge.'),
    ('Open an order and settle the remaining balance', 'Order closes and leaves the live list.'),
    ('Switch between grid and list view', 'Both render cleanly, no sideways scroll.')],
   ['KOT / item counts are correct.', 'Cancel / void an order works (with reason).',
    'Bill preview opens and totals match POS.'],
   ['Closing an order here &rarr; revenue lands in Reports/EOD; table frees up in Tables (module 7).'])

module(6, 'Order History',
   'Past (completed/cancelled) orders.',
   'Sidebar &rarr; Order History.',
   [('Open Order History', 'Completed orders from your test session are listed.'),
    ('Filter by date / type / status; search an order number', 'Filters return the right rows.'),
    ('Open one order', 'Full detail: items, taxes, payments (incl. split/part), totals.')],
   ['Export / download (if present) produces a file.', 'Amounts in A$ and match what you charged.'],
   ['Every order you settled in POS/Running Orders must appear here with the correct payment breakdown.'])

module(7, 'Tables, Floor, Reservations &amp; QR',
   'Table layout, reservations and QR-code ordering.',
   'Sidebar &rarr; Tables / Reservations / QR Codes / QR Orders.',
   [('Open Tables', 'Tables created in onboarding are shown with correct status (free/occupied).'),
    ('Occupy a table via POS, then check Tables', 'That table shows occupied + linked to the order.'),
    ('Create a reservation', 'It saves and shows on the reservation list / calendar.'),
    ('Open QR Codes and generate / view a table QR', 'A QR image is produced; download works.')],
   ['Add / edit / delete a table works.', 'Table count matches onboarding.',
    'Reservation time/seats validation works.'],
   ['Paying a dine-in order &rarr; frees the table here.',
    'A QR order placed by a customer &rarr; should arrive in Running Orders + KDS.'])

module(8, 'Menu Management',
   'Categories, items, prices, availability.',
   'Sidebar &rarr; Menu.',
   [('Open Menu', 'Categories + items from onboarding are listed with A$ prices.'),
    ('Add a new category and a new item with a price', 'Both save and appear immediately.'),
    ('Edit an item price / name; toggle availability off', 'Changes save; unavailable item is marked.'),
    ('Delete a test item', 'It is removed (or soft-deleted) cleanly.')],
   ['Veg/non-veg tags, photos, variants, modifiers save.', 'Search & category filter work.',
    'No leftover hardcoded sample categories like "Combos"/"Main Menu" that you did not create.'],
   ['New item &rarr; appears in POS (module 3) immediately.',
    'Item marked unavailable / out of stock &rarr; shows on the 86 Board (module 13) and hides in POS.'])

module(9, 'Inventory, Purchase Orders &amp; Central Kitchen',
   'Stock levels, recipes, purchase orders, central kitchen transfers.',
   'Sidebar &rarr; Inventory / Purchase Orders / Central Kitchen.',
   [('Open Inventory', 'Stock items listed with current quantity + units.'),
    ('Note the stock of an ingredient used by a menu item', 'Write down the number.'),
    ('Place + pay an order in POS that uses that ingredient, come back', 'Stock has DECREASED by the recipe amount.'),
    ('Create a Purchase Order; receive it', 'Stock INCREASES; PO status updates.'),
    ('Trigger / view a low-stock alert', 'Alert shows when stock is below threshold.')],
   ['Add / edit stock item, set reorder level.', 'Central kitchen transfer between outlets (if multi-outlet).'],
   ['Selling items &rarr; auto-deducts here (recipe link).',
    'Stock hitting zero &rarr; that menu item appears on 86 Board (module 13).'])

module(10, 'Customers, CRM &amp; Loyalty',
   'Customer database, history and loyalty points.',
   'Sidebar &rarr; Customers / CRM.',
   [('Open Customers and add a new customer (name + phone)', 'Customer saves and appears in the list.'),
    ('In POS, attach this customer to an order and pay', 'Order is linked to the customer.'),
    ('Re-open the customer', 'Their order history + total spend updated; loyalty points earned (if enabled).'),
    ('Redeem loyalty points on a new POS order (if enabled)', 'Points reduce the bill; balance goes down.')],
   ['Search customer by phone/name.', 'Edit customer details saves.'],
   ['Customer attached in POS &rarr; shows here with correct spend & points.',
    'Loyalty redeemed in POS &rarr; balance updates here.'])

module(11, 'Discounts, Promo Codes &amp; Pricing',
   'Discounts, coupon codes and dynamic/festival pricing.',
   'Sidebar &rarr; Discounts / Promo Codes / Dynamic Pricing.',
   [('Create a promo code (e.g. 10% off)', 'It saves and is listed.'),
    ('Apply that code in POS', 'Discount applies correctly to the bill.'),
    ('Create a discount rule', 'Rule saves and can be toggled on/off.')],
   ['Expiry date / usage limit respected.', 'Invalid code is rejected in POS.'],
   ['Promo created here &rarr; usable in POS (module 3) and reflected in Reports.'])

module(12, 'Payments, Credit Notes &amp; Settlements',
   'Payment records, refunds/voids/credit notes, and end-of-day settlement.',
   'Sidebar &rarr; Payments / Credit Notes / Settlements.',
   [('Open Payments', 'All test payments listed (cash, eftpos, split, part) with A$ amounts.'),
    ('Create a Credit Note / void / refund on a paid order', 'It records and the order reflects it.'),
    ('Open Settlements and reconcile a day', 'Totals match the payments you took.')],
   ['Filter payments by method/date.', 'Refund reason captured.'],
   ['Every POS payment &rarr; appears here.', 'Settlement totals &rarr; match Reports/EOD (module 14).'])

module(13, 'Aggregators, Channels, 86 Board &amp; Own Delivery',
   'Food-delivery apps (Uber Eats / DoorDash / Menulog), channel pricing/analytics, item 86, own delivery.',
   'Sidebar &rarr; Aggregators / Channel Analytics / 86 Board / Own Delivery / Delivery Payouts.',
   [('Open Aggregators', 'AU platforms show: Uber Eats, DoorDash, Menulog (NOT Swiggy/Zomato).'),
    ('Use the "simulate order" (if available) for a platform', 'A test delivery order is created.'),
    ('Check KDS + Running Orders', 'The simulated order appears in BOTH automatically.'),
    ('Open 86 Board', 'Items in stock are available; mark one item "86" (out)'),
    ('Confirm in POS', 'The 86\'d item is hidden / blocked from ordering.'),
    ('Open Channel Analytics', 'Per-channel revenue / orders / commission breakdown shows.')],
   ['Per-channel menu price markup saves.', 'Own-delivery dispatch screen opens.',
    'Delivery Payouts / commission report loads.'],
   ['Aggregator order &rarr; KDS + Running Orders + Channel Analytics.',
    'Out-of-stock ingredient (module 9) &rarr; auto-86s the item here across channels.'])

module(14, 'Reports, Menu Analytics &amp; EOD',
   'Sales reports, item performance and end-of-day closing.',
   'Sidebar &rarr; Reports / Menu Analytics / EOD Report.',
   [('Open Reports', 'Sales totals, payment-method split, A$ amounts; date filter works.'),
    ('Compare revenue to what you charged today', 'Numbers MATCH your test orders.'),
    ('Open Menu Analytics', 'Best/worst sellers based on your test orders.'),
    ('Run the EOD Report / close the day', 'Cash, card, eftpos, split tenders are itemised and total correctly.')],
   ['Export to PDF/Excel works.', 'Empty date range shows "no data", not an error.'],
   ['Totals here &rarr; must equal Payments + Settlements + Dashboard for the same day. This is the big cross-check.'])

module(15, 'Staff, Rostering &amp; Staff Management',
   'Staff accounts, roles, PINs, rosters.',
   'Sidebar &rarr; Staff / Staff Management / Rostering.',
   [('Open Staff', 'Staff created in onboarding are listed with their roles.'),
    ('Add a staff member (name, role, PIN)', 'Saves and appears.'),
    ('Create a roster / shift', 'Shift saves on the calendar.'),
    ('Edit a role / permission (if available)', 'Change is saved.')],
   ['PIN is required and validated.', 'Deactivate staff works.'],
   ['Staff added &rarr; can be assigned to orders in POS; appears in performance in Reports.'])

module(16, 'Accounting, Payroll, Assets, Budgets, GST &amp; BAS (Australia)',
   'AU finance suite: ledger, payroll, fixed assets, budgets, invoices, GST/BAS, Xero.',
   'Sidebar &rarr; Accounting / Payroll / Fixed Assets / Budgets / Invoices / GST &amp; BAS.',
   [('Open Accounting', 'Ledger / financial statements load in A$.'),
    ('Open GST &amp; BAS', 'GST is 10%; BAS figures compute from your test sales.'),
    ('Open Payroll', 'Pay run / employees screen loads.'),
    ('Open Invoices and create a customer invoice', 'Invoice saves with GST line; PDF/preview works.'),
    ('Open Budgets / Fixed Assets', 'Each screen loads and lets you add an entry.')],
   ['Xero connect button (AU Integrations) opens the auth flow.', 'Numbers are A$ with correct GST.'],
   ['Sales/payments &rarr; flow into ledger, GST and BAS figures.'])

module(17, 'Settings (all tabs)',
   'Outlet preferences, tax, hardware, payments, etc. Confirm SAVING actually works.',
   'Sidebar &rarr; Settings.',
   [('Open Settings &rarr; General; change Restaurant Name; click Save Settings', 'Success toast; reload the page — the change PERSISTS (not lost).'),
    ('Tax &amp; GST tab: confirm ABN/ACN fields (AU), GST 10%; edit + save', 'Saves and persists.'),
    ('Payment tab: AU methods (Cash/EFTPOS/Card); toggle one; save', 'Persists; reflects in POS payment options.'),
    ('Hardware tab: toggle Cash Drawer / Barcode / Scale; save', 'Each toggle persists after reload.'),
    ('Voice POS tab: change language/options; save', 'Persists after reload.'),
    ('Appearance: change brand colour / logo (owner); save', 'Colour applies live; logo updates.'),
    ('Security tab (owner only): change password using current + new', 'Success; sign out and log in with the NEW password works.')],
   ['NO red "No head office linked" error anywhere.', 'Receipt printer / KDS tabs save.',
    'Every tab\'s "Save" shows success and survives a refresh.'],
   ['Payment methods set here &rarr; show in POS.', 'Brand colour &rarr; applies across the app.',
    'New password &rarr; used at next login.'])

module(18, 'Integrations, Subscription &amp; Billing',
   'Third-party integrations and the SaaS subscription/billing for this restaurant.',
   'Sidebar &rarr; Integrations / AU Integrations / Subscription / Billing.',
   [('Open Integrations / AU Integrations', 'Integration cards load (Square, Xero, etc.); connect buttons work.'),
    ('Open Subscription / Billing', 'Current plan, usage and invoices show in A$.'),
    ('View / download a billing invoice', 'Opens / downloads correctly.')],
   ['Plan limits shown.', 'No broken images / placeholder logos.'],
   ['Usage (orders this month) &rarr; should match what you generated while testing.'])

# ============================ END-TO-END ============================
P('19. End-to-End Interlinking Flows (do these LAST)', 'H1')
P('These prove the modules talk to each other. Do each flow fully and tick it. '
  'If a number does not match at the end, log it as <b>High</b> or <b>Critical</b>.')
sp(4)
flows = [
 ('Flow A — Full dine-in lifecycle',
  '1) Menu: add item "TEST BURGER A$15".  2) POS: open a table, add TEST BURGER x2, send KOT.  '
  '3) KDS: see the ticket, mark Ready.  4) Running Orders: see it open, settle by SPLIT bill.  '
  '5) Tables: table is now free.  6) Inventory: burger ingredients went down.  '
  '7) Reports + Dashboard + EOD: revenue went up by A$30 (+GST) and order count +1.'),
 ('Flow B — Partial payment',
  '1) POS: order A$50, pay A$20 cash (part).  2) Running Orders: shows "Partial · Bal A$30".  '
  '3) Re-open, pay A$30.  4) Order closes; Reports shows the full A$50 once, split into two tenders on the receipt.'),
 ('Flow C — Aggregator order',
  '1) Aggregators: simulate an Uber Eats order.  2) KDS: it appears.  3) Running Orders: it appears.  '
  '4) Channel Analytics: Uber Eats revenue + commission updated.'),
 ('Flow D — Auto-86 from stock',
  '1) Inventory: set one ingredient to 0 (or sell until 0).  2) 86 Board: the linked menu item shows "out".  '
  '3) POS: that item is blocked/hidden.'),
 ('Flow E — Settings drives POS',
  '1) Settings: turn a payment method off, Save.  2) POS: that method no longer appears at PAY.  '
  '3) Turn it back on; it reappears.'),
 ('Flow F — Customer + loyalty',
  '1) Customers: add a customer.  2) POS: attach them, complete a paid order.  '
  '3) Customer profile: spend + points updated.  4) Next POS order: redeem points, bill reduces.'),
]
data=[[Paragraph('<b>Flow</b>',styles['CellHdr']),Paragraph('<b>Steps &amp; what to confirm</b>',styles['CellHdr']),
       Paragraph('<b>Pass</b>',styles['CellHdr']),Paragraph('<b>Fail</b>',styles['CellHdr'])]]
for name, body in flows:
    data.append([Paragraph(f'<b>{name}</b>', styles['Cell']), Paragraph(body, styles['Cell']),
                 Paragraph('&#9744;',styles['Cell']), Paragraph('&#9744;',styles['Cell'])])
t=Table(data, colWidths=[34*mm, 120*mm, 11*mm, 11*mm], repeatRows=1)
t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),GREEN),('GRID',(0,0),(-1,-1),0.4,BORDER),
    ('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),
    ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
    ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('ALIGN',(2,0),(3,-1),'CENTER')]))
story.append(t)
story.append(PageBreak())

# ============================ LAUNCH DECISION ============================
P('20. Launch Decision (fill in at the end)', 'H1')
P('After all modules + flows are done, summarise from your bug log:')
sp(4)
summ=[['Total tests passed',''],['Critical bugs (must be 0 to launch)',''],['High bugs',''],
      ['Medium bugs',''],['Low bugs',''],['Modules fully working',''],['Modules with problems','']]
t=Table([[Paragraph(f'<b>{k}</b>',styles['Cell']),Paragraph('______',styles['Cell'])] for k,_ in summ],
        colWidths=[110*mm,60*mm])
t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.4,BORDER),('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white,LIGHT]),
    ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),6)]))
story.append(t); sp(10)
P('Go / No-Go rule', 'H2')
story.append(ListFlowable([
  ListItem(Paragraph('<font color="#16a34a"><b>GO (ready to launch):</b></font> 0 Critical and 0 High bugs; all End-to-End flows A–F pass.', styles['Body'])),
  ListItem(Paragraph('<font color="#b45309"><b>CONDITIONAL:</b></font> 0 Critical, a few High — launch only after those High bugs are fixed & retested.', styles['Body'])),
  ListItem(Paragraph('<font color="#dc2626"><b>NO-GO:</b></font> any Critical bug, or any End-to-End flow fails. Fix, then re-test from that module.', styles['Body'])),
], bulletType='bullet', start='square', bulletColor=NAVY))
sp(12)
P('Tester signature: ____________________     Date: __________     Decision (GO / CONDITIONAL / NO-GO): __________', 'Body')

# ---- footer with page numbers ----
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5); canvas.setFillColor(GREY)
    canvas.drawString(15*mm, 10*mm, 'MS-RM / PetPooja — Owner Frontend Test Plan (Australia)')
    canvas.drawRightString(195*mm, 10*mm, f'Page {doc.page}')
    canvas.setStrokeColor(BORDER); canvas.line(15*mm, 12*mm, 195*mm, 12*mm)
    canvas.restoreState()

doc = SimpleDocTemplate('/Users/sunnythakur/Desktop/PetPooja/test-docs/MS-RM_Frontend_Test_Plan_AU.pdf',
                        pagesize=A4, topMargin=16*mm, bottomMargin=16*mm, leftMargin=15*mm, rightMargin=15*mm,
                        title='MS-RM Frontend Test Plan (AU Owner)', author='MS-RM')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('PDF written')
