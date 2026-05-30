/**
 * TaxBreakdownPanel — Inline tax preview panel for the POS cart sidebar.
 * India: CGST + SGST split | Australia: GST-inclusive display
 * Debounces cart changes by 800ms before fetching to avoid excessive API calls.
 */
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';
import { ChevronDown, ChevronUp, Receipt, Loader2 } from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function buildQueryItems(cartItems) {
  return cartItems.map((ci) => ({
    menu_item_id: ci.menu_item_id,
    quantity:     ci.quantity,
    unit_price:   ci.variant_price ?? ci.unit_price ?? 0,
    gst_rate:     ci.gst_rate ?? 0,
  }));
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function TaxBreakdownPanel({
  outletId,
  cartItems = [],
  subtotal  = 0,
  discount  = null,
  isAU      = false,
  isVisible = true,
}) {
  const { format, symbol } = useCurrency();

  /* 800ms debounce on cartItems so the query key only updates after typing stops */
  const [debouncedItems, setDebouncedItems] = useState(() => buildQueryItems(cartItems));
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedItems(buildQueryItems(cartItems));
    }, 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [JSON.stringify(cartItems)]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasItems = debouncedItems.length > 0;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tax-preview', outletId, JSON.stringify(debouncedItems), isAU ? 'AU' : 'IN'],
    queryFn: async () => {
      const { data } = await api.get('/orders/tax-preview', {
        params: {
          outlet_id:    outletId,
          items:        encodeURIComponent(JSON.stringify(debouncedItems)),
          country_code: isAU ? 'AU' : 'IN',
        },
      });
      return data;
    },
    enabled:         !!outletId && hasItems,
    staleTime:       30_000,
    refetchOnWindowFocus: false,
  });

  /* ── render ──────────────────────────────────────────────────────────── */

  if (!isVisible) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-hover)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          borderBottom: '1px solid var(--border)',
          background:   'var(--bg-card)',
        }}
      >
        <Receipt size={13} style={{ color: 'var(--text-secondary)' }} />
        <span className="text-xs font-bold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
          Tax Breakdown
        </span>
        {isLoading && hasItems && (
          <Loader2 size={11} className="ml-auto animate-spin" style={{ color: 'var(--text-secondary)' }} />
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-1.5">

        {/* Empty state */}
        {!hasItems && (
          <p className="text-xs py-1 text-center" style={{ color: 'var(--text-secondary)' }}>
            Add items to see tax breakdown
          </p>
        )}

        {/* Loading */}
        {hasItems && isLoading && (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Calculating tax…</span>
          </div>
        )}

        {/* Error */}
        {hasItems && !isLoading && isError && (
          <p className="text-xs py-1 text-center" style={{ color: 'var(--danger)' }}>
            Tax calculation unavailable
          </p>
        )}

        {/* Success — India */}
        {hasItems && !isLoading && !isError && data && !isAU && (
          <TaxRowsIN data={data} format={format} subtotal={subtotal} discount={discount} />
        )}

        {/* Success — Australia */}
        {hasItems && !isLoading && !isError && data && isAU && (
          <TaxRowsAU data={data} format={format} subtotal={subtotal} discount={discount} symbol={symbol} />
        )}
      </div>
    </div>
  );
}

/* ─── India: CGST + SGST ─────────────────────────────────────────────────── */

function TaxRowsIN({ data, format, subtotal, discount }) {
  const taxLines   = data?.tax_lines  ?? [];
  const totalTax   = data?.total_tax  ?? 0;
  const taxable    = data?.taxable_amount ?? subtotal;
  const grandTotal = data?.grand_total    ?? (subtotal + totalTax);

  /* Flatten CGST / SGST pairs from tax_lines, or derive from totals */
  const cgst = data?.cgst ?? totalTax / 2;
  const sgst = data?.sgst ?? totalTax / 2;

  /* Collect unique rates for display */
  const rateMap = {};
  taxLines.forEach((line) => {
    const rate = line.gst_rate ?? 0;
    if (!rateMap[rate]) rateMap[rate] = { cgst: 0, sgst: 0 };
    rateMap[rate].cgst += (line.cgst ?? line.tax / 2 ?? 0);
    rateMap[rate].sgst += (line.sgst ?? line.tax / 2 ?? 0);
  });

  const rates = Object.keys(rateMap).map(Number);

  return (
    <>
      {rates.length > 0
        ? rates.map((rate) => (
            <div key={rate} className="flex flex-col gap-1">
              <TaxRow label={`CGST (${rate / 2}%)`}  value={format(rateMap[rate].cgst)} />
              <TaxRow label={`SGST (${rate / 2}%)`}  value={format(rateMap[rate].sgst)} />
            </div>
          ))
        : (
            <>
              <TaxRow label={`CGST`} value={format(cgst)} />
              <TaxRow label={`SGST`} value={format(sgst)} />
            </>
          )
      }

      <TaxRow label="Total Tax" value={format(totalTax)} bold />
      <Divider />
      <TaxRow label="Taxable Amount" value={format(taxable)} muted />
      {discount && <DiscountRow discount={discount} format={format} />}
      <TaxRow label="Grand Total" value={format(grandTotal)} bold accent />
    </>
  );
}

/* ─── Australia: GST inclusive ───────────────────────────────────────────── */

function TaxRowsAU({ data, format, subtotal, discount, symbol }) {
  const totalTax   = data?.total_tax    ?? 0;
  const taxable    = data?.taxable_amount ?? subtotal;
  const grandTotal = data?.grand_total    ?? subtotal;
  const gstRate    = data?.gst_rate       ?? 10;

  return (
    <>
      <TaxRow label={`GST (${gstRate}% incl.)`} value={format(totalTax)} />
      <Divider />
      <TaxRow label="Taxable Amount"  value={format(taxable)}    muted />
      {discount && <DiscountRow discount={discount} format={format} />}
      <TaxRow label="Grand Total"     value={format(grandTotal)} bold accent />
    </>
  );
}

/* ─── Shared row atoms ───────────────────────────────────────────────────── */

function TaxRow({ label, value, bold = false, muted = false, accent = false }) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="text-xs"
        style={{
          color:      muted ? 'var(--text-secondary)' : 'var(--text-secondary)',
          fontWeight: bold ? 600 : 400,
        }}
      >
        {label}
      </span>
      <span
        className="text-xs font-mono tabular-nums"
        style={{
          color:      accent ? 'var(--accent)' : bold ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: bold ? 700 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div
      className="my-1"
      style={{
        borderTop:  '1px dashed var(--border)',
        opacity:    0.8,
      }}
    />
  );
}

function DiscountRow({ discount, format }) {
  if (!discount) return null;
  const label = discount.type === 'percent'
    ? `Discount (${discount.value}%)`
    : 'Discount';
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: 'var(--success)' }}>{label}</span>
      <span className="text-xs font-mono tabular-nums font-medium" style={{ color: 'var(--success)' }}>
        − {format(discount.computed ?? 0)}
      </span>
    </div>
  );
}
