/**
 * LoyaltyRedemption — Loyalty points redemption panel for POS checkout.
 * Shows balance, conversion rate, quick-select buttons, and handles
 * redeem / remove against the backend loyalty API.
 */
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';
import { Star, Minus, Plus, Check, X } from 'lucide-react';

export default function LoyaltyRedemption({
  customer,
  outletId,
  orderTotal,
  onRedeem,
  onRemove,
  appliedPoints,
}) {
  const { format } = useCurrency();
  const [selectedPoints, setSelectedPoints] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [validationError, setValidationError] = useState('');

  // ── Loyalty config ──────────────────────────────────────────────────────────
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['loyalty-config', outletId],
    queryFn: () =>
      api
        .get(`/customers/loyalty/config?outlet_id=${outletId}`)
        .then((r) => r.data),
    enabled: !!outletId && !!customer,
    staleTime: 5 * 60 * 1000,
  });

  // ── Redeem mutation ─────────────────────────────────────────────────────────
  const redeemMutation = useMutation({
    mutationFn: ({ points }) =>
      api
        .post(`/customers/${customer.id}/loyalty/redeem`, {
          points,
          outlet_id: outletId,
        })
        .then((r) => r.data),
    onSuccess: (data, { points }) => {
      const discountAmount = computeDiscount(points);
      onRedeem(points, discountAmount);
      toast.success(`Redeemed ${points} pts — ${format(discountAmount)} off!`);
    },
    onError: (err) => {
      toast.error(
        err?.response?.data?.message || 'Failed to redeem loyalty points'
      );
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const balance = customer?.loyalty_points?.current_balance ?? 0;

  const computeDiscount = (pts) => {
    if (!config) return 0;
    return Math.round(pts * config.rupees_per_point * 100) / 100;
  };

  const maxAllowedPoints = () => {
    if (!config) return 0;
    const maxFromPct = Math.floor(
      (orderTotal * (config.max_redemption_pct / 100)) / config.rupees_per_point
    );
    return Math.min(balance, maxFromPct);
  };

  const quickPctPoints = (pct) => {
    const max = maxAllowedPoints();
    return Math.floor((max * pct) / 100);
  };

  const validate = (pts) => {
    if (!config) return '';
    if (pts < config.min_redemption_points) {
      return `Minimum ${config.min_redemption_points} pts required`;
    }
    if (pts > balance) {
      return `Only ${balance} pts available`;
    }
    const maxPts = maxAllowedPoints();
    if (pts > maxPts) {
      return `Max ${maxPts} pts allowed (${config.max_redemption_pct}% of order total)`;
    }
    return '';
  };

  const handleSetPoints = (pts) => {
    const clamped = Math.min(pts, maxAllowedPoints());
    setSelectedPoints(clamped);
    setCustomInput(String(clamped));
    setValidationError('');
  };

  const handleCustomChange = (val) => {
    setCustomInput(val);
    const pts = parseInt(val, 10) || 0;
    setSelectedPoints(pts);
    setValidationError(validate(pts));
  };

  const handleApply = () => {
    const pts = useCustom ? parseInt(customInput, 10) || 0 : selectedPoints;
    const err = validate(pts);
    if (err) {
      setValidationError(err);
      return;
    }
    if (pts <= 0) {
      setValidationError('Select points to redeem');
      return;
    }
    redeemMutation.mutate({ points: pts });
  };

  // ── Guard: no customer ───────────────────────────────────────────────────────
  if (!customer) {
    return (
      <div className="loyalty-panel loyalty-panel--empty">
        <Star className="loyalty-panel__empty-icon" size={16} />
        <span className="loyalty-panel__empty-text">
          Link a customer to use loyalty points
        </span>

        <style>{styles}</style>
      </div>
    );
  }

  // ── Guard: zero balance ──────────────────────────────────────────────────────
  if (balance === 0) {
    return (
      <div className="loyalty-panel loyalty-panel--empty">
        <Star className="loyalty-panel__empty-icon" size={16} />
        <span className="loyalty-panel__empty-text">
          {customer.full_name} has 0 loyalty points
        </span>

        <style>{styles}</style>
      </div>
    );
  }

  const maxPts = maxAllowedPoints();
  const previewDiscount = computeDiscount(
    useCustom ? parseInt(customInput, 10) || 0 : selectedPoints
  );
  const activePoints = useCustom ? parseInt(customInput, 10) || 0 : selectedPoints;

  return (
    <div className="loyalty-panel">
      <style>{styles}</style>

      {/* Header */}
      <div className="loyalty-panel__header">
        <Star className="loyalty-panel__star" size={15} />
        <span className="loyalty-panel__balance">
          {balance.toLocaleString()} pts available
        </span>
        {config && !configLoading && (
          <span className="loyalty-panel__rate">
            100 pts = {format(config.rupees_per_point * 100)}
          </span>
        )}
      </div>

      {/* Already applied */}
      {appliedPoints > 0 ? (
        <div className="loyalty-panel__applied">
          <Check size={14} className="loyalty-panel__applied-icon" />
          <span>
            {appliedPoints.toLocaleString()} pts applied&nbsp;(
            {format(computeDiscount(appliedPoints))} off)
          </span>
          <button
            className="loyalty-panel__remove-btn"
            onClick={onRemove}
            aria-label="Remove loyalty redemption"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <>
          {/* Quick-select buttons */}
          {!configLoading && config && (
            <div className="loyalty-panel__quick">
              {[
                { label: '25%', pct: 25 },
                { label: '50%', pct: 50 },
                { label: 'Max', pct: 100 },
              ].map(({ label, pct }) => {
                const pts = quickPctPoints(pct);
                const active = !useCustom && selectedPoints === pts && pts > 0;
                return (
                  <button
                    key={label}
                    className={`loyalty-panel__quick-btn${active ? ' loyalty-panel__quick-btn--active' : ''}`}
                    onClick={() => {
                      setUseCustom(false);
                      handleSetPoints(pts);
                    }}
                    disabled={pts === 0}
                  >
                    {label}
                    {pts > 0 && (
                      <span className="loyalty-panel__quick-pts">
                        {pts.toLocaleString()} pts
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Custom toggle */}
              <button
                className={`loyalty-panel__quick-btn${useCustom ? ' loyalty-panel__quick-btn--active' : ''}`}
                onClick={() => {
                  setUseCustom(true);
                  setCustomInput(String(selectedPoints || ''));
                  setValidationError('');
                }}
              >
                Custom
              </button>
            </div>
          )}

          {/* Custom input row */}
          {useCustom && (
            <div className="loyalty-panel__custom-row">
              <button
                className="loyalty-panel__stepper"
                onClick={() =>
                  handleCustomChange(
                    String(Math.max(0, (parseInt(customInput, 10) || 0) - 10))
                  )
                }
              >
                <Minus size={13} />
              </button>
              <input
                type="number"
                className="loyalty-panel__custom-input"
                value={customInput}
                min={0}
                max={maxPts}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="Enter points"
              />
              <button
                className="loyalty-panel__stepper"
                onClick={() =>
                  handleCustomChange(
                    String(
                      Math.min(maxPts, (parseInt(customInput, 10) || 0) + 10)
                    )
                  )
                }
              >
                <Plus size={13} />
              </button>
              <span className="loyalty-panel__custom-label">pts</span>
            </div>
          )}

          {/* Validation error */}
          {validationError && (
            <p className="loyalty-panel__error">{validationError}</p>
          )}

          {/* Preview */}
          {activePoints > 0 && !validationError && (
            <p className="loyalty-panel__preview">
              Redeeming {activePoints.toLocaleString()} pts = -{format(previewDiscount)}
            </p>
          )}

          {/* Apply button */}
          <button
            className="loyalty-panel__apply-btn"
            onClick={handleApply}
            disabled={
              redeemMutation.isPending ||
              configLoading ||
              !config ||
              activePoints <= 0
            }
          >
            {redeemMutation.isPending ? (
              'Applying…'
            ) : (
              <>
                <Check size={14} />
                Apply Points
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

// ── Scoped CSS ───────────────────────────────────────────────────────────────
const styles = `
.loyalty-panel {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.loyalty-panel--empty {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  opacity: 0.5;
  padding: 10px 14px;
}

.loyalty-panel__empty-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.loyalty-panel__empty-text {
  color: var(--text-secondary);
  font-size: 13px;
}

.loyalty-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.loyalty-panel__star {
  color: var(--warning);
  flex-shrink: 0;
}

.loyalty-panel__balance {
  font-weight: 600;
  color: var(--text-primary);
}

.loyalty-panel__rate {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 2px 7px;
  border-radius: 99px;
}

.loyalty-panel__applied {
  display: flex;
  align-items: center;
  gap: 7px;
  background: color-mix(in srgb, var(--success) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
  border-radius: 8px;
  padding: 7px 10px;
  color: var(--success);
  font-weight: 500;
  font-size: 13px;
}

.loyalty-panel__applied-icon {
  flex-shrink: 0;
}

.loyalty-panel__remove-btn {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--success);
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.loyalty-panel__remove-btn:hover { opacity: 1; }

.loyalty-panel__quick {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.loyalty-panel__quick-btn {
  flex: 1;
  min-width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}
.loyalty-panel__quick-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
}
.loyalty-panel__quick-btn--active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}
.loyalty-panel__quick-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.loyalty-panel__quick-pts {
  font-size: 10px;
  font-weight: 400;
  opacity: 0.75;
}

.loyalty-panel__custom-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.loyalty-panel__stepper {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  flex-shrink: 0;
}
.loyalty-panel__stepper:hover { background: var(--border); }

.loyalty-panel__custom-input {
  flex: 1;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  text-align: center;
  font-size: 13px;
  padding: 0 8px;
  outline: none;
}
.loyalty-panel__custom-input:focus {
  border-color: var(--accent);
}
.loyalty-panel__custom-input::-webkit-inner-spin-button,
.loyalty-panel__custom-input::-webkit-outer-spin-button { -webkit-appearance: none; }

.loyalty-panel__custom-label {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.loyalty-panel__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

.loyalty-panel__preview {
  margin: 0;
  font-size: 12px;
  color: var(--success);
  font-weight: 500;
}

.loyalty-panel__apply-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 16px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.loyalty-panel__apply-btn:hover:not(:disabled) { opacity: 0.88; }
.loyalty-panel__apply-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
`;
