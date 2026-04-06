import { useState, useMemo } from 'react';
import { X, Minus, Plus, Search } from 'lucide-react';
import Modal from '../Modal';

export default function ModifierModal({ isOpen, onClose, item, onAdd }) {
  const [selectedVariant, setSelectedVariant] = useState(
    item?.variants?.find(v => v.is_default) || item?.variants?.[0] || null
  );
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [quantity, setQuantity] = useState(1);

  if (!item) return null;

  const handleToggleAddon = (addon) => {
    setSelectedAddons(prev => {
      const existing = prev.find(a => a.id === addon.id);
      if (existing) {
        return prev.filter(a => a.id !== addon.id);
      } else {
        return [...prev, { ...addon, quantity: 1 }];
      }
    });
  };

  const handleUpdateAddonQty = (addonId, delta) => {
    setSelectedAddons(prev => prev.map(a => {
      if (a.id === addonId) {
        return { ...a, quantity: Math.max(1, a.quantity + delta) };
      }
      return a;
    }));
  };

  const totalPrice = useMemo(() => {
    let price = Number(item.base_price);
    if (selectedVariant) price += Number(selectedVariant.price_addition || 0);
    const addonsTotal = selectedAddons.reduce((sum, a) => sum + (Number(a.price) * a.quantity), 0);
    return (price + addonsTotal) * quantity;
  }, [item, selectedVariant, selectedAddons, quantity]);

  const handleAdd = () => {
    onAdd({
      menu_item_id: item.id,
      name: item.name,
      base_price: Number(item.base_price),
      food_type: item.food_type,
      kitchen_station: item.kitchen_station,
      variant_id: selectedVariant?.id || null,
      variant_name: selectedVariant?.name || null,
      variant_price: Number(selectedVariant?.price_addition || 0),
      addons: selectedAddons.map(a => ({
        addon_id: a.id,
        name: a.name,
        price: Number(a.price),
        quantity: a.quantity
      })),
      quantity
    });
    onClose();
  };

  // Group addons by group name
  const addonGroups = useMemo(() => {
    const groups = {};
    item.addons?.forEach(addon => {
      const groupName = addon.addon_group?.name || 'Add-ons';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(addon);
    });
    return groups;
  }, [item.addons]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} size="md">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1 scrollbar-thin">
        
        {/* Variants Section */}
        {item.variants?.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-surface-400 uppercase tracking-wider">Select Size / Variant</h3>
            <div className="grid grid-cols-2 gap-2">
              {item.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariant(v)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    selectedVariant?.id === v.id
                      ? 'border-brand-500 bg-brand-500/10 text-white shadow-lg shadow-brand-500/10'
                      : 'border-surface-800 bg-surface-900 text-surface-400 hover:border-surface-700'
                  }`}
                >
                  <p className="font-bold text-sm">{v.name}</p>
                  <p className="text-xs opacity-70">+{Number(v.price_addition).toFixed(0)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Addons Section */}
        {Object.keys(addonGroups).map(groupName => (
          <div key={groupName} className="space-y-3">
            <h3 className="text-sm font-bold text-surface-400 uppercase tracking-wider">{groupName}</h3>
            <div className="space-y-2">
              {addonGroups[groupName].map((addon) => {
                const isSelected = selectedAddons.find(a => a.id === addon.id);
                return (
                  <div
                    key={addon.id}
                    className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-brand-500/50 bg-surface-800 text-white'
                        : 'border-surface-800 bg-surface-900 text-surface-400 hover:border-surface-700'
                    }`}
                  >
                    <button 
                      onClick={() => handleToggleAddon(addon)}
                      className="flex-1 flex items-center gap-3 text-left"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-brand-500 border-brand-500' : 'border-surface-700'}`}>
                        {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{addon.name}</p>
                        <p className="text-xs opacity-70">₹{Number(addon.price).toFixed(0)}</p>
                      </div>
                    </button>
                    
                    {isSelected && (
                      <div className="flex items-center gap-3 bg-surface-900 rounded-lg p-1 animate-scale-in">
                        <button onClick={() => handleUpdateAddonQty(addon.id, -1)} className="w-6 h-6 rounded bg-surface-800 hover:bg-surface-700 flex items-center justify-center"><Minus className="w-3 h-3"/></button>
                        <span className="font-bold text-sm w-4 text-center">{isSelected.quantity}</span>
                        <button onClick={() => handleUpdateAddonQty(addon.id, 1)} className="w-6 h-6 rounded bg-surface-800 hover:bg-surface-700 flex items-center justify-center"><Plus className="w-3 h-3"/></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-6 border-t border-surface-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 bg-surface-900 rounded-xl p-1.5 border border-surface-800">
          <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-colors"><Minus className="w-4 h-4"/></button>
          <span className="text-lg font-black w-8 text-center">{quantity}</span>
          <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-colors"><Plus className="w-4 h-4"/></button>
        </div>
        
        <button 
          onClick={handleAdd}
          className="flex-1 btn-primary py-4 rounded-xl text-lg font-bold shadow-xl shadow-brand-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        >
          Add to Cart <span className="opacity-50">|</span> ₹{totalPrice.toFixed(0)}
        </button>
      </div>
    </Modal>
  );
}
