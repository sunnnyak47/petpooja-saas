import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, ArrowRight, X, Globe, Star, RefreshCw, ExternalLink, MessageSquare, TrendingUp, Download, FileSpreadsheet, Calculator, DownloadCloud, LineChart, CreditCard } from 'lucide-react';

const INTEGRATIONS_META = {
  xero: {
    name: 'Xero',
    description: 'Cloud accounting — export invoices, manage P&L, BAS reports',
    icon: FileSpreadsheet,
    color: '#13B5EA',
    useOAuth: true, // OAuth2 flow — no manual fields needed
    fields: [],
  },
  square: {
    name: 'Square',
    description: 'Card & contactless payments — process, reconcile, track fees',
    icon: CreditCard,
    color: '#000000',
    useOAuth: true, // OAuth2 flow — owner connects their own Square account
    fields: [],
  },
  myob: {
    name: 'MYOB',
    description: 'Australian accounting & payroll — export sales, bills, tax',
    icon: Calculator,
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
    icon: Star,
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
    icon: RefreshCw,
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
  const navigate = useNavigate();
  const outletId = user?.outlet_id;

  const [connectModal, setConnectModal] = useState(null); // { type, fields }
  const [formData, setFormData] = useState({});
  const [reviewReply, setReviewReply] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [myobExportType, setMyobExportType] = useState('sales');
  const [myobExportModal, setMyobExportModal] = useState(false);
  const [exportDateRange, setExportDateRange] = useState({
    from: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

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

  // Xero OAuth2: get auth URL and open in same window
  const xeroAuthMut = useMutation({
    mutationFn: () => api.get('/integrations/au/xero/auth-url', { params: { outlet_id: outletId } }).then(r => r.data),
    onSuccess: (data) => {
      if (data?.url) {
        // Store state for callback verification
        sessionStorage.setItem('xero_oauth_state', data.state);
        window.open(data.url, '_blank', 'width=600,height=700');
        toast.success('Xero login window opened — complete authorization there');
      } else {
        toast('Xero OAuth not configured — using mock mode');
      }
    },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to start Xero OAuth'),
  });

  // Handle Xero OAuth callback — code can arrive via:
  // 1. window.location.search (?code=...) if redirect URI is plain path
  // 2. sessionStorage (stashed by App.jsx interceptor for hash-routing)
  useEffect(() => {
    if (!outletId) return;

    let code  = new URLSearchParams(window.location.search).get('code');
    let state = new URLSearchParams(window.location.search).get('state');

    if (!code) {
      code  = sessionStorage.getItem('xero_oauth_code');
      state = sessionStorage.getItem('xero_oauth_state');
      if (code) {
        sessionStorage.removeItem('xero_oauth_code');
        sessionStorage.removeItem('xero_oauth_state');
      }
    }

    if (code && state) {
      api.post('/integrations/au/xero/callback', { code, outlet_id: outletId })
        .then(() => {
          toast.success('Xero connected! Syncing financial data…');
          qc.invalidateQueries({ queryKey: ['au-integrations'] });
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch(e => toast.error(e?.message || 'Xero callback failed'));
    }
  }, [outletId, qc]);

  // Square OAuth2: get the authorize URL and send the owner there (same window).
  // Square redirects back to our backend callback, which bounces the browser to
  // /?square=connected#/au-integrations (handled by the effect below).
  const squareAuthMut = useMutation({
    mutationFn: () => api.get('/integrations/au/square/oauth/authorize', { params: { outlet_id: outletId } }).then(r => r.data),
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error('Square OAuth not configured on the server');
      }
    },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to start Square connection'),
  });

  // Handle the Square OAuth return flag (?square=connected|denied|invalid|error).
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('square');
    if (!flag) return;
    if (flag === 'connected') {
      toast.success('Square connected! You can now take card payments.');
      qc.invalidateQueries({ queryKey: ['au-integrations'] });
    } else if (flag === 'denied') {
      toast('Square connection was cancelled');
    } else {
      toast.error('Square connection failed — please try again');
    }
    // Strip the query param but preserve the hash route.
    const url = new URL(window.location.href);
    url.searchParams.delete('square');
    window.history.replaceState({}, '', url.pathname + url.hash);
  }, [qc]);

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
    }).then(r => r.data),
    onSuccess: d => {
      const msg = d?.mock ? 'Mock sync' : 'Synced';
      toast.success(`${msg}: ${d.exported} orders across ${d.days} day(s) to Xero`);
      qc.invalidateQueries(['au-integrations']);
    },
    onError: e => toast.error(e?.response?.data?.message || 'Xero sync failed'),
  });

  // Import data FROM Xero (pull) — populates the analytics + predictions tabs.
  const importXeroMut = useMutation({
    mutationFn: () => api.post('/integrations/au/xero/sync-full', {}).then(r => r.data),
    onSuccess: () => {
      toast.success('Importing financial data from Xero — analytics & predictions will refresh shortly');
      qc.invalidateQueries(['au-integrations']);
    },
    onError: e => toast.error(e?.response?.data?.message || 'Xero import failed'),
  });

  const exportMyobMut = useMutation({
    mutationFn: ({ type = 'sales', from_date, to_date } = {}) =>
      api.post('/integrations/au/myob/export', {
        outlet_id: outletId,
        type,
        from_date: from_date || exportDateRange.from,
        to_date: to_date || exportDateRange.to,
      }, { responseType: 'blob' }),
    onSuccess: (response, variables) => {
      // Check if response is a JSON (no data) or a CSV blob
      const contentType = response.headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        toast('No data found for the selected period');
        return;
      }
      // Trigger CSV download in the browser
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MYOB_${(variables?.type || 'sales').charAt(0).toUpperCase() + (variables?.type || 'sales').slice(1)}_${exportDateRange.from}_${exportDateRange.to}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success(`MYOB ${variables?.type || 'sales'} CSV downloaded!`);
      setMyobExportModal(false);
    },
    onError: e => toast.error(e?.response?.data?.message || 'Export failed'),
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
            <div key={type} className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: isConnected ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'var(--border)' }}>
              {isConnected && <div className="h-1" style={{ background: 'var(--accent)' }} />}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                      <meta.icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                    </div>
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
                      <Stat label="Org" value={st.organisation || st.org_name || '—'} />
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
                        <button onClick={() => importXeroMut.mutate()} disabled={importXeroMut.isPending}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                          style={{ background: 'var(--accent)' }}
                          title="Import P&L, balance sheet, invoices & more from Xero">
                          <DownloadCloud className={`w-3 h-3 inline mr-1 ${importXeroMut.isPending ? 'animate-spin' : ''}`} />
                          {importXeroMut.isPending ? 'Importing…' : 'Import from Xero'}
                        </button>
                      )}
                      {type === 'xero' && (
                        <button onClick={() => exportXeroMut.mutate()} disabled={exportXeroMut.isPending}
                          className="px-3 py-2 rounded-lg text-xs font-semibold border disabled:opacity-60"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          title="Push POS sales to Xero as invoices">
                          <RefreshCw className={`w-3 h-3 inline mr-1 ${exportXeroMut.isPending ? 'animate-spin' : ''}`} />
                          Sync Sales
                        </button>
                      )}
                      {type === 'myob' && (
                        <button onClick={() => setMyobExportModal(true)} disabled={exportMyobMut.isPending}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                          style={{ background: 'var(--accent)' }}>
                          <Download className="w-3 h-3 inline mr-1" />
                          Export CSV
                        </button>
                      )}
                      {type === 'pronto' && (
                        <button onClick={() => syncProntoMut.mutate()} disabled={syncProntoMut.isPending}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                          style={{ background: 'var(--accent)' }}>
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
                      onClick={() => {
                        if (type === 'xero') {
                          xeroAuthMut.mutate();
                        } else if (type === 'square') {
                          squareAuthMut.mutate();
                        } else {
                          setConnectModal(type);
                          setFormData({});
                        }
                      }}
                      disabled={(type === 'xero' && xeroAuthMut.isPending) || (type === 'square' && squareAuthMut.isPending)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1 disabled:opacity-60"
                      style={{ background: 'var(--accent)' }}
                    >
                      {meta.useOAuth ? (
                        <>
                          <ExternalLink className="w-3 h-3" />
                          {((type === 'xero' && xeroAuthMut.isPending) || (type === 'square' && squareAuthMut.isPending))
                            ? 'Opening...'
                            : `Connect with ${meta.name}`}
                        </>
                      ) : (
                        <>Connect <ArrowRight className="w-3 h-3" /></>
                      )}
                    </button>
                  )}
                </div>

                {/* Xero: jump to the imported data + live predictions */}
                {type === 'xero' && isConnected && (
                  <button
                    onClick={() => navigate('/xero-analytics')}
                    className="mt-2 w-full py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5"
                    style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                    title="View imported Xero data, financial analytics and live predictions"
                  >
                    <LineChart className="w-3.5 h-3.5" />
                    View Analytics &amp; Predictions
                  </button>
                )}
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

      {/* MYOB Export Modal */}
      {myobExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <Calculator className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Export to MYOB</h3>
              </div>
              <button onClick={() => setMyobExportModal(false)}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Export Type */}
              <div>
                <label className="text-xs mb-2 block font-medium" style={{ color: 'var(--text-secondary)' }}>Export Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'sales', label: 'Sales', icon: FileSpreadsheet },
                    { key: 'expenses', label: 'Expenses', icon: Calculator },
                    { key: 'payroll', label: 'Payroll', icon: Download },
                  ].map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setMyobExportType(key)}
                      className={`p-3 rounded-xl border text-center transition-all ${myobExportType === key ? 'ring-2' : ''}`}
                      style={{
                        borderColor: myobExportType === key ? '#7B2FBE' : 'var(--border)',
                        background: myobExportType === key ? '#7B2FBE15' : 'var(--bg-secondary)',
                        ringColor: '#7B2FBE',
                      }}
                    >
                      <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: myobExportType === key ? '#7B2FBE' : 'var(--text-secondary)' }} />
                      <span className="text-xs font-semibold" style={{ color: myobExportType === key ? '#7B2FBE' : 'var(--text-primary)' }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block font-medium" style={{ color: 'var(--text-secondary)' }}>From Date</label>
                  <input type="date" value={exportDateRange.from}
                    onChange={e => setExportDateRange(p => ({ ...p, from: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block font-medium" style={{ color: 'var(--text-secondary)' }}>To Date</label>
                  <input type="date" value={exportDateRange.to}
                    onChange={e => setExportDateRange(p => ({ ...p, to: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                CSV will be formatted for MYOB AccountRight import with AU date format (DD/MM/YYYY) and Inc/Ex Tax columns.
              </p>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setMyobExportModal(false)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button
                  onClick={() => exportMyobMut.mutate({ type: myobExportType, from_date: exportDateRange.from, to_date: exportDateRange.to })}
                  disabled={exportMyobMut.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: '#7B2FBE' }}
                >
                  <Download className="w-4 h-4" />
                  {exportMyobMut.isPending ? 'Exporting...' : 'Download CSV'}
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
