/**
 * @fileoverview Billing hooks — fetch REAL open (unpaid) orders and settle them
 * against the deployed backend. No demo/mock data, no client-side order creation.
 *
 * Money-flow contract (confirmed against backend/src/modules/orders):
 *   • GET  /orders?status=...            → sendPaginated → { data: [order], meta }
 *       Each order carries order_items[], subtotal, discount_amount, cgst, sgst,
 *       igst, total_tax, round_off, grand_total, is_paid, status, payments[].
 *   • POST /orders/:id/bill              → generateBillSchema (body {} ok) → billed order
 *   • POST /orders/:id/payment           → processPaymentSchema { method, amount }
 *       processPayment RECONCILES `amount` against (grand_total − prior successful
 *       tenders) within ±1, then flips is_paid=true / status='paid'. We must send the
 *       BACKEND grand_total (owed balance), never a client-recomputed total.
 *
 * All new billing/payment hooks live here (useApi.js is intentionally untouched).
 * @module hooks/useBilling
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export const BILLING_KEYS = {
  openOrders: (outletId) => ['billing', 'open-orders', outletId || 'none'],
};

// order.status flows: created → confirmed → ready → billed → paid. Anything before
// 'paid' (and not cancelled/voided) is an open bill we can settle. We also request
// a couple of KOT-derived statuses defensively; unknown values simply match nothing.
const OPEN_STATUSES = 'created,confirmed,preparing,ready,served,billed';

// UI payment modes → backend processPaymentSchema `method` enum.
const METHOD_MAP = {
  cash: 'cash',
  card: 'card',
  upi: 'upi',
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round((num(v) + Number.EPSILON) * 100) / 100;
}

/** Sum of already-tendered successful payments on an order (partial/split bills). */
function paidSoFar(payments) {
  if (!Array.isArray(payments)) return 0;
  return round2(
    payments
      .filter((p) => p && p.status === 'success')
      .reduce((s, p) => s + num(p.amount), 0)
  );
}

/**
 * Normalizes a raw backend order into the shape the billing UI renders.
 * Reads items + totals straight from the order — never from a cached table row.
 */
export function normalizeOpenOrder(o) {
  if (!o || typeof o !== 'object') return null;
  const rawItems = Array.isArray(o.order_items) ? o.order_items : [];
  const payments = Array.isArray(o.payments) ? o.payments : [];
  const alreadyPaid = paidSoFar(payments);
  const grandTotal = round2(o.grand_total);
  return {
    id: o.id,
    orderNumber: o.order_number || (o.id ? String(o.id).slice(-6).toUpperCase() : ''),
    status: o.status || 'created',
    isPaid: !!o.is_paid,
    orderType: o.order_type || 'dine_in',
    tableId: o.table_id || o.table?.id || null,
    tableNumber: o.table?.table_number ?? null,
    waiter: o.staff?.full_name || '',
    customerName: o.customer?.full_name || o.customer_name || '',
    createdAt: o.created_at || null,
    invoiceNumber: o.invoice_number || null,
    items: rawItems.map((it) => ({
      id: it.id,
      name: it.name || it.item_name || 'Item',
      qty: num(it.quantity),
      price: num(it.unit_price),
      total: round2(it.item_total != null ? it.item_total : num(it.quantity) * num(it.unit_price)),
    })),
    subtotal: round2(o.subtotal),
    discount: round2(o.discount_amount),
    cgst: round2(o.cgst),
    sgst: round2(o.sgst),
    igst: round2(o.igst),
    tax: round2(o.total_tax != null ? o.total_tax : num(o.cgst) + num(o.sgst) + num(o.igst)),
    roundOff: round2(o.round_off),
    grandTotal,
    alreadyPaid,
    // Balance the backend will expect on the closing payment.
    balanceDue: round2(grandTotal - alreadyPaid),
    payments,
    raw: o,
  };
}

/**
 * Fetches REAL open/unpaid orders for the outlet (source of truth for billing).
 * Returns normalized bills carrying their own items + totals.
 */
export function useOpenOrders(outletId) {
  return useQuery({
    queryKey: BILLING_KEYS.openOrders(outletId),
    enabled: !!outletId,
    queryFn: async () => {
      const res = await api.get('/orders', {
        params: {
          outlet_id: outletId,
          status: OPEN_STATUSES,
          limit: 100,
          sort: 'created_at',
          order: 'asc',
        },
      });
      // api interceptor returns the envelope: { success, data: [...], meta }.
      const list = res?.data ?? res;
      return Array.isArray(list) ? list : [];
    },
    select: (list) =>
      (Array.isArray(list) ? list : [])
        .map(normalizeOpenOrder)
        .filter((o) => o && !o.isPaid),
    staleTime: 10 * 1000,
    refetchOnMount: true,
  });
}

/**
 * Settles a REAL open order: (optionally) generates a bill, then records the
 * payment for the outstanding balance. NEVER creates a new order.
 *
 * mutate({ order, method }) — order is a normalized open order; method is a UI
 * mode ('cash' | 'card' | 'upi').
 */
export function useSettleOrder(outletId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ order, method }) => {
      if (!order?.id) throw new Error('No order to settle');
      const orderId = order.id;
      const backendMethod = METHOD_MAP[method] || 'cash';

      // 1) Ensure the order has an invoice (billed) before recording payment.
      //    Skip if already billed with an invoice number. generateBill is a no-op
      //    in that case; a benign failure here must not block the payment, which
      //    is the real source of truth for "paid".
      if (order.status !== 'billed' || !order.invoiceNumber) {
        try {
          await api.post(`/orders/${orderId}/bill`, {});
        } catch (e) {
          const msg = e?.response?.data?.message || e?.message || '';
          // Only a truly terminal state (already paid) should abort — re-throw it.
          if (/already paid/i.test(msg)) throw e;
          // otherwise proceed to payment (order may already be billed).
        }
      }

      // 2) Record the payment for the outstanding balance. Must equal the backend
      //    grand_total minus any prior tenders, or processPayment rejects it.
      const amount = round2(order.balanceDue > 0 ? order.balanceDue : order.grandTotal);
      const res = await api.post(`/orders/${orderId}/payment`, {
        method: backendMethod,
        amount,
      });
      // res envelope: { data: { payment, order: { is_paid:true, status:'paid', ... } } }
      return res?.data ?? res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BILLING_KEYS.openOrders(outletId) });
    },
  });
}
