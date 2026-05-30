/**
 * GratuitySelector — Compact collapsible tip / gratuity picker for POS checkout.
 * Uses the project's CSS variables (--border, --bg-card, --accent, --text-*).
 */
import { useState, useRef } from 'react';
import { useCurrency } from '../../hooks/useCurrency';
import { ChevronDown, ChevronUp, Heart, X, Zap } from 'lucide-react';

const PRESETS_IN = [5, 10, 15, 20];
const PRESETS_AU = [10, 15, 20];

function calcGratuity(subtotal, pct) {
  return Math.round(subtotal * (pct / 100) * 100) / 100;
}

export default function GratuitySelector({
  subtotal = 0,
  gratuity = 0,
  onGratuityChange,
  isAU = false,
  serviceChargePct = 0,
}) {
  const { format, symbol } = useCurrency();
  const inputRef = useRef(null);

  const [expanded, setExpanded]       = useState(false);
  const [activePct, setActivePct]     = useState(null);
  const [customValue, setCustomValue] = useState('');

  const presets = isAU ? PRESETS_AU : PRESETS_IN;
  const hasServiceCharge = serviceChargePct > 0;
  const isCustomActive = activePct === null && customValue !== '';

  // ── Handlers ────────────────────────────────────────────────────────────────

  const applyPreset = (pct) => {
    setActivePct(pct);
    setCustomValue('');
    onGratuityChange(calcGratuity(subtotal, pct));
  };

  const applyCustom = (raw) => {
    setCustomValue(raw);
    setActivePct(null);
    const num = parseFloat(raw) || 0;
    onGratuityChange(num >= 0 ? num : 0);
  };

  const applyServiceCharge = () => {
    setActivePct('sc');
    setCustomValue('');
    onGratuityChange(calcGratuity(subtotal, serviceChargePct));
  };

  const remove = () => {
    setActivePct(null);
    setCustomValue('');
    onGratuityChange(0);
  };

  const openAndFocusCustom = () => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const previewAmt =
    activePct !== null && activePct !== 'sc' && subtotal > 0
      ? calcGratuity(subtotal, activePct)
      : null;

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}
    >
      {/* ── Header row ───────────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Icon */}
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(245,158,11,0.12)' }}
        >
          <Heart className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
        </div>

        {/* Label */}
        <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Gratuity / Tip
        </span>

        {/* Value chip */}
        {gratuity > 0 ? (
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(245,158,11,0.12)',
              color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.25)',
            }}
          >
            +{format(gratuity)}
          </span>
        ) : (
          <span
            className="text-[11px] px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
            }}
          >
            Optional
          </span>
        )}

        {/* Chevron */}
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
          : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
        }
      </button>

      {/* ── Expanded body ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.22s ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div
            className="px-3 pb-3 flex flex-col gap-2.5"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {/* Spacer */}
            <div />

            {/* Preset percentage buttons */}
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${presets.length + 1}, 1fr)` }}>
              {presets.map((pct) => {
                const isActive = activePct === pct;
                return (
                  <button
                    key={pct}
                    onClick={() => applyPreset(pct)}
                    className="py-2 rounded-lg text-xs font-bold transition-all"
                    style={{
                      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      background: isActive ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {pct}%
                    {isActive && previewAmt !== null && (
                      <span className="block text-[9px] font-medium mt-0.5 opacity-80">
                        {format(previewAmt)}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Custom button */}
              <button
                onClick={openAndFocusCustom}
                className="py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  border: `1px solid ${isCustomActive ? 'var(--accent)' : 'var(--border)'}`,
                  background: isCustomActive ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
                  color: isCustomActive ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                Custom
              </button>
            </div>

            {/* Custom amount input — always shown when no preset is active */}
            {activePct === null && (
              <div
                className="flex items-center gap-2 h-9 px-3 rounded-lg transition-all"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                }}
                onFocus={() => {}}
              >
                <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  {symbol}
                </span>
                <input
                  ref={inputRef}
                  type="number"
                  min={0}
                  step={1}
                  value={customValue}
                  onChange={(e) => applyCustom(e.target.value)}
                  placeholder="Enter tip amount"
                  className="flex-1 bg-transparent border-none outline-none text-xs"
                  style={{ color: 'var(--text-primary)' }}
                  onFocus={e => {
                    e.currentTarget.parentElement.style.borderColor = 'var(--accent)';
                  }}
                  onBlur={e => {
                    e.currentTarget.parentElement.style.borderColor = 'var(--border)';
                  }}
                />
              </div>
            )}

            {/* Service charge auto-apply button */}
            {hasServiceCharge && (
              <button
                onClick={applyServiceCharge}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{
                  border: `1px ${activePct === 'sc' ? 'solid' : 'dashed'} rgba(245,158,11,0.4)`,
                  background: activePct === 'sc' ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.05)',
                  color: '#f59e0b',
                }}
              >
                <Zap className="w-3 h-3" />
                Auto-apply {serviceChargePct}% service charge
              </button>
            )}

            {/* Remove gratuity */}
            {gratuity > 0 && (
              <button
                onClick={remove}
                className="flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-lg w-full transition-all"
                style={{
                  color: '#ef4444',
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)',
                }}
              >
                <X className="w-3 h-3" />
                Remove gratuity
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
