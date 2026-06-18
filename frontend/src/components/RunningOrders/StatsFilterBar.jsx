import { useState } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  Search,
  LayoutGrid,
  List,
  Clock,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function elapsedMinutes(createdAt) {
  return (Date.now() - new Date(createdAt).getTime()) / 60000;
}

// ---------------------------------------------------------------------------
// StatsStrip
// ---------------------------------------------------------------------------

export function StatsStrip({
  orders = [],
  filteredCount,
  isRefetching,
  onRefresh,
  isLive,
  onToggleLive,
  urgencyThreshold = 20,
}) {
  const { format } = useCurrency();

  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.grand_total) || 0), 0);

  const avgWait =
    orders.length > 0
      ? orders.reduce((sum, o) => sum + elapsedMinutes(o.created_at), 0) / orders.length
      : 0;

  const urgentCount = orders.filter((o) => elapsedMinutes(o.created_at) > urgencyThreshold).length;

  const statusCounts = orders.reduce(
    (acc, o) => {
      const s = o.status?.toLowerCase();
      if (s in acc) acc[s] += 1;
      return acc;
    },
    { created: 0, confirmed: 0, held: 0, billed: 0 }
  );

  const statusPills = [
    { key: 'created',   label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'held',      label: 'On Hold' },
    { key: 'ready',     label: 'Ready' },
    { key: 'billed',    label: 'Billed' },
    { key: 'paid',      label: 'Prepaid' },
  ];

  return (
    <div
      className="rounded-xl border p-3 flex flex-wrap items-center gap-x-6 gap-y-3"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Total Orders */}
      <div className="flex items-center gap-2 min-w-[90px]">
        {orders.length > 0 && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
        <div>
          <p className="tracking-wider uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Total Orders
          </p>
          <p className="font-mono tabular-nums text-lg font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {orders.length}
            {filteredCount !== undefined && filteredCount !== orders.length && (
              <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>
                ({filteredCount})
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="w-px h-8 shrink-0" style={{ background: 'var(--border)' }} />

      {/* Revenue */}
      <div className="min-w-[100px]">
        <div className="flex items-center gap-1 mb-0.5">
          <TrendingUp size={10} style={{ color: 'var(--text-secondary)' }} />
          <p className="tracking-wider uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Revenue
          </p>
        </div>
        <p className="font-mono tabular-nums text-lg font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {format(totalRevenue)}
        </p>
      </div>

      <div className="w-px h-8 shrink-0" style={{ background: 'var(--border)' }} />

      {/* Avg Wait */}
      <div className="min-w-[80px]">
        <div className="flex items-center gap-1 mb-0.5">
          <Clock size={10} style={{ color: 'var(--text-secondary)' }} />
          <p className="tracking-wider uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Avg Wait
          </p>
        </div>
        <p className="font-mono tabular-nums text-lg font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {Math.round(avgWait)}
          <span className="text-xs font-normal ml-0.5" style={{ color: 'var(--text-secondary)' }}>min</span>
        </p>
      </div>

      <div className="w-px h-8 shrink-0" style={{ background: 'var(--border)' }} />

      {/* Urgent */}
      <div className="min-w-[70px]">
        <div className="flex items-center gap-1 mb-0.5">
          <AlertTriangle size={10} className={urgentCount > 0 ? 'text-red-400' : ''} style={urgentCount === 0 ? { color: 'var(--text-secondary)' } : {}} />
          <p className="tracking-wider uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Urgent
          </p>
        </div>
        <p
          className={`font-mono tabular-nums text-lg font-semibold leading-tight ${urgentCount > 0 ? 'text-red-400' : ''}`}
          style={urgentCount === 0 ? { color: 'var(--text-primary)' } : {}}
        >
          {urgentCount}
        </p>
      </div>

      <div className="w-px h-8 shrink-0" style={{ background: 'var(--border)' }} />

      {/* Status pills */}
      <div className="flex flex-wrap gap-1.5">
        {statusPills.map(({ key, label }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium tabular-nums"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            {label}
            <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{statusCounts[key]}</span>
          </span>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Live / Refresh controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onToggleLive}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            isLive
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
              : 'border text-slate-400 hover:bg-slate-500/10'
          }`}
          style={!isLive ? { borderColor: 'var(--border)' } : {}}
          title={isLive ? 'Pause live updates' : 'Resume live updates'}
        >
          {isLive ? <Wifi size={13} /> : <WifiOff size={13} />}
          {isLive ? 'Live' : 'Paused'}
        </button>

        <button
          onClick={onRefresh}
          disabled={isRefetching}
          className="p-1.5 rounded-lg border transition-colors hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          title="Refresh"
        >
          <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'all',       label: 'All',       countKey: 'all' },
  { value: 'created',   label: 'Pending',   countKey: 'created' },
  { value: 'confirmed', label: 'Confirmed', countKey: 'confirmed' },
  { value: 'held',      label: 'On Hold',   countKey: 'held' },
  { value: 'ready',     label: 'Ready',     countKey: 'ready' },
  { value: 'billed',    label: 'Billed',    countKey: 'billed' },
  { value: 'paid',      label: 'Prepaid',   countKey: 'paid' },
];

const TYPE_OPTIONS = [
  { value: 'all',      label: 'All',      countKey: 'all' },
  { value: 'dine_in',  label: 'Dine-in',  countKey: 'dine_in' },
  { value: 'takeaway', label: 'Takeaway', countKey: 'takeaway' },
  { value: 'delivery', label: 'Delivery', countKey: 'delivery' },
];

const SORT_OPTIONS = [
  { value: 'time_asc',    label: 'Time (oldest first)' },
  { value: 'time_desc',   label: 'Time (newest first)' },
  { value: 'amount_desc', label: 'Amount (high)' },
  { value: 'status',      label: 'Status' },
  { value: 'table',       label: 'Table No.' },
];

const SHIFT_OPTIONS = [
  { value: 'all',       label: 'All Time' },
  { value: 'current',   label: 'Current Shift' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch',     label: 'Lunch' },
  { value: 'dinner',    label: 'Dinner' },
];

function PillGroup({ options, value, onChange, counts = {} }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none shrink-0">
      {options.map((opt) => {
        const active = value === opt.value;
        const count = counts[opt.countKey];
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
              active
                ? 'border-transparent'
                : 'hover:opacity-80'
            }`}
            style={
              active
                ? { background: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                : { background: 'var(--bg-hover)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
            }
          >
            {opt.label}
            {count !== undefined && (
              <span className="font-mono tabular-nums text-[10px] opacity-75">({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SelectDropdown({ value, onChange, options, icon: Icon }) {
  return (
    <div className="relative shrink-0">
      {Icon && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }}>
          <Icon size={13} />
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-lg border py-1.5 pr-7 text-xs font-medium focus:outline-none cursor-pointer ${Icon ? 'pl-7' : 'pl-2.5'}`}
        style={{
          background: 'var(--bg-hover)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: 'var(--bg-card)' }}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--text-secondary)' }}
      />
    </div>
  );
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  statusFilter = 'all',
  onStatusFilter,
  typeFilter = 'all',
  onTypeFilter,
  sortBy = 'time_asc',
  onSortChange,
  viewMode = 'grid',
  onViewModeChange,
  shiftFilter = 'all',
  onShiftFilter,
  urgencyThreshold = 20,
  onUrgencyThreshold,
  selectedCount = 0,
  onBulkAction,
  counts = {},
}) {
  const [localThreshold, setLocalThreshold] = useState(String(urgencyThreshold));

  function handleThresholdBlur() {
    const parsed = parseInt(localThreshold, 10);
    if (!isNaN(parsed) && parsed >= 5 && parsed <= 60) {
      onUrgencyThreshold?.(parsed);
    } else {
      setLocalThreshold(String(urgencyThreshold));
    }
  }

  function handleThresholdKeyDown(e) {
    if (e.key === 'Enter') e.target.blur();
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: Search + Sort + Shift + View + Urgency */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-secondary)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search orders, tables, customers..."
            className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-xs focus:outline-none"
            style={{
              background: 'var(--bg-hover)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Sort */}
        <SelectDropdown
          value={sortBy}
          onChange={onSortChange}
          options={SORT_OPTIONS}
          icon={SlidersHorizontal}
        />

        {/* Shift */}
        <SelectDropdown
          value={shiftFilter}
          onChange={onShiftFilter}
          options={SHIFT_OPTIONS}
          icon={Clock}
        />

        {/* View mode toggle */}
        <div
          className="inline-flex rounded-lg border overflow-hidden shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {[
            { mode: 'grid', Icon: LayoutGrid },
            { mode: 'list', Icon: List },
          ].map(({ mode, Icon }) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className="p-1.5 transition-colors"
              style={
                viewMode === mode
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--bg-hover)', color: 'var(--text-secondary)' }
              }
              title={mode === 'grid' ? 'Grid view' : 'List view'}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        {/* Urgency threshold */}
        <div
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
        >
          <AlertTriangle size={12} style={{ color: 'var(--text-secondary)' }} />
          <span className="tracking-wider uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Alert after
          </span>
          <input
            type="number"
            value={localThreshold}
            min={5}
            max={60}
            onChange={(e) => setLocalThreshold(e.target.value)}
            onBlur={handleThresholdBlur}
            onKeyDown={handleThresholdKeyDown}
            className="w-9 bg-transparent text-xs font-mono tabular-nums text-center focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <span className="tracking-wider uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            min
          </span>
        </div>
      </div>

      {/* Row 2: Status pills + Type pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <Filter size={11} style={{ color: 'var(--text-secondary)' }} />
          <span className="tracking-wider uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Status
          </span>
        </div>
        <PillGroup options={STATUS_OPTIONS} value={statusFilter} onChange={onStatusFilter} counts={counts} />

        <div
          className="w-px h-5 shrink-0"
          style={{ background: 'var(--border)' }}
        />

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="tracking-wider uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Type
          </span>
        </div>
        <PillGroup options={TYPE_OPTIONS} value={typeFilter} onChange={onTypeFilter} counts={counts} />
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg border px-3 py-2"
          style={{ background: 'var(--bg-hover)', borderColor: 'var(--accent)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            <span className="font-mono tabular-nums font-semibold">{selectedCount}</span> selected
          </span>
          <div className="flex-1" />
          <button
            onClick={() => onBulkAction?.('cancel_selected')}
            className="px-3 py-1 rounded-lg border text-xs font-medium transition-colors hover:opacity-80 text-red-400 border-red-500/30 bg-red-500/10"
          >
            Cancel All
          </button>
          <button
            onClick={() => onBulkAction?.('bill_selected')}
            className="px-3 py-1 rounded-lg border text-xs font-medium transition-colors hover:opacity-80 text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
          >
            Bill All
          </button>
        </div>
      )}
    </div>
  );
}
