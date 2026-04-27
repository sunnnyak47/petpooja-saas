import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, ArrowRight, X, Globe, Star, RefreshCw, ExternalLink, MessageSquare, TrendingUp } from 'lucide-react';

const INTEGRATIONS_META = {
  xero: {
    name: 'Xero',
    description: 'Cloud accounting — export invoices, manage P&L, BAS reports',
    logo: '💼',
    color: '#13B5EA',
    fields: [
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'Xero App Client ID' },
      { key: 'client_secret', label: 'Client Secret', type: 'password', placeholder: 'Xero App Client Secret' },
      { key: 'org_name', label: 'Organisation Name', type: 'text', placeholder: 'e.g. The Corner Café Pty Ltd' },
    ],
  },
  square: {
    name: 'Square',
    description: 'Card & contactless payments — process, reconcile, track fees',
    logo: '🟦',
    color: '#000000',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'Square Access Token' },
      { key: 'merchant_name', label: 'Merchant Name', type: 'text', placeholder: 'Your Square merchant name' },
      { key: 'location_id', label: 'Location ID', type: 'text', placeholder: 'Square Location ID' },
    ],
  },
  myob: {
    name: 'MYOB',
    description: 'Australian accounting & payroll — export sales, bills, tax',
    logo: '📊',
    color: '#7B2FBE',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'MYOB API Key' },
      { key: 'company_file_id', label: 'Company File ID', type: 'text', placeholder: 'MYOB Company File ID' },
      { key: 'company_name', label: 'Company Name', type: 'text', placeholder: 'e.g. Aussie Bistro Pty Ltd' },
    ],
  },
  google_reviews: {
    name: 'Google Reviews',
    description: 'Monitor & respond to Google reviews, track sentiment trends',
    logo: '⭐',
    color: '#4285F4',
    fields: [
      { key: 'api_key', label: 'Google API Key', type: 'password', placeholder: 'Google Places API Key' },
      { key: 'place_id', label: 'Place ID', type: 'text', placeholder: 'Google Place ID' },
      { key: 'business_name', label: 'Business Name', type: 'text', placeholder: 'Your business name on Google' },
    ],
  },
  pronto: {
    name: 'Pronto',
    description: 'POS system sync — orders, menu items, settlements',
    logo: '🔄',
    color: '#FF6B35',
    fields: [
      { key: 'api_endpoint', label: 'API Endpoint', type: 'text', placeholder: 'https://api.pronto.com/v1' },
      { key: 'site_id', label: 'Site ID', type: 'text', placeholder: 'Pronto Site ID' },
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Pronto API Key' },
    ],
  },
};

export default function AUIntegrationsPage() {
  const { user } = useSelector(s => s.auth);
  const qc = useQueryClient();
  const outletId = user?.outlet_id;

  const [connectModal, setConnectModal] = useState(null); // { type, fields }
  const [formData, setFormData] = useState({});
  const [reviewReply, setReviewReply] = useState(null);
  const [replyText, setReplyText] = useState('');

  const { data: status = {} } = useQuery({
    queryKey: ['au-integrations', outletId],
    queryFn: () => api.get('/integrations/au/au-status', { params: { outlet_id: outletId } }).then(r => r.data),
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  const { data: reviews } = useQuery({
    queryKey: ['google-reviews', outletId],
    queryFn: () => api.get('/integrations/au/google-reviews/reviews', { params: { outlet_id: outletId } }).then(r => r.data),
    enabled: !!outletId && !!status?.google_reviews?.connected,
  });

  const connectMut = useMutation({
    mutationFn: ({ type, data }) => api.post(`/integrations/au/${type.replace('_', '-')}/connect`, { ...data, outlet_id: outletId }),
    onSuccess: (_, { type }) => {
      qc.invalidateQueries(['au-integrations']);
      toast.success(`${INTEGRATIONS_META[type]?.name} connected!`);
      setConnectModal(null);
      setFormData({});
    },
    onError: e => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: (type) => api.delete(`/integrations/au/${type.replace('_', '-')}/disconnect`, { data: { outlet_id: outletId } }),
    onSuccess: (_, type) => {
      qc.invalidateQueries(['au-integrations']);
      toast.success(`${INTEGRATIONS_META[type]?.name} disconnected`);
    },
    onError: e => toast.error(e.message),
  });

  const exportXeroMut = useMutation({
    mutationFn: () => api.post('/integrations/au/xero/export-sales', {
      outlet_id: outletId,
      from_date: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
      to_date: new Date().toISOString().split('T')[0],
    }),
    onSuccess: d => toast.success(`${d.exported} invoices exported to Xero`),
    onError: e => toast.error(e.message),
  });

  const exportMyobMut = useMutation({
    mutationFn: () => api.post('/integrations/au/myob/export', {
      outlet_id: outletId, type: 'sales',
      from_date: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
      to_date: new Date().toISOString().split('T')[0],
    }),
    onSuccess: d => toast.success(`${d.exported} records exported to MYOB`),
    onError: e => toast.error(e.message),
  });

  const syncProntoMut = useMutation({
    mutationFn: () => api.post('/integrations/au/pronto/sync', { outlet_id: outletId }),
    onSuccess: d => toast.success(`${d.orders_synced} orders synced to Pronto`),
    onError: e => toast.error(e.message),
  });

  const replyMut = useMutation({
    mutationFn: ({ review_id, reply_text }) => api.post('/integrations/au/google-reviews/reply', { review_id, reply_text }),
    onSuccess: () => { toast.success('Reply posted to Google!'); setReviewReply(null); setReplyText(''); },
    onError: e => toast.error(e.message),
  });

  const connectedCount = Object.values(status).filter(v => v?.connected).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>🇦🇺 Australian Integrations</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Connect your franchise to Australian business tools
          </p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-black" style={{ color: 'var(--accent)' }}>{connectedCount}</span>
          <span className="text-sm ml-1" style={{ color: 'var(--text-secondary)' }}>/ {Object.keys(INTEGRATIONS_META).length} connected</span>
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(INTEGRATIONS_META).map(([type, meta]) => {
          const st = status[type] || {};
          const isConnected = st.connected;
          return (
            <div key={type} className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: isConnected ? meta.color + '40' : 'var(--border)' }}>
              {isConnected && <div className="h-1" style={{ background: meta.color }} />}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{meta.logo}</span>
                    <div>
                      <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{meta.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isConnected ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <CheckCircle className="w-3 h-3" /> Connected
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            <XCircle className="w-3 h-3" /> Not connected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{meta.description}</p>

                {/* Connected stats */}
                {isConnected && (
                  <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2" style={{ borderColor: 'var(--border)' }}>
                    {type === 'xero' && <>
                      <Stat label="Org" value={st.organisation || '—'} />
                      <Stat label="Invoices" value={st.invoices_exported || 0} />
                    </>}
                    {type === 'square' && <>
                      <Stat label="Merchant" value={st.merchant_name || '—'} />
                      <Stat label="Processed" value={`$${(st.total_processed || 0).toFixed(0)}`} />
                    </>}
                    {type === 'myob' && <>
                      <Stat label="Company" value={st.company_name || '—'} />
                      <Stat label="Exported" value={st.records_exported || 0} />
                    </>}
                    {type === 'google_reviews' && <>
                      <Stat label="Business" value={st.business_name || '—'} />
                      <Stat label="Avg Rating" value={reviews?.avg_rating ? `${reviews.avg_rating}⭐` : '—'} />
                    </>}
                    {type === 'pronto' && <>
                      <Stat label="Site ID" value={st.site_id || '—'} />
                      <Stat label="Synced" value={st.orders_synced || 0} />
                    </>}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  {isConnected ? (
                    <>
                      {type === 'xero' && (
                        <button onClick={() => exportXeroMut.mutate()} disabled={exportXeroMut.isPending}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                          style={{ background: meta.color }}>
                          Export Sales
                        </button>
                      )}
                      {type === 'myob' && (
                        <button onClick={() => exportMyobMut.mutate()} disabled={exportMyobMut.isPending}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                          style={{ background: meta.color }}>
                          Export Sales
                        </button>
                      )}
                      {type === 'pronto' && (
                        <button onClick={() => syncProntoMut.mutate()} disabled={syncProntoMut.isPending}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                          style={{ background: meta.color }}>
                          <RefreshCw className="w-3 h-3 inline mr-1" />Sync Now
                        </button>
                      )}
                      {(type === 'square' || type === 'google_reviews') && (
                        <span className="flex-1 py-2 text-center text-xs font-semibold text-emerald-600">✓ Active</span>
                      )}
                      <button
                        onClick={() => disconnectMut.mutate(type)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold border"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setConnectModal(type); setFormData({}); }}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1"
                      style={{ background: meta.color }}
                    >
                      Connect <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Google Reviews Panel */}
      {status?.google_reviews?.connected && reviews?.reviews?.length > 0 && (
        <div className="rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>Google Reviews</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {reviews.total} reviews · avg {reviews.avg_rating}⭐ · {reviews.sentiment.positive} positive, {reviews.sentiment.negative} negative
              </p>
            </div>
            <div className="flex gap-3 text-center">
              <div><p className="text-lg font-black text-emerald-600">{reviews.sentiment.positive}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Positive</p></div>
              <div><p className="text-lg font-black text-amber-600">{reviews.sentiment.neutral}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Neutral</p></div>
              <div><p className="text-lg font-black text-red-600">{reviews.sentiment.negative}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Negative</p></div>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {reviews.reviews.map(r => (
              <div key={r.id} className="p-4 flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: r.sentiment === 'positive' ? '#10B981' : r.sentiment === 'negative' ? '#EF4444' : '#F59E0B' }}>
                  {r.author.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{r.author}</span>
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{r.date}</span>
                    </div>
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{r.text}</p>
                  {!r.replied && (
                    <button
                      onClick={() => setReviewReply(r)}
                      className="mt-2 flex items-center gap-1 text-xs font-semibold"
                      style={{ color: 'var(--accent)' }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Reply
                    </button>
                  )}
                  {r.replied && <span className="mt-2 inline-block text-xs font-semibold text-emerald-600">✓ Replied</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connect Modal */}
      {connectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{INTEGRATIONS_META[connectModal]?.logo}</span>
                <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Connect {INTEGRATIONS_META[connectModal]?.name}</h3>
              </div>
              <button onClick={() => setConnectModal(null)}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="p-5 space-y-3">
              {INTEGRATIONS_META[connectModal]?.fields.map(f => (
                <div key={f.key}>
                  <label className="text-xs mb-1 block font-medium" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={formData[f.key] || ''}
                    onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setConnectModal(null)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button
                  onClick={() => connectMut.mutate({ type: connectModal, data: formData })}
                  disabled={connectMut.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: INTEGRATIONS_META[connectModal]?.color }}
                >
                  {connectMut.isPending ? 'Connecting...' : `Connect ${INTEGRATIONS_META[connectModal]?.name}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {reviewReply && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Reply to {reviewReply.author}</h3>
              <button onClick={() => setReviewReply(null)}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)' }}>
                <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>"{reviewReply.text}"</p>
              </div>
              <textarea
                placeholder="Your reply..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-3">
                <button onClick={() => setReviewReply(null)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button
                  onClick={() => replyMut.mutate({ review_id: reviewReply.id, reply_text: replyText })}
                  disabled={replyMut.isPending || !replyText.trim()}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: '#4285F4' }}
                >
                  {replyMut.isPending ? 'Posting...' : 'Post Reply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}
