import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import {
  Truck, MapPin, Phone, User, Clock, ExternalLink,
  XCircle, PackageCheck, Bike, Loader2, RefreshCw,
} from 'lucide-react';

const PROVIDERS = [
  { id: 'uber_direct', name: 'Uber Direct' },
  { id: 'doordash_drive', name: 'DoorDash Drive' },
];

const STATUS_STYLES = {
  quote:     'bg-surface-700 text-surface-300',
  created:   'bg-blue-500/20 text-blue-400',
  pickup:    'bg-amber-500/20 text-amber-400',
  dropoff:   'bg-purple-500/20 text-purple-400',
  delivered: 'bg-emerald-500/20 text-emerald-400',
  canceled:  'bg-surface-600 text-surface-400',
  failed:    'bg-red-500/20 text-red-400',
};

const PROVIDER_LABEL = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.name]));

/**
 * Own-Delivery Dispatch — request a courier (Uber Direct / DoorDash Drive) for
 * the restaurant's own orders: quote → create → track → cancel.
 */
export default function DeliveryDispatchPage() {
  const { user } = useSelector((s) => s.auth);
  const { format } = useCurrency();
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    provider: 'uber_direct',
    dropoff_name: '',
    dropoff_phone: '',
    dropoff_address: '',
    pickup_name: '',
    pickup_address: '',
  });
  const [quote, setQuote] = useState(null);

  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Any change to provider/dropoff invalidates a prior quote.
    if (['provider', 'dropoff_address'].includes(k)) setQuote(null);
  };

  const { data: dispatches, isLoading } = useQuery({
    queryKey: ['delivery-dispatches', outletId],
    queryFn: () => api.get(`/delivery?outlet_id=${outletId}&limit=100`).then((r) => r.data || []),
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  const quoteMutation = useMutation({
    mutationFn: () => api.post('/delivery/quote', {
      outlet_id: outletId,
      provider: form.provider,
      dropoff_address: form.dropoff_address,
    }).then((r) => r.data),
    onSuccess: (data) => {
      setQuote(data);
      toast.success(`Quote: ${format(data.fee)} · ${data.eta_minutes} min`);
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/delivery', {
      outlet_id: outletId,
      provider: form.provider,
      dropoff_name: form.dropoff_name,
      dropoff_phone: form.dropoff_phone,
      dropoff_address: form.dropoff_address,
      pickup_name: form.pickup_name || undefined,
      pickup_address: form.pickup_address || undefined,
      fee: quote?.fee,
      currency: quote?.currency,
      quote_id: quote?.quote_id,
    }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-dispatches'] });
      toast.success('Delivery requested');
      setQuote(null);
      setForm((f) => ({ ...f, dropoff_name: '', dropoff_phone: '', dropoff_address: '' }));
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => api.post(`/delivery/${id}/cancel`, { outlet_id: outletId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-dispatches'] });
      toast.success('Delivery canceled');
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message),
  });

  const canQuote = form.provider && form.dropoff_address.trim().length >= 3;
  const canCreate = canQuote && form.dropoff_name.trim() && form.dropoff_phone.trim().length >= 5;

  const rows = useMemo(() => (Array.isArray(dispatches) ? dispatches : []), [dispatches]);
  const active = rows.filter((d) => !['delivered', 'canceled', 'failed'].includes(d.status)).length;

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Truck className="w-7 h-7 text-brand-400" />
            Own Delivery
          </h1>
          <p className="text-sm text-surface-400 mt-1">
            Dispatch a courier for your own orders via Uber Direct or DoorDash Drive
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-surface-400">
          <Bike className="w-4 h-4" /> {active} active
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Request form */}
        <div className="lg:col-span-1 bg-surface-900 rounded-2xl border border-surface-800 p-5 space-y-4 h-fit">
          <h2 className="text-sm font-bold uppercase tracking-wider text-surface-300">Request Delivery</h2>

          <div>
            <label className="text-xs text-surface-400 font-bold uppercase tracking-wider">Provider</label>
            <div className="flex gap-2 mt-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setField('provider', p.id)}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    form.provider === p.id
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-surface-800 text-surface-400 hover:text-white'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <Field icon={<User className="w-4 h-4" />} label="Customer name">
            <input className="input w-full" value={form.dropoff_name}
              onChange={(e) => setField('dropoff_name', e.target.value)} placeholder="Jane Doe" />
          </Field>

          <Field icon={<Phone className="w-4 h-4" />} label="Customer phone">
            <input className="input w-full" value={form.dropoff_phone}
              onChange={(e) => setField('dropoff_phone', e.target.value)} placeholder="+61 4xx xxx xxx" />
          </Field>

          <Field icon={<MapPin className="w-4 h-4" />} label="Dropoff address">
            <textarea className="input w-full resize-none" rows={2} value={form.dropoff_address}
              onChange={(e) => setField('dropoff_address', e.target.value)} placeholder="123 Smith St, Melbourne VIC" />
          </Field>

          <details className="text-xs text-surface-400">
            <summary className="cursor-pointer select-none">Pickup override (optional)</summary>
            <div className="mt-2 space-y-2">
              <input className="input w-full" value={form.pickup_name}
                onChange={(e) => setField('pickup_name', e.target.value)} placeholder="Pickup name" />
              <input className="input w-full" value={form.pickup_address}
                onChange={(e) => setField('pickup_address', e.target.value)} placeholder="Pickup address" />
            </div>
          </details>

          {/* Quote result */}
          {quote && (
            <div className="bg-surface-800/60 rounded-xl p-3 border border-surface-700 flex items-center justify-between">
              <div>
                <p className="text-xs text-surface-400">Estimated fee</p>
                <p className="text-xl font-black text-brand-400">{format(quote.fee)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-surface-400 flex items-center gap-1 justify-end">
                  <Clock className="w-3 h-3" /> ETA
                </p>
                <p className="text-sm font-bold text-white">{quote.eta_minutes} min</p>
                {quote.simulated && (
                  <span className="text-[10px] text-amber-400 uppercase tracking-wider">simulated</span>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => quoteMutation.mutate()}
              disabled={!canQuote || quoteMutation.isPending}
              className="flex-1 btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {quoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Get Quote
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!canCreate || createMutation.isPending}
              className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
              Request
            </button>
          </div>
        </div>

        {/* Dispatch list */}
        <div className="lg:col-span-2 bg-surface-900 rounded-2xl border border-surface-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-800 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-surface-300">Dispatches</h2>
            <span className="text-xs text-surface-500">{rows.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-surface-400 uppercase tracking-wider border-b border-surface-800">
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Dropoff</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Fee</th>
                  <th className="px-4 py-3 text-center">Track</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/50">
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-surface-500">Loading dispatches...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-surface-500">No deliveries dispatched yet</td></tr>
                ) : rows.map((d) => {
                  const cancellable = !['delivered', 'canceled', 'failed'].includes(d.status);
                  return (
                    <tr key={d.id} className="hover:bg-surface-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-white">{PROVIDER_LABEL[d.provider] || d.provider}</span>
                        {d.courier_name && (
                          <p className="text-xs text-surface-400 mt-0.5 flex items-center gap-1">
                            <Bike className="w-3 h-3" /> {d.courier_name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-surface-200">{d.dropoff_name || '—'}</p>
                        <p className="text-xs text-surface-500 truncate max-w-[220px]">{d.dropoff_address}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-bold capitalize ${STATUS_STYLES[d.status] || 'bg-surface-700 text-surface-300'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-brand-400">{format(d.fee)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.tracking_url ? (
                          <a href={d.tracking_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex p-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-all" title="Track">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        ) : <span className="text-surface-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => cancelMutation.mutate(d.id)}
                          disabled={!cancellable || cancelMutation.isPending}
                          className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Cancel"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small labeled field wrapper with a leading icon. */
function Field({ icon, label, children }) {
  return (
    <div>
      <label className="text-xs text-surface-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
        <span className="text-surface-500">{icon}</span> {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
