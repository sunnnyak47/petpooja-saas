import { useState, useMemo, useEffect } from 'react';
import { Minus, Plus, Check, ShoppingCart, StickyNote } from 'lucide-react';
import Modal from '../Modal';
import { useCurrency } from '../../hooks/useCurrency';

export default function ModifierModal({ isOpen, onClose, item, onAdd }) {
  const { format, symbol } = useCurrency();
  const [selectedVariant, setSelectedVariant] = useState(
    item?.variants?.find(v => v.is_default) || item?.variants?.[0] || null
  );
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setItemNotes('');
      setQuantity(1);
      // don't reset variant/addons — they may be pre-selected
    }
  }, [isOpen, item?.id]);

  if (!item) return null;

  const handleToggleAddon = (addon) => {
    setSelectedAddons(prev => {
      const existing = prev.find(a => a.id === addon.id);
      if (existing) return prev.filter(a => a.id !== addon.id);
      return [...prev, { ...addon, quantity: 1 }];
    });
  };

  const handleUpdateAddonQty = (addonId, delta) => {
    setSelectedAddons(prev => prev.map(a =>
      a.id === addonId ? { ...a, quantity: Math.max(1, a.quantity + delta) } : a
    ));
  };

  const basePrice = Number(item.base_price) || 0;
  const variantAdd = Number(selectedVariant?.price_addition || 0);
  const addonsTotal = selectedAddons.reduce((s, a) => s + (Number(a.price) * a.quantity), 0);
  // variantAdd may be negative (a smaller size below base). Floor at 0 — mirrors the
  // server's pricing clamp so a variant can never produce a negative charge.
  const unitPrice = Math.max(0, basePrice + variantAdd + addonsTotal);
  const totalPrice = unitPrice * quantity;

  const handleAdd = () => {
    onAdd({
      menu_item_id: item.id,
      name: item.name,
      base_price: basePrice,
      gst_rate: Number(item.gst_rate) || 0,
      food_type: item.food_type,
      kitchen_station: item.kitchen_station,
      variant_id: selectedVariant?.id || null,
      variant_name: selectedVariant?.name || null,
      variant_price: variantAdd,
      addons: selectedAddons.map(a => ({
        addon_id: a.id,
        name: a.name,
        price: Number(a.price),
        quantity: a.quantity,
      })),
      quantity,
      notes: itemNotes.trim() || null,
    });
    onClose();
  };

  // Group add-ons by group name
  const addonGroups = useMemo(() => {
    const groups = {};
    item.addons?.forEach(addon => {
      const groupName = addon.addon_group?.name || 'Add-ons';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(addon);
    });
    return groups;
  }, [item.addons]);

  // Food-type chip
  const foodType = (item.food_type || '').toLowerCase();
  const foodTypeMeta = foodType === 'veg'
    ? { label: 'Veg',     color: '#10b981' }
    : foodType === 'non_veg' || foodType === 'non-veg'
      ? { label: 'Non-veg', color: '#ef4444' }
      : foodType === 'egg'
        ? { label: 'Contains egg', color: '#f59e0b' }
        : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} size="md">
      <div className="-m-6">
        {/* ═════ SUB-HEADER — food type chip + description + base price ═════ */}
        <div className="px-6 pt-5 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
          {foodTypeMeta && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-2"
              style={{
                background: foodTypeMeta.color + '14',
                color: foodTypeMeta.color,
                border: `1px solid ${foodTypeMeta.color}30`,
              }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: foodTypeMeta.color }} />
              {foodTypeMeta.label}
            </span>
          )}
          {item.description && (
            <p className="text-xs mt-1 line-clamp-3" style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}>
              Base price
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFeatureSettings: '"tnum"' }}>
              {format(basePrice)}
            </span>
          </div>
        </div>

        {/* ═════ BODY ═════ */}
        <div className="px-6 py-5 max-h-[55vh] overflow-y-auto space-y-6">

          {/* Variants */}
          {item.variants?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--text-primary)' }}>
                  Choose size
                </h3>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                  Required
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-[10.5px]" style={{ color: 'var(--text-secondary)' }}>
                  Pick 1
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {item.variants.map(v => {
                  const active = selectedVariant?.id === v.id;
                  const delta = Number(v.price_addition || 0);
                  const variantTotal = Math.max(0, basePrice + delta);
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className="relative text-left p-4 rounded-xl transition-all overflow-hidden"
                      style={{
                        background: active ? 'rgba(99,102,241,0.06)' : 'var(--bg-card)',
                        border: `1.5px solid ${active ? '#6366f1' : 'var(--border)'}`,
                        boxShadow: active ? '0 6px 16px -8px rgba(99,102,241,0.35)' : '0 1px 2px rgba(15,23,42,0.04)',
                      }}>
                      {/* Check mark on selected */}
                      {active && (
                        <span className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: '#6366f1', color: '#fff' }}>
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                      )}
                      <div className="pr-7">
                        <div className="text-sm font-bold leading-tight"
                          style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                          {v.name}
                        </div>
                        {v.description && (
                          <div className="text-[11px] mt-1 line-clamp-2"
                            style={{ color: 'var(--text-secondary)' }}>
                            {v.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 mt-3">
                        <span className="text-base font-black"
                          style={{ color: active ? '#6366f1' : 'var(--text-primary)', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>
                          {format(variantTotal)}
                        </span>
                        {delta > 0 && (
                          <span className="text-[10.5px] font-semibold"
                            style={{ color: 'var(--text-secondary)' }}>
                            +{format(delta)}
                          </span>
                        )}
                        {delta < 0 && (
                          <span className="text-[10.5px] font-semibold" style={{ color: '#10b981' }}>
                            {format(delta)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add-on groups */}
          {Object.entries(addonGroups).map(([groupName, addons]) => (
            <div key={groupName}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--text-primary)' }}>
                  {groupName}
                </h3>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-[10.5px]" style={{ color: 'var(--text-secondary)' }}>
                  Optional · {selectedAddons.filter(a => addons.find(x => x.id === a.id)).length} selected
                </span>
              </div>
              <div className="space-y-2">
                {addons.map(addon => {
                  const selectedEntry = selectedAddons.find(a => a.id === addon.id);
                  const active = !!selectedEntry;
                  return (
                    <div key={addon.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
                      style={{
                        background: active ? 'rgba(99,102,241,0.05)' : 'var(--bg-card)',
                        border: `1px solid ${active ? '#6366f160' : 'var(--border)'}`,
                      }}>
                      <button
                        onClick={() => handleToggleAddon(addon)}
                        className="flex-1 flex items-center gap-3 text-left">
                        <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            background: active ? '#6366f1' : 'transparent',
                            border: `1.5px solid ${active ? '#6366f1' : 'var(--border)'}`,
                          }}>
                          {active && <Check className="w-2.5 h-2.5" style={{ color: '#fff' }} strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold leading-tight"
                            style={{ color: 'var(--text-primary)' }}>
                            {addon.name}
                          </div>
                          <div className="text-[11px] mt-0.5"
                            style={{ color: 'var(--text-secondary)', fontFeatureSettings: '"tnum"' }}>
                            +{format(Number(addon.price))}
                          </div>
                        </div>
                      </button>

                      {active && (
                        <div className="flex items-center gap-1 rounded-lg overflow-hidden"
                          style={{ border: '1px solid var(--border)' }}>
                          <button onClick={() => handleUpdateAddonQty(addon.id, -1)}
                            className="w-7 h-7 flex items-center justify-center transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--text-primary)' }}>
                            {selectedEntry.quantity}
                          </span>
                          <button onClick={() => handleUpdateAddonQty(addon.id, 1)}
                            className="w-7 h-7 flex items-center justify-center transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Special Instructions */}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <StickyNote className="w-3.5 h-3.5" />
              Special Instructions <span className="font-normal opacity-60">(optional)</span>
            </p>
            <textarea
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value.slice(0, 150))}
              placeholder="e.g. no onion, extra spicy, less salt..."
              rows={2}
              style={{
                width: '100%', resize: 'none',
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                borderRadius: '10px', color: 'var(--text-primary)',
                fontSize: '13px', padding: '8px 12px',
                outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <p className="text-[10px] text-right mt-1" style={{ color: 'var(--text-secondary)' }}>
              {itemNotes.length}/150
            </p>
            {/* Quick tag buttons */}
            <div className="flex flex-wrap gap-1 mt-2">
              {['No onion', 'Extra spicy', 'Less spicy', 'No garlic', 'Less oil', 'Extra sauce'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setItemNotes(prev => prev ? `${prev}, ${tag}` : tag)}
                  className="text-[10px] px-2 py-0.5 rounded-full border transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═════ FOOTER ═════ */}
        <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          {/* Price breakdown row */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span>Base {format(basePrice)}</span>
              {variantAdd > 0 && <span> + Size {format(variantAdd)}</span>}
              {addonsTotal > 0 && <span> + Add-ons {format(addonsTotal)}</span>}
              {quantity > 1 && <span> × {quantity}</span>}
            </div>
            <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Unit: <span style={{ fontFeatureSettings: '"tnum"' }}>{format(unitPrice)}</span>
            </div>
          </div>

          {/* Quantity + Add */}
          <div className="flex items-center gap-3">
            {/* Quantity stepper */}
            <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0"
              style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-11 flex items-center justify-center transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}>
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-sm font-black w-8 text-center" style={{ color: 'var(--text-primary)', fontFeatureSettings: '"tnum"' }}>
                {quantity}
              </span>
              <button onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-11 flex items-center justify-center transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}>
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Add to cart */}
            <button onClick={handleAdd}
              disabled={item.variants?.length > 0 && !selectedVariant}
              className="flex-1 h-11 rounded-lg flex items-center justify-between px-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#fff',
                boxShadow: '0 6px 18px -6px rgba(99,102,241,0.5)',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 24px -6px rgba(99,102,241,0.6)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 18px -6px rgba(99,102,241,0.5)'; }}>
              <span className="flex items-center gap-2 text-sm font-bold">
                <ShoppingCart className="w-4 h-4" />
                Add to Cart
                {itemNotes.trim() && (
                  <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
                    style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <StickyNote className="w-3 h-3" /> Note
                  </span>
                )}
              </span>
              <span className="text-base font-black" style={{ letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"' }}>
                {format(totalPrice)}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
