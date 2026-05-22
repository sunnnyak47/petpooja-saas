/**
 * DietaryTagPicker — chip-style multi-select for dietary / allergen tags.
 *
 * Behaviour:
 *  • Shows region-aware preset tags (AU vs IN) plus any custom tags this
 *    outlet has previously created.
 *  • Owner can click "+ Add custom" to type a fresh tag name. Auto-assigns
 *    an abbreviation (first letters) and a colour from a palette.
 *  • Custom tags persist per-outlet in localStorage and stay available
 *    across sessions and devices that share the same outlet.
 *  • Optional region-specific quick-add suggestions surface common tags
 *    not yet in the list (helpful starter for new outlets).
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Sparkles, Trash2 } from 'lucide-react';
import {
  getDietaryTagsFor,
  loadCustomTags,
  saveCustomTags,
  makeCustomTag,
  AU_DIETARY_TAGS,
  IN_DIETARY_TAGS,
} from '../../constants/dietaryTags';

// Common AU labels not in our standard preset list — surface as suggestions
const AU_SUGGESTIONS = [
  'Pescatarian', 'Raw Vegan', 'High Protein', 'Low Sodium', 'Diabetic Friendly',
  'Gluten Friendly', 'Nut Free', 'Egg Free', 'Soy Free', 'Allergen Free',
  'Locally Caught', 'Free Range', 'Grass Fed', 'House Made',
];

// Common IN labels not in our standard preset list
const IN_SUGGESTIONS = [
  'Less Oil', 'Dairy Free', 'Vegan', 'Eggless', 'Sweet',
  'Bestseller', 'New Arrival', 'Limited Time', 'Trending',
  'Family Pack', 'Healthy', 'Protein Rich', 'Kids Friendly',
];

export default function DietaryTagPicker({
  region = 'IN',           // 'AU' | 'IN'
  outletId,                // used to namespace custom tags in localStorage
  selectedTags = [],       // array of tag value strings
  onChange,                // (newSelectedValues: string[]) => void
  showHelp = true,
}) {
  const [tags, setTags] = useState(() => getDietaryTagsFor(region, outletId));
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  // Reload when storage changes (e.g. picker on another tab adds a tag)
  useEffect(() => {
    setTags(getDietaryTagsFor(region, outletId));
    const reload = () => setTags(getDietaryTagsFor(region, outletId));
    window.addEventListener('dietary-tags-changed', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('dietary-tags-changed', reload);
      window.removeEventListener('storage', reload);
    };
  }, [region, outletId]);

  const suggestionsForRegion = region === 'AU' ? AU_SUGGESTIONS : IN_SUGGESTIONS;
  const visibleSuggestions = useMemo(() => {
    const usedLabels = new Set(tags.map(t => t.label.toLowerCase()));
    return suggestionsForRegion.filter(s => !usedLabels.has(s.toLowerCase())).slice(0, 5);
  }, [tags, suggestionsForRegion]);

  const isSelected = (value) => selectedTags.includes(value);

  const toggleTag = (value) => {
    const next = isSelected(value)
      ? selectedTags.filter(v => v !== value)
      : [...selectedTags, value];
    onChange(next);
  };

  const addCustomTag = (label) => {
    const fresh = makeCustomTag(label);
    if (!fresh) return;
    // If it already exists as a preset, just select it and skip persistence.
    const isPreset = [...AU_DIETARY_TAGS, ...IN_DIETARY_TAGS].some(t => t.value === fresh.value);
    if (!isPreset) {
      const existingCustom = loadCustomTags(outletId);
      if (!existingCustom.some(t => t.value === fresh.value)) {
        saveCustomTags(outletId, [...existingCustom, fresh]);
      }
    }
    if (!selectedTags.includes(fresh.value)) {
      onChange([...selectedTags, fresh.value]);
    }
    setAddingNew(false);
    setNewLabel('');
  };

  const removeCustomTag = (value) => {
    const current = loadCustomTags(outletId);
    saveCustomTags(outletId, current.filter(t => t.value !== value));
    // Also deselect if it was selected
    if (selectedTags.includes(value)) onChange(selectedTags.filter(v => v !== value));
  };

  return (
    <div className="space-y-2">
      {/* Chip grid */}
      <div className="flex flex-wrap gap-2">
        {tags.map(tag => {
          const active = isSelected(tag.value);
          return (
            <div key={tag.value} className="group relative">
              <button
                type="button"
                onClick={() => toggleTag(tag.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                  active
                    ? `${tag.bg} ${tag.text} ${tag.border}`
                    : 'bg-surface-900 text-surface-500 border-surface-700 hover:border-surface-500'
                }`}
                title={tag.custom ? `${tag.label} (custom — added by you)` : tag.label}
              >
                <span className="text-[10px] font-black">{tag.abbr}</span> {tag.label}
                {tag.custom && (
                  <span className="ml-1 text-[8px] uppercase tracking-wider opacity-70">·custom</span>
                )}
              </button>
              {tag.custom && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeCustomTag(tag.value); }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="Delete custom tag for this outlet"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add-custom trigger */}
        {!addingNew && (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed text-xs font-bold transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <Plus className="w-3.5 h-3.5" /> Add custom tag
          </button>
        )}
      </div>

      {/* Inline create form */}
      {addingNew && (
        <div className="flex items-center gap-2 p-2 rounded-lg border"
          style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }}>
          <input
            type="text"
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newLabel.trim()) { e.preventDefault(); addCustomTag(newLabel); }
              if (e.key === 'Escape') { setAddingNew(false); setNewLabel(''); }
            }}
            placeholder="e.g. Pescatarian, Less Oil, Chef's Pick…"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          <button
            type="button"
            onClick={() => addCustomTag(newLabel)}
            disabled={!newLabel.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setAddingNew(false); setNewLabel(''); }}
            className="p-1.5 rounded-md hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Region-aware suggestions */}
      {showHelp && visibleSuggestions.length > 0 && (
        <div className="pt-1 flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold"
            style={{ color: 'var(--text-secondary)' }}>
            <Sparkles className="w-3 h-3" /> Popular in {region === 'AU' ? 'Australia' : 'India'}:
          </div>
          {visibleSuggestions.map(label => (
            <button
              key={label}
              type="button"
              onClick={() => addCustomTag(label)}
              className="text-[11px] px-2.5 py-1 rounded-md border hover:opacity-80 transition-opacity"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
              }}
              title={`Add "${label}" as a custom tag`}
            >
              + {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
