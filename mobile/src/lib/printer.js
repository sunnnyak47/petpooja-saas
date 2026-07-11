/**
 * Printer abstraction for PetPooja mobile.
 *
 * Strategy:
 *  - `expo-print` for PDF/HTML print (works on iOS & Android, no native rebuild)
 *  - Bluetooth stub with graceful degradation
 *  - Printer settings stored in AsyncStorage under key 'printer_settings'
 */
import * as Print from 'expo-print';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'printer_settings';

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getPrinterSettings() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw
      ? JSON.parse(raw)
      : { enabled: false, type: 'none', device: null, autoPrintKot: false };
  } catch {
    return { enabled: false, type: 'none', device: null, autoPrintKot: false };
  }
}

export async function savePrinterSettings(settings) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ─── HTML Templates ──────────────────────────────────────────────────────────

export function buildKotHtml({ table, orderType, items, notes, outletName, orderId }) {
  const itemsHtml = items
    .map(
      (item) =>
        `<tr>
      <td class="qty">${item.qty}x</td>
      <td class="name">${item.name}${item.variant ? ` (${item.variant})` : ''}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 14px; padding: 12px; width: 300px; }
  .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .outlet { font-size: 16px; font-weight: bold; }
  .kot-title { font-size: 20px; font-weight: bold; margin: 4px 0; }
  .meta { font-size: 12px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .qty { width: 32px; font-weight: bold; }
  .name { font-size: 15px; padding: 3px 0; }
  .notes { border-top: 1px dashed #000; margin-top: 8px; padding-top: 6px; font-style: italic; font-size: 12px; }
  .footer { text-align: center; font-size: 11px; margin-top: 10px; color: #888; }
</style>
</head>
<body>
  <div class="header">
    <div class="outlet">${outletName || 'Kitchen Order'}</div>
    <div class="kot-title">*** KOT ***</div>
    <div class="meta">${table ? `Table: ${table}` : orderType || 'Takeaway'} &nbsp;|&nbsp; ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
    ${orderId ? `<div class="meta">Order #${orderId}</div>` : ''}
  </div>
  <table>
    ${itemsHtml}
  </table>
  ${notes ? `<div class="notes">Note: ${notes}</div>` : ''}
  <div class="footer">${new Date().toLocaleString('en-IN')}</div>
</body>
</html>`;
}

export function buildReceiptHtml({
  outletName,
  outletAddress,
  outletPhone,
  outletGstin,
  table,
  orderType,
  items,
  subtotal,
  tax,
  discount,
  total,
  paymentMode,
  orderId,
  customerName,
  // Region-aware receipt fields (default to India so existing callers are unchanged).
  // An AU caller passes currencySymbol:'$', locale:'en-AU', taxIdLabel:'ABN', taxLabel:'GST'.
  currencySymbol = '₹',
  locale = 'en-IN',
  taxIdLabel = 'GSTIN',
  taxLabel = 'Tax (GST)',
}) {
  const itemsHtml = items
    .map(
      (item) =>
        `<tr>
      <td>${item.name}${item.variant ? ` (${item.variant})` : ''} x${item.qty}</td>
      <td class="right">${currencySymbol}${(item.price * item.qty).toLocaleString(locale)}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; padding: 12px; width: 300px; }
  .header { text-align: center; padding-bottom: 8px; border-bottom: 1px dashed #000; margin-bottom: 8px; }
  .outlet { font-size: 17px; font-weight: bold; }
  .sub { font-size: 11px; color: #444; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  .right { text-align: right; white-space: nowrap; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .total-row td { font-weight: bold; font-size: 15px; }
  .footer { text-align: center; font-size: 11px; margin-top: 10px; color: #666; }
</style>
</head>
<body>
  <div class="header">
    <div class="outlet">${outletName || 'Restaurant'}</div>
    <div class="sub">${outletAddress || ''}</div>
    ${outletPhone ? `<div class="sub">Tel: ${outletPhone}</div>` : ''}
    ${outletGstin ? `<div class="sub">${taxIdLabel}: ${outletGstin}</div>` : ''}
  </div>
  <div class="sub" style="margin-bottom:6px">
    ${orderId ? `Bill #${orderId} &nbsp;` : ''}${table ? `Table: ${table} &nbsp;` : ''}${orderType || ''}
    ${customerName ? `<br>Customer: ${customerName}` : ''}
  </div>
  <table>
    <tr><td colspan="2" class="divider"></td></tr>
    ${itemsHtml}
    <tr><td colspan="2" class="divider"></td></tr>
    <tr><td>Subtotal</td><td class="right">${currencySymbol}${subtotal?.toLocaleString(locale) || 0}</td></tr>
    ${tax ? `<tr><td>${taxLabel}</td><td class="right">${currencySymbol}${tax.toLocaleString(locale)}</td></tr>` : ''}
    ${discount ? `<tr><td>Discount</td><td class="right">-${currencySymbol}${discount.toLocaleString(locale)}</td></tr>` : ''}
    <tr><td colspan="2" class="divider"></td></tr>
    <tr class="total-row"><td>TOTAL</td><td class="right">${currencySymbol}${total?.toLocaleString(locale) || 0}</td></tr>
    <tr><td colspan="2" style="height:4px"></td></tr>
    <tr><td>Payment</td><td class="right">${paymentMode || 'Cash'}</td></tr>
  </table>
  <div class="footer">
    <div>Thank you for visiting!</div>
    <div>${new Date().toLocaleString(locale)}</div>
    <div style="margin-top:4px">Powered by MS-RM</div>
  </div>
</body>
</html>`;
}

// ─── Print functions ─────────────────────────────────────────────────────────

export async function printKot(data) {
  try {
    const html = buildKotHtml(data);
    const settings = await getPrinterSettings();

    if (settings.type === 'airprint' || settings.type === 'none') {
      // Use system print dialog (AirPrint / Google Cloud Print)
      await Print.printAsync({ html });
      return { success: true, method: 'airprint' };
    }

    // Bluetooth stub — in future replace with actual BLE printer SDK
    console.log('[Printer] Bluetooth print KOT:', data.orderId);
    return { success: true, method: 'bluetooth_stub' };
  } catch (err) {
    console.warn('[Printer] KOT print failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function printReceipt(data) {
  try {
    const html = buildReceiptHtml(data);
    const settings = await getPrinterSettings();

    if (settings.type === 'airprint' || settings.type === 'none') {
      await Print.printAsync({ html });
      return { success: true, method: 'airprint' };
    }

    console.log('[Printer] Bluetooth print receipt:', data.orderId);
    return { success: true, method: 'bluetooth_stub' };
  } catch (err) {
    console.warn('[Printer] Receipt print failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Bluetooth device discovery (stub) ───────────────────────────────────────

export async function discoverBluetoothPrinters() {
  // Stub — returns mock devices for UI demo
  // In production, replace with react-native-ble-plx scan
  return [
    { id: 'mock_1', name: 'EPSON TM-T82', address: '00:11:22:33:44:55', rssi: -60 },
    { id: 'mock_2', name: 'Generic Printer', address: 'AA:BB:CC:DD:EE:FF', rssi: -75 },
  ];
}
