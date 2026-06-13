import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Percent, DollarSign, Save, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';

/**
 * Per-channel delivery pricing + live margin preview.
 *
 * Restaurants set a markup (percent or flat) per delivery channel to recover the
 * aggregator commission. The preview table shows the true net payout and margin
 * versus the base price.
 *
 * @param {{ platform: string, platformName: string }} props
 */
export default function ChannelPricing({ platform, platformName }) {
  const { format } = useCurrency();
  const queryClient = useQueryClient();

  const [type, setType] = useState('percent');
  const [value, setValue] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);

  const pricingQuery = useQuery({
    queryKey: ['aggregator-pricing', platform],
    queryFn: () => api.get(`/aggregators/pricing/${platform}`).then((r) => r.data),
  });

  const previewQuery = useQuery({
    queryKey: ['aggregator-pricing-preview', platform],
    queryFn: () => api.get(`/aggregators/pricing/${platform}/preview`).then((r) => r.data),
  });

  // Hydrate local form state from the saved config once it loads.
  useEffect(() => {
    if (pricingQuery.data && !dirty) {
      setType(pricingQuery.data.type || 'percent');
      setValue(Number(pricingQuery.data.value) || 0);
      setEnabled(Boolean(pricingQuery.data.enabled));
    }
  }, [pricingQuery.data, dirty]);

  const saveMutation = useMutation({
    mutationFn: (body) =>
      api.put(`/aggregators/pricing/${platform}`, body).then((r) => r.data),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['aggregator-pricing', platform] });
      queryClient.invalidateQueries({ queryKey: ['aggregator-pricing-preview', platform] });
    },
  });

  const markDirty = (fn) => (...args) => {
    setDirty(true);
    fn(...args);
  };

  const handleSave = () => {
    saveMutation.mutate({ type, value: Number(value) || 0, enabled });
  };

  const preview = previewQuery.data;
  const items = preview?.items?.slice(0, 8) || [];
  const summary = preview?.summary;
  const commissionPct = preview?.commission_pct;

  const containerStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
    color: 'var(--text-primary)',
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    display: 'block',
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          {platformName} — Channel Pricing
        </h3>
        {commissionPct != null && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 10px',
            }}
          >
            {commissionPct}% commission
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-secondary)' }}>
        Mark up menu prices on this channel to recover the aggregator commission.
        The preview below shows your true net payout per item.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', marginBottom: 20 }}>
        {/* Enable toggle */}
        <div>
          <span style={labelStyle}>Status</span>
          <button
            type="button"
            onClick={() => markDirty(setEnabled)(!enabled)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: enabled ? 'var(--accent)' : 'var(--bg-secondary)',
              color: enabled ? 'var(--accent-text)' : 'var(--text-secondary)',
            }}
          >
            <span
              style={{
                width: 32,
                height: 18,
                borderRadius: 10,
                background: enabled ? 'var(--accent-text)' : 'var(--border)',
                position: 'relative',
                display: 'inline-block',
                transition: 'background 0.15s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: enabled ? 16 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: enabled ? 'var(--accent)' : 'var(--bg-card)',
                  transition: 'left 0.15s',
                }}
              />
            </span>
            {enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Markup type segmented control */}
        <div>
          <span style={labelStyle}>Markup type</span>
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {[
              { key: 'percent', label: 'Percent', Icon: Percent },
              { key: 'flat', label: 'Flat amount', Icon: DollarSign },
            ].map(({ key, label, Icon }) => {
              const active = type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => markDirty(setType)(key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    background: active ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Value input */}
        <div>
          <span style={labelStyle}>{type === 'percent' ? 'Markup %' : 'Markup amount'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min="0"
              step={type === 'percent' ? '1' : '0.5'}
              value={value}
              onChange={(e) => markDirty(setValue)(e.target.value)}
              style={{
                width: 120,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: 14,
              }}
            />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {type === 'percent' ? '%' : ''}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            cursor: saveMutation.isPending ? 'default' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            opacity: saveMutation.isPending ? 0.7 : 1,
            marginLeft: 'auto',
          }}
        >
          <Save size={15} />
          {saveMutation.isPending ? 'Saving…' : 'Save pricing'}
        </button>
      </div>

      {saveMutation.isError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#c0392b', marginBottom: 14 }}>
          <AlertCircle size={15} />
          {saveMutation.error?.message || 'Failed to save pricing'}
        </div>
      )}
      {saveMutation.isSuccess && !dirty && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Pricing saved.
        </div>
      )}

      {/* Preview table */}
      <div>
        <span style={labelStyle}>Margin preview {items.length ? `(first ${items.length} items)` : ''}</span>
        {previewQuery.isLoading ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>
            Loading preview…
          </div>
        ) : previewQuery.isError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#c0392b' }}>
            <AlertCircle size={15} />
            {previewQuery.error?.message || 'Failed to load preview'}
          </div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>
            No active menu items to preview.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                  {['Item', 'Base', 'Channel price', 'Commission', 'Net payout', 'Margin'].map((h, idx) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 12px',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        textAlign: idx === 0 ? 'left' : 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const positive = it.margin_vs_base >= 0;
                  return (
                    <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{it.name}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {format(it.base_price)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {format(it.channel_price)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        −{format(it.platform_fee)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {format(it.net_payout)}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: positive ? '#1e874b' : '#c0392b',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                          {positive ? '+' : ''}{format(it.margin_vs_base)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {summary && summary.item_count > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            {summary.item_count} active items · avg channel price{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{format(summary.avg_channel_price)}</strong>{' '}
            · avg net payout{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{format(summary.avg_net_payout)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
