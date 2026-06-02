import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api, { SOCKET_URL } from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Users, Plus, Trash2, Loader2, Edit3, Save, X, Move,
  Square, Circle, RectangleHorizontal, RotateCw, Layers,
  Eye, EyeOff, Ban, Palette, ChevronDown, Grid3X3,
  Maximize2, Minimize2, ZoomIn, ZoomOut, Check, ListChecks,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useCurrency } from '../hooks/useCurrency';

/* ─── constants ─────────────────────────────────────── */
const STATUS_CFG = {
  available: { border: '#22c55e', bg: 'rgba(34,197,94,0.12)', text: '#22c55e', label: 'Free' },
  occupied:  { border: '#3b82f6', bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', label: 'Busy' },
  reserved:  { border: '#6366f1', bg: 'rgba(99,102,241,0.12)', text: '#818cf8', label: 'Reserved' },
  blocked:   { border: '#52525b', bg: 'rgba(82,82,91,0.15)',   text: '#71717a', label: 'Inactive' },
  held:      { border: '#eab308', bg: 'rgba(234,179,8,0.12)',  text: '#facc15', label: 'Held' },
  part_paid: { border: '#f97316', bg: 'rgba(249,115,22,0.12)', text: '#fb923c', label: 'Part Paid' },
  dirty:     { border: '#ef4444', bg: 'rgba(239,68,68,0.10)',  text: '#f87171', label: 'Dirty' },
};

const SHAPES = [
  { id: 'square',    label: 'Square',    Icon: Square },
  { id: 'round',     label: 'Round',     Icon: Circle },
  { id: 'rectangle', label: 'Long',      Icon: RectangleHorizontal },
];

const AREA_COLORS = [
  '#e0e7ff','#dbeafe','#dcfce7','#fce7f3','#fef3c7',
  '#fed7aa','#cffafe','#f5f5f4','#d1fae5','#e9d5ff',
];

const GRID = 10;
const snap = (v) => Math.round(v / GRID) * GRID;

/* ─── elapsed timer ─────────────────────────────────── */
function ElapsedTimer({ timestamp }) {
  const [ms, setMs] = useState(Date.now() - new Date(timestamp).getTime());
  useEffect(() => {
    const i = setInterval(() => setMs(Date.now() - new Date(timestamp).getTime()), 1000);
    return () => clearInterval(i);
  }, [timestamp]);
  const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
  const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  return <>{h}:{m}:{s}</>;
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function TablesPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const qc = useQueryClient();
  const { symbol } = useCurrency();

  /* ── server data ── */
  const { data: serverTables = [], isLoading } = useQuery({
    queryKey: ['tables', outletId],
    queryFn: () => api.get(`/kitchen/tables?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });
  const { data: serverAreas = [] } = useQuery({
    queryKey: ['tableAreas', outletId],
    queryFn: () => api.get(`/kitchen/table-areas?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });

  /* ── editor state ── */
  const [editMode, setEditMode] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'layout'
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQ, setSearchQ]   = useState('');
  const [tables, setTables]     = useState([]);
  const [areas,  setAreas]      = useState([]);
  const [zoom,   setZoom]       = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [selected, setSelected] = useState(null); // { type:'table'|'area', id }
  const [dirty, setDirty]       = useState(false);

  /* ── modals ── */
  const [addTableOpen,   setAddTableOpen]   = useState(false);
  const [addAreaOpen,    setAddAreaOpen]     = useState(false);
  const [detailOpen,     setDetailOpen]      = useState(false);
  const [editPropOpen,   setEditPropOpen]    = useState(false);
  const [deleteOpen,     setDeleteOpen]      = useState(false);
  const [deleteAreaOpen, setDeleteAreaOpen]  = useState(false);
  const [voidOpen,       setVoidOpen]        = useState(false);

  /* ── form state ── */
  const [addForm, setAddForm]   = useState({ table_number: '', capacity: 4, shape: 'square', area_id: '' });
  const blankRow = () => ({ table_number: '', capacity: 4, shape: 'square', area_id: '' });
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState([blankRow(), blankRow(), blankRow()]);
  const [bulkGen, setBulkGen]   = useState({ prefix: 'T', start: 1, count: 5, capacity: 4, shape: 'square', area_id: '' });
  const [areaForm, setAreaForm] = useState({ name: '', color: '#e0e7ff' });
  const [editForm, setEditForm] = useState({});
  const [voidPin, setVoidPin]   = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [focusTable, setFocusTable] = useState(null); // table object for detail modal

  /* ── canvas drag ── */
  const canvasRef  = useRef(null);
  const dragging   = useRef(null); // { type, id, startX, startY, origX, origY, resizing }
  const resizing   = useRef(null);

  /* ── sync server → local state ── */
  useEffect(() => {
    if (!editMode) {
      setTables(serverTables.map(t => ({ ...t })));
      setAreas(serverAreas.map(a => ({ ...a })));
      setDirty(false);
    }
  }, [serverTables, serverAreas, editMode]);

  /* ── socket live updates (view mode only) ── */
  useEffect(() => {
    if (!outletId || editMode) return;
    const s = io(`${SOCKET_URL}/orders`, { auth: { token: localStorage.getItem('accessToken') }, transports: ['websocket'], withCredentials: true });
    s.emit('join_outlet', outletId);
    s.on('table_status_change', () => qc.invalidateQueries({ queryKey: ['tables', outletId] }));
    return () => s.disconnect();
  }, [outletId, qc, editMode]);

  /* ── mutations ── */
  const saveFloorPlanMut = useMutation({
    mutationFn: (payload) => api.post('/kitchen/floor-plan', payload),
    onSuccess: (res) => {
      toast.success('Floor plan saved!');
      qc.invalidateQueries({ queryKey: ['tables', outletId] });
      qc.invalidateQueries({ queryKey: ['tableAreas', outletId] });
      setEditMode(false);
      setDirty(false);
    },
    onError: (e) => toast.error(e.message || 'Save failed'),
  });

  const addTableMut = useMutation({
    mutationFn: (d) => api.post('/kitchen/tables', d),
    onSuccess: (res) => {
      toast.success('Table added!');
      qc.invalidateQueries({ queryKey: ['tables', outletId] });
      setAddTableOpen(false);
      setAddForm({ table_number: '', capacity: 4, shape: 'square', area_id: '' });
    },
    onError: (e) => toast.error(e.message || 'Failed to add table'),
  });

  const bulkAddMut = useMutation({
    mutationFn: (rows) => api.post('/kitchen/tables/bulk', { outlet_id: outletId, tables: rows }),
    onSuccess: (res) => {
      toast.success(res?.data?.message || res?.message || 'Tables created');
      qc.invalidateQueries({ queryKey: ['tables', outletId] });
      setBulkAddOpen(false);
      setBulkRows([blankRow(), blankRow(), blankRow()]);
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Failed to add tables'),
  });
  // Quick generator: create N sequential rows from a prefix + start number.
  const generateBulkRows = () => {
    const start = Number(bulkGen.start) || 1;
    const count = Math.max(1, Math.min(100, Number(bulkGen.count) || 1));
    const rows = Array.from({ length: count }, (_, i) => ({
      table_number: `${bulkGen.prefix || ''}${start + i}`,
      capacity: Number(bulkGen.capacity) || 4,
      shape: bulkGen.shape || 'square',
      area_id: bulkGen.area_id || '',
    }));
    setBulkRows(rows);
  };

  const deleteTableMut = useMutation({
    mutationFn: (id) => api.delete(`/kitchen/tables/${id}`),
    onSuccess: () => {
      toast.success('Table removed');
      qc.invalidateQueries({ queryKey: ['tables', outletId] });
      setDeleteOpen(false);
      setSelected(null);
    },
    onError: (e) => toast.error(e.message || 'Delete failed'),
  });

  const addAreaMut = useMutation({
    mutationFn: (d) => api.post('/kitchen/table-areas', d),
    onSuccess: () => {
      toast.success('Area added!');
      qc.invalidateQueries({ queryKey: ['tableAreas', outletId] });
      setAddAreaOpen(false);
      setAreaForm({ name: '', color: '#1e293b' });
    },
    onError: (e) => toast.error(e.message || 'Failed to add area'),
  });

  const deleteAreaMut = useMutation({
    mutationFn: (id) => api.delete(`/kitchen/table-areas/${id}`),
    onSuccess: () => {
      toast.success('Area removed');
      qc.invalidateQueries({ queryKey: ['tableAreas', outletId] });
      qc.invalidateQueries({ queryKey: ['tables', outletId] });
      setDeleteAreaOpen(false);
      setSelected(null);
    },
    onError: (e) => toast.error(e.message || 'Delete area failed'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/kitchen/tables/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['tables', outletId] });
      setDetailOpen(false);
    },
    onError: (e) => toast.error(e.message || 'Failed'),
  });

  /* ── multi-select: tick tables → bulk mark free / change status ── */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };

  const bulkStatusMut = useMutation({
    mutationFn: ({ ids, status }) => api.patch('/kitchen/tables/bulk-status', { table_ids: ids, status }),
    onSuccess: (res) => {
      toast.success(res?.data?.message || res?.message || 'Tables updated');
      qc.invalidateQueries({ queryKey: ['tables', outletId] });
      exitSelectMode();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Bulk update failed'),
  });
  const applyBulkStatus = (status) => {
    const ids = [...selectedIds];
    if (ids.length === 0) { toast.error('Select at least one table'); return; }
    bulkStatusMut.mutate({ ids, status });
  };

  /* ── save floor plan ── */
  const handleSave = () => {
    saveFloorPlanMut.mutate({
      outlet_id: outletId,
      tables: tables.map(t => ({
        id: t.id,
        pos_x: t.pos_x || 0,
        pos_y: t.pos_y || 0,
        width: t.width || 80,
        height: t.height || 80,
        shape: t.shape || 'square',
        rotation: t.rotation || 0,
        area_id: t.area_id || null,
        table_number: t.table_number,
        seating_capacity: t.seating_capacity,
      })),
      areas: areas.map(a => ({
        id: a.id,
        pos_x: a.pos_x || 0,
        pos_y: a.pos_y || 0,
        width: a.width || 400,
        height: a.height || 300,
        color: a.color || '#1e293b',
        name: a.name,
      })),
    });
  };

  /* ── void order ── */
  const handleVoid = async () => {
    if (!voidPin) return toast.error('PIN required');
    if (!voidReason) return toast.error('Reason required');
    const orderId = focusTable?.orders?.[0]?.id;
    if (!orderId) return toast.error('No active order');
    try {
      await api.post(`/orders/${orderId}/void`, { pin: voidPin, reason: voidReason });
      toast.success('Order voided');
      setVoidOpen(false);
      setDetailOpen(false);
      setVoidPin(''); setVoidReason('');
      qc.invalidateQueries({ queryKey: ['tables', outletId] });
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Void failed');
    }
  };

  /* ── drag logic ── */
  const getCanvasPos = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  }, [zoom]);

  const handleMouseDown = useCallback((e, type, id) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    const pos = getCanvasPos(e);
    const item = type === 'table'
      ? tables.find(t => t.id === id)
      : areas.find(a => a.id === id);
    if (!item) return;
    dragging.current = { type, id, startX: pos.x, startY: pos.y, origX: item.pos_x || 0, origY: item.pos_y || 0 };
    setSelected({ type, id });
  }, [editMode, tables, areas, getCanvasPos]);

  const handleResizeMouseDown = useCallback((e, type, id) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    const pos = getCanvasPos(e);
    const item = type === 'table'
      ? tables.find(t => t.id === id)
      : areas.find(a => a.id === id);
    if (!item) return;
    resizing.current = {
      type, id, startX: pos.x, startY: pos.y,
      origW: item.width || 80, origH: item.height || 80,
    };
    setSelected({ type, id });
  }, [editMode, tables, areas, getCanvasPos]);

  const handleMouseMove = useCallback((e) => {
    if (!editMode) return;
    const pos = getCanvasPos(e);

    if (dragging.current) {
      const { type, id, startX, startY, origX, origY } = dragging.current;
      const dx = pos.x - startX;
      const dy = pos.y - startY;
      const newX = Math.max(0, snap(origX + dx));
      const newY = Math.max(0, snap(origY + dy));
      if (type === 'table') {
        setTables(prev => prev.map(t => t.id === id ? { ...t, pos_x: newX, pos_y: newY } : t));
      } else {
        setAreas(prev => prev.map(a => a.id === id ? { ...a, pos_x: newX, pos_y: newY } : a));
      }
      setDirty(true);
    }

    if (resizing.current) {
      const { type, id, startX, startY, origW, origH } = resizing.current;
      const dx = pos.x - startX;
      const dy = pos.y - startY;
      const minSize = type === 'table' ? 50 : 100;
      const newW = Math.max(minSize, snap(origW + dx));
      const newH = Math.max(minSize, snap(origH + dy));
      if (type === 'table') {
        setTables(prev => prev.map(t => t.id === id ? { ...t, width: newW, height: newH } : t));
      } else {
        setAreas(prev => prev.map(a => a.id === id ? { ...a, width: newW, height: newH } : a));
      }
      setDirty(true);
    }
  }, [editMode, getCanvasPos]);

  const handleMouseUp = useCallback(() => {
    dragging.current = null;
    resizing.current = null;
  }, []);

  /* ── open table detail (view mode) ── */
  const openDetail = (table) => {
    if (editMode) { setSelected({ type: 'table', id: table.id }); return; }
    setFocusTable(table);
    setDetailOpen(true);
  };

  /* ── open edit properties ── */
  const openEditProp = () => {
    if (!selected) return;
    if (selected.type === 'table') {
      const t = tables.find(x => x.id === selected.id);
      if (t) { setEditForm({ table_number: t.table_number, seating_capacity: t.seating_capacity, shape: t.shape || 'square', area_id: t.area_id || '' }); setEditPropOpen(true); }
    } else {
      const a = areas.find(x => x.id === selected.id);
      if (a) { setEditForm({ name: a.name, color: a.color || '#1e293b' }); setEditPropOpen(true); }
    }
  };

  const applyEditProp = () => {
    if (!selected) return;
    if (selected.type === 'table') {
      setTables(prev => prev.map(t => t.id === selected.id
        ? { ...t, table_number: editForm.table_number, seating_capacity: Number(editForm.seating_capacity), shape: editForm.shape, area_id: editForm.area_id || null }
        : t
      ));
    } else {
      setAreas(prev => prev.map(a => a.id === selected.id
        ? { ...a, name: editForm.name, color: editForm.color }
        : a
      ));
    }
    setDirty(true);
    setEditPropOpen(false);
  };

  const rotateSelected = () => {
    if (!selected || selected.type !== 'table') return;
    setTables(prev => prev.map(t => t.id === selected.id
      ? { ...t, rotation: ((t.rotation || 0) + 45) % 360 }
      : t
    ));
    setDirty(true);
  };

  /* ── stats ── */
  const counts = {
    total:     tables.length,
    available: tables.filter(t => t.status === 'available').length,
    occupied:  tables.filter(t => t.status === 'occupied').length,
    held:      tables.filter(t => t.status === 'held').length,
  };

  /* ── selected item refs ── */
  const selectedTable = selected?.type === 'table' ? tables.find(t => t.id === selected.id) : null;
  const selectedArea  = selected?.type === 'area'  ? areas.find(a => a.id === selected.id) : null;

  /* ── Auto-grid fallback ──
     If a table was created without a saved layout (pos_x/pos_y are 0 or missing),
     give it a position in a clean grid so it doesn't stack at (0,0).
     The grid origin shifts past any existing zones so tables don't overlap them.
     Display-only — actual data is untouched until user saves in Edit mode. */
  const PER_ROW = 6;
  const CELL_W  = 130;    // wider gap between tables
  const CELL_H  = 130;
  // Find the bottom-right edge of all existing zones so we start the grid below/past them
  const zoneEdge = areas.reduce(
    (acc, a) => ({
      maxX: Math.max(acc.maxX, (a.pos_x || 0) + (a.width  || 400)),
      maxY: Math.max(acc.maxY, (a.pos_y || 0) + (a.height || 300)),
    }),
    { maxX: 0, maxY: 0 }
  );
  const GRID_OX = 40;
  // Place auto-grid BELOW any zones (with a small breathing gap) so tables never sit on top
  const GRID_OY = (areas.length > 0 ? zoneEdge.maxY + 32 : 40);
  const tablesForRender = tables.map((t, idx) => {
    const hasPosition = (Number(t.pos_x) > 0) || (Number(t.pos_y) > 0);
    if (hasPosition) return t;
    const col = idx % PER_ROW;
    const row = Math.floor(idx / PER_ROW);
    return {
      ...t,
      pos_x: GRID_OX + col * CELL_W,
      pos_y: GRID_OY + row * CELL_H,
      _auto_positioned: true,
    };
  });

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-full animate-fade-in" style={{ gap: 20 }}>

      {/* ── Page header — clean, editorial ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <Grid3X3 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>
              Floor management
            </span>
            <span className="w-1 h-1 rounded-full" style={{ background: 'var(--text-secondary)', opacity: 0.5 }} />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Live · synced now
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight leading-none mb-1.5"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            {editMode ? 'Editing floor plan' : 'Dining floor'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {editMode
              ? 'Drag tables to position them. Add zones to group sections. Save when you\'re happy.'
              : 'Tap a table to view its order, accept reservations or settle the bill.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!editMode ? (
            <>
              <button onClick={() => { setAreaForm({ name: '', color: '#e0e7ff' }); setAddAreaOpen(true); }}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; }}>
                <Layers className="w-3.5 h-3.5" /> Add Zone
              </button>
              <button onClick={() => setAddTableOpen(true)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; }}>
                <Plus className="w-3.5 h-3.5" /> Add Table
              </button>
              <button onClick={() => setBulkAddOpen(true)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; }}>
                <Layers className="w-3.5 h-3.5" /> Add Multiple
              </button>
              <button onClick={() => { setEditMode(true); setSelected(null); }}
                className="btn-primary flex items-center gap-1.5 text-xs px-3.5 py-2">
                <Edit3 className="w-3.5 h-3.5" /> Edit Layout
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setAddAreaOpen(true)}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <Layers className="w-3.5 h-3.5" /> Add Zone
              </button>
              <button onClick={() => setAddTableOpen(true)}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <Plus className="w-3.5 h-3.5" /> Add Table
              </button>
              <button onClick={() => {
                  setTables(serverTables.map(t => ({ ...t })));
                  setAreas(serverAreas.map(a => ({ ...a })));
                  setEditMode(false); setSelected(null); setDirty(false);
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                <X className="w-3.5 h-3.5" /> Discard
              </button>
              <button onClick={handleSave} disabled={saveFloorPlanMut.isPending}
                className="btn-primary flex items-center gap-1.5 text-xs px-3.5 py-2">
                {saveFloorPlanMut.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                Save Layout
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── KPI strip — clean light cards, clear hierarchy ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total tables', value: counts.total,     color: '#64748b', sub: 'across all zones' },
          { label: 'Available',    value: counts.available, color: '#10b981', sub: 'ready to seat' },
          { label: 'Occupied',     value: counts.occupied,  color: '#3b82f6', sub: 'with active orders' },
          { label: 'Held',         value: counts.held,      color: '#f59e0b', sub: 'awaiting payment' },
        ].map(s => (
          <div key={s.label}
            className="relative rounded-xl px-4 py-3 transition-all"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
              style={{ background: s.color, opacity: 0.85 }} />
            <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: 'var(--text-secondary)' }}>
              {s.label}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight"
                style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em', fontFeatureSettings: '"tnum"' }}>
                {s.value}
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--text-secondary)' }}>
                {s.sub}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar — status chips + search ── */}
      {!editMode && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* status chips */}
          <div className="flex items-center gap-1 flex-wrap p-1 rounded-lg"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {[
              { id: 'all',       label: 'All',       n: counts.total,     dot: '#94a3b8' },
              { id: 'available', label: 'Free',      n: counts.available, dot: '#10b981' },
              { id: 'occupied',  label: 'Busy',      n: counts.occupied,  dot: '#3b82f6' },
              { id: 'reserved',  label: 'Reserved',  n: tables.filter(t=>t.status==='reserved').length, dot: '#6366f1' },
              { id: 'held',      label: 'Held',      n: counts.held,      dot: '#f59e0b' },
            ].map(f => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                  style={{
                    background: active ? 'var(--bg-secondary)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: active ? '0 1px 3px rgba(15,23,42,0.05)' : 'none',
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.dot }} />
                  {f.label}
                  <span className="font-mono opacity-60">{f.n}</span>
                </button>
              );
            })}
          </div>
          {/* search + multi-select toggle */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by table number…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs outline-none transition-colors"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                minWidth: 200,
              }}
            />
            <button
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
              style={{
                background: selectMode ? 'var(--accent)' : 'var(--bg-card)',
                color: selectMode ? 'var(--accent-text, #fff)' : 'var(--text-secondary)',
                border: '1px solid ' + (selectMode ? 'var(--accent)' : 'var(--border)'),
              }}>
              <ListChecks className="w-3.5 h-3.5" />
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk action bar (visible in select mode) ── */}
      {!editMode && selectMode && (
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {selectedIds.size} selected
            </span>
            <button onClick={() => {
              const ids = tables.filter(t => statusFilter === 'all' || t.status === statusFilter).map(t => t.id);
              setSelectedIds(new Set(ids));
            }} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Select all</button>
            {selectedIds.size > 0 && (
              <button onClick={clearSelection} className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Clear</button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => applyBulkStatus('available')}
              disabled={selectedIds.size === 0 || bulkStatusMut.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
              style={{ background: '#10b981' }}>
              {bulkStatusMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Mark Free
            </button>
            <select
              onChange={(e) => { if (e.target.value) { applyBulkStatus(e.target.value); e.target.value = ''; } }}
              disabled={selectedIds.size === 0 || bulkStatusMut.isPending}
              defaultValue=""
              className="px-3 py-2 rounded-lg text-xs font-semibold outline-none disabled:opacity-50"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="" disabled>Set status…</option>
              <option value="available">Free</option>
              <option value="occupied">Busy</option>
              <option value="reserved">Reserved</option>
              <option value="dirty">Dirty</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Cards view — Toast/Square-style table grid grouped by zone ── */}
      {!editMode && (() => {
        // filter
        const filtered = tables.filter(t => {
          if (statusFilter !== 'all' && t.status !== statusFilter) return false;
          if (searchQ.trim()) {
            const q = searchQ.toLowerCase();
            const num = String(t.table_number || '').toLowerCase();
            if (!num.includes(q)) return false;
          }
          return true;
        });

        // group by area
        const byArea = {};
        filtered.forEach(t => {
          const key = t.area_id || 'unzoned';
          if (!byArea[key]) byArea[key] = [];
          byArea[key].push(t);
        });
        const areaOrder = [
          ...areas.filter(a => byArea[a.id]).map(a => ({ id: a.id, name: a.name, list: byArea[a.id] })),
          ...(byArea.unzoned ? [{ id: 'unzoned', name: 'Other tables', list: byArea.unzoned }] : []),
        ];

        if (filtered.length === 0) {
          return (
            <div className="card flex flex-col items-center text-center py-12">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)' }}>
                <Grid3X3 className="w-6 h-6" style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="text-base font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                No tables match
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Try a different filter or clear the search.
              </p>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-6">
            {areaOrder.map(group => {
              const isRealZone = group.id !== 'unzoned';
              return (
              <div key={group.id} className="group/zone">
                {/* zone header */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--text-secondary)' }}>
                    {group.name}
                  </h3>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {group.list.length} table{group.list.length !== 1 ? 's' : ''}
                  </span>
                  {/* Zone actions (only for real zones) */}
                  {isRealZone && (
                    <button
                      onClick={() => {
                        setSelected({ type: 'area', id: group.id });
                        setDeleteAreaOpen(true);
                      }}
                      title={`Delete zone "${group.name}"`}
                      className="opacity-0 group-hover/zone:opacity-100 transition-opacity ml-1 p-1 rounded-md"
                      style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* table cards grid */}
                <div className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  {group.list.map(t => {
                    const cfg = STATUS_CFG[t.status] || STATUS_CFG.available;
                    const order = t.orders?.[0];
                    const isBusy = t.status === 'occupied' || t.status === 'held' || t.status === 'part_paid';
                    const isChecked = selectedIds.has(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => (selectMode ? toggleSelect(t.id) : openDetail(t))}
                        className="relative text-left rounded-xl p-4 transition-all group overflow-hidden"
                        style={{
                          background: 'var(--bg-card)',
                          border: `1px solid ${selectMode && isChecked ? cfg.border : 'var(--border)'}`,
                          boxShadow: selectMode && isChecked ? `0 0 0 2px ${cfg.border}` : 'none',
                          minHeight: 130,
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = cfg.border + '70';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = (selectMode && isChecked) ? `0 0 0 2px ${cfg.border}` : `0 8px 22px -8px ${cfg.border}33`;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = (selectMode && isChecked) ? cfg.border : 'var(--border)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = (selectMode && isChecked) ? `0 0 0 2px ${cfg.border}` : 'none';
                        }}>
                        {/* top status stripe */}
                        <span className="absolute top-0 left-0 right-0 h-1" style={{ background: cfg.border }} />
                        {/* multi-select checkbox */}
                        {selectMode && (
                          <span className="absolute top-2 right-2 z-10 w-5 h-5 rounded-md flex items-center justify-center"
                            style={{ background: isChecked ? cfg.border : 'var(--bg-secondary)', border: `1.5px solid ${isChecked ? cfg.border : 'var(--border)'}` }}>
                            {isChecked && <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
                          </span>
                        )}

                        {/* header row */}
                        <div className="flex items-start justify-between mb-3 mt-1">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider"
                              style={{ color: 'var(--text-secondary)' }}>
                              Table
                            </div>
                            <div className="text-2xl font-black leading-none tracking-tight"
                              style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
                              {t.table_number}
                            </div>
                          </div>
                          {/* status pill */}
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                            style={{
                              background: cfg.border + '18',
                              color: cfg.border,
                              border: `1px solid ${cfg.border}33`,
                            }}>
                            {cfg.label}
                          </span>
                        </div>

                        {/* details row */}
                        <div className="flex items-center gap-3 text-[11px] mb-3"
                          style={{ color: 'var(--text-secondary)' }}>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>{t.seating_capacity || t.capacity || 2} seats</span>
                          </div>
                          {t.shape === 'round' && (
                            <div className="flex items-center gap-1">
                              <Circle className="w-3 h-3" />
                              <span>Round</span>
                            </div>
                          )}
                        </div>

                        {/* footer — live order info or CTA */}
                        {isBusy && order ? (
                          <div className="pt-3 flex items-center justify-between"
                            style={{ borderTop: '1px dashed var(--border)' }}>
                            <div className="min-w-0">
                              <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                <ElapsedTimer timestamp={order.created_at} /> elapsed
                              </div>
                              <div className="text-xs font-bold mt-0.5"
                                style={{ color: 'var(--text-primary)', fontFeatureSettings: '"tnum"' }}>
                                {symbol}{Number(order.grand_total || 0).toFixed(2)}
                              </div>
                            </div>
                            <div className="text-[10px] font-semibold"
                              style={{ color: cfg.border }}>
                              View →
                            </div>
                          </div>
                        ) : t.status === 'available' ? (
                          <div className="pt-3 text-[11px] font-semibold flex items-center justify-between"
                            style={{ borderTop: '1px dashed var(--border)', color: cfg.border }}>
                            <span>Ready to seat</span>
                            <span className="opacity-60">Open POS →</span>
                          </div>
                        ) : (
                          <div className="pt-3 text-[11px]"
                            style={{ borderTop: '1px dashed var(--border)', color: 'var(--text-secondary)' }}>
                            Tap to manage
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
            })}
          </div>
        );
      })()}

      {/* ── Canvas Toolbar (edit mode) ── */}
      {editMode && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1 rounded-xl border px-3 py-1.5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <span className="text-xs text-surface-400 mr-1">Zoom</span>
            <button onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))} className="p-1 rounded hover:bg-surface-700 text-surface-400"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="text-xs text-white w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))} className="p-1 rounded hover:bg-surface-700 text-surface-400"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button onClick={() => setZoom(1)} className="p-1 rounded hover:bg-surface-700 text-surface-400 ml-1 text-[10px] font-bold">1:1</button>
          </div>
          <button onClick={() => setShowGrid(g => !g)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${showGrid ? 'border-brand-500/50 bg-brand-500/10 text-brand-400' : 'border-surface-700 text-surface-500'}`}>
            <Grid3X3 className="w-3.5 h-3.5" /> Grid
          </button>

          {selected && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-surface-700">
              <span className="text-xs text-surface-500">
                {selected.type === 'table' ? `Table T${selectedTable?.table_number}` : `Zone: ${selectedArea?.name}`}
              </span>
              <button onClick={openEditProp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-700 text-xs text-surface-300 hover:bg-surface-700 transition-colors">
                <Edit3 className="w-3.5 h-3.5" /> Properties
              </button>
              {selected.type === 'table' && (
                <button onClick={rotateSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-700 text-xs text-surface-300 hover:bg-surface-700 transition-colors">
                  <RotateCw className="w-3.5 h-3.5" /> Rotate
                </button>
              )}
              <button onClick={() => selected.type === 'table' ? setDeleteOpen(true) : setDeleteAreaOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}

          {dirty && (
            <span className="ml-auto text-xs text-yellow-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
              Unsaved changes
            </span>
          )}
        </div>
      )}

      {/* ── Canvas — only shown during Edit Layout ── */}
      {editMode && (
      <div className="flex-1 rounded-2xl overflow-hidden relative"
        style={{
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          minHeight: 560,
          backgroundImage: 'radial-gradient(rgba(99,102,241,0.12) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}>

        {/* Inline legend — top-right corner */}
        {!editMode && tables.length > 0 && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-2 rounded-lg"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
            }}>
            {[
              { c: '#22c55e', l: 'Free'    },
              { c: '#3b82f6', l: 'Busy'    },
              { c: '#6366f1', l: 'Reserved'},
              { c: '#eab308', l: 'Held'    },
            ].map((x, i) => (
              <div key={x.l} className="flex items-center gap-1" style={{ marginLeft: i ? 8 : 0 }}>
                <span className="w-2 h-2 rounded-full" style={{ background: x.c }} />
                <span className="text-[10.5px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{x.l}</span>
              </div>
            ))}
          </div>
        )}


        {/* Empty state — first-time use */}
        {!isLoading && tables.length === 0 && areas.length === 0 && !editMode && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center max-w-sm px-6 pointer-events-auto">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.04))',
                  border: '1px solid rgba(99,102,241,0.18)',
                }}>
                <Grid3X3 className="w-6 h-6" style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="text-base font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                No tables yet
              </h3>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Add your first table to start tracking orders, reservations and occupancy across your dining floor.
              </p>
              <button
                onClick={() => setAddTableOpen(true)}
                className="btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2.5">
                <Plus className="w-4 h-4" /> Add first table
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="absolute inset-0 overflow-auto"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={(e) => { if (e.target === canvasRef.current) setSelected(null); }}
            style={{ cursor: editMode ? 'default' : 'default' }}
          >
            {/* inner scaled canvas */}
            <div style={{
              position: 'relative',
              width: `${1400 * zoom}px`,
              height: `${900 * zoom}px`,
              transformOrigin: '0 0',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
                width: 1400, height: 900,
              }}>

                {/* grid */}
                {showGrid && editMode && (
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <defs>
                      <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                        <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                  </svg>
                )}

                {/* ── Areas (zones) ── */}
                {areas.map(area => {
                  const isSel = selected?.type === 'area' && selected.id === area.id;
                  // Force every zone to a very subtle pastel — never dominate the canvas.
                  // In view mode they are barely visible (just a soft outline label).
                  // In edit mode they get a stronger tint so they can be repositioned/resized.
                  const baseColor = area.color || '#e0e7ff';
                  let bg, borderColor, borderStyle;
                  if (editMode) {
                    // Edit mode: visible but soft
                    bg = baseColor.startsWith('#') && baseColor.length === 7 ? baseColor + '26' : baseColor;
                    borderColor = isSel ? '#6366f1' : 'rgba(15,23,42,0.18)';
                    borderStyle = isSel ? 'solid' : 'dashed';
                  } else {
                    // View mode: barely there — just a label hint
                    bg = 'transparent';
                    borderColor = 'rgba(99,102,241,0.18)';
                    borderStyle = 'dashed';
                  }
                  return (
                    <div key={area.id}
                      style={{
                        position: 'absolute',
                        left: area.pos_x || 0,
                        top:  area.pos_y || 0,
                        width:  area.width  || 400,
                        height: area.height || 300,
                        background: bg,
                        border: `${isSel ? 2 : 1}px ${borderStyle} ${borderColor}`,
                        borderRadius: 16,
                        cursor: editMode ? 'move' : 'default',
                        userSelect: 'none',
                        zIndex: 1,
                        boxShadow: isSel ? '0 0 0 3px rgba(99,102,241,0.18)' : 'none',
                      }}
                      onMouseDown={editMode ? (e) => handleMouseDown(e, 'area', area.id) : undefined}
                    >
                      <div style={{
                        position: 'absolute', top: 10, left: 14,
                        fontSize: 10.5, fontWeight: 800,
                        color: editMode ? 'rgba(15,23,42,0.55)' : 'rgba(99,102,241,0.65)',
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                        pointerEvents: 'none',
                        background: editMode ? 'transparent' : 'rgba(255,255,255,0.9)',
                        padding: editMode ? 0 : '2px 8px',
                        borderRadius: 4,
                      }}>
                        {area.name}
                      </div>
                      {/* resize handle */}
                      {editMode && (
                        <div
                          style={{
                            position: 'absolute', bottom: 4, right: 4, width: 14, height: 14,
                            cursor: 'se-resize', borderRight: '2px solid rgba(255,255,255,0.3)',
                            borderBottom: '2px solid rgba(255,255,255,0.3)', borderRadius: 2,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'area', area.id)}
                        />
                      )}
                    </div>
                  );
                })}

                {/* ── Tables ── */}
                {tablesForRender.map(table => {
                  const cfg   = STATUS_CFG[table.status] || STATUS_CFG.available;
                  const order = table.orders?.[0];
                  const isSel = selected?.type === 'table' && selected.id === table.id;
                  const w     = table.width  || 80;
                  const h     = table.height || 80;
                  const isRound = table.shape === 'round';
                  const rot   = table.rotation || 0;

                  return (
                    <div key={table.id}
                      style={{
                        position: 'absolute',
                        left: table.pos_x || 0,
                        top:  table.pos_y || 0,
                        width: w,
                        height: h,
                        cursor: editMode ? 'move' : 'pointer',
                        userSelect: 'none',
                        zIndex: isSel ? 10 : 2,
                        transform: `rotate(${rot}deg)`,
                        transformOrigin: 'center center',
                        transition: dragging.current?.id === table.id ? 'none' : 'box-shadow 0.15s',
                      }}
                      onMouseDown={editMode ? (e) => handleMouseDown(e, 'table', table.id) : undefined}
                      onClick={!editMode ? () => openDetail(table) : undefined}
                    >
                      {/* table body */}
                      <div style={{
                        width: '100%', height: '100%',
                        background: cfg.bg,
                        border: `2.5px solid ${isSel ? '#3b82f6' : cfg.border}`,
                        borderRadius: isRound ? '50%' : 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: isSel
                          ? '0 0 0 3px rgba(59,130,246,0.4), 0 4px 20px rgba(0,0,0,0.4)'
                          : '0 2px 10px rgba(0,0,0,0.3)',
                        transition: 'box-shadow 0.15s',
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        <span style={{ fontSize: w < 70 ? 12 : 14, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                          T{table.table_number}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: cfg.text, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                          {cfg.label}
                        </span>
                        {order && (
                          <div style={{ marginTop: 3, textAlign: 'center' }}>
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                              <ElapsedTimer timestamp={order.created_at} />
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                              {symbol}{Number(order.grand_total || 0).toFixed(0)}
                            </span>
                          </div>
                        )}
                        {!order && table.seating_capacity && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.3)' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{table.seating_capacity}</span>
                          </div>
                        )}
                        {/* held badge */}
                        {table.status === 'held' && (
                          <div style={{
                            position: 'absolute', top: 2, left: 4,
                            fontSize: 7, fontWeight: 800, color: '#000',
                            background: '#eab308', borderRadius: 4, padding: '1px 4px',
                            textTransform: 'uppercase',
                          }}>HELD</div>
                        )}
                      </div>

                      {/* chair indicators (non-round) */}
                      {!isRound && !editMode && (
                        <>
                          <div style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)', width: 16, height: 6, background: cfg.border + '80', borderRadius: '3px 3px 0 0' }} />
                          <div style={{ position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)', width: 16, height: 6, background: cfg.border + '80', borderRadius: '0 0 3px 3px' }} />
                        </>
                      )}

                      {/* resize handle (edit mode) */}
                      {editMode && (
                        <div
                          style={{
                            position: 'absolute', bottom: 2, right: 2, width: 12, height: 12,
                            cursor: 'se-resize', zIndex: 20,
                            borderRight: '2px solid rgba(255,255,255,0.5)',
                            borderBottom: '2px solid rgba(255,255,255,0.5)',
                            borderRadius: 2,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'table', table.id)}
                        />
                      )}
                    </div>
                  );
                })}

                {/* empty state */}
                {tables.length === 0 && !isLoading && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(255,255,255,0.2)',
                  }}>
                    <Grid3X3 style={{ width: 48, height: 48, marginBottom: 12 }} />
                    <p style={{ fontSize: 14, fontWeight: 600 }}>No tables yet</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Click "Add Table" to get started</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Legend moved to top-right (light themed) — bottom legend removed */}
      </div>
      )}

      {/* ══════════ MODALS ══════════ */}

      {/* Add Table */}
      <Modal isOpen={addTableOpen} onClose={() => setAddTableOpen(false)} title="Add New Table" size="sm">
        <form onSubmit={e => {
          e.preventDefault();
          addTableMut.mutate({
            outlet_id: outletId,
            table_number: addForm.table_number,
            capacity: Number(addForm.capacity),
            shape: addForm.shape,
            area_id: addForm.area_id || null,
          });
        }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Table Number / Name *</label>
            <input required type="text" className="input w-full" placeholder="e.g. 1, A1, Bar-2"
              value={addForm.table_number} onChange={e => setAddForm(f => ({ ...f, table_number: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Seating Capacity</label>
            <input required type="number" min="1" max="50" className="input w-full"
              value={addForm.capacity} onChange={e => setAddForm(f => ({ ...f, capacity: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-2">Shape</label>
            <div className="flex gap-2">
              {SHAPES.map(s => (
                <button type="button" key={s.id}
                  onClick={() => setAddForm(f => ({ ...f, shape: s.id }))}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all text-xs font-medium ${addForm.shape === s.id ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-surface-700 text-surface-400 hover:bg-surface-800'}`}>
                  <s.Icon className="w-5 h-5" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {serverAreas.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1">Zone (optional)</label>
              <select className="input w-full" value={addForm.area_id} onChange={e => setAddForm(f => ({ ...f, area_id: e.target.value }))}>
                <option value="">No Zone</option>
                {serverAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setAddTableOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={addTableMut.isPending} className="btn-primary flex-1">
              {addTableMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Add Table'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Multiple Tables */}
      <Modal isOpen={bulkAddOpen} onClose={() => setBulkAddOpen(false)} title="Add Multiple Tables" size="xl">
        <div className="space-y-4">
          {/* Quick generator */}
          <div className="rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>Quick generate</p>
            <div className="flex flex-wrap items-end gap-2">
              <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Prefix</label>
                <input className="input" style={{ width: 70 }} value={bulkGen.prefix} onChange={e => setBulkGen(g => ({ ...g, prefix: e.target.value }))} placeholder="T" /></div>
              <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Start #</label>
                <input type="number" className="input" style={{ width: 70 }} value={bulkGen.start} onChange={e => setBulkGen(g => ({ ...g, start: e.target.value }))} /></div>
              <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>How many</label>
                <input type="number" min="1" max="100" className="input" style={{ width: 80 }} value={bulkGen.count} onChange={e => setBulkGen(g => ({ ...g, count: e.target.value }))} /></div>
              <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Seats</label>
                <input type="number" min="1" max="50" className="input" style={{ width: 70 }} value={bulkGen.capacity} onChange={e => setBulkGen(g => ({ ...g, capacity: e.target.value }))} /></div>
              <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Shape</label>
                <select className="input" value={bulkGen.shape} onChange={e => setBulkGen(g => ({ ...g, shape: e.target.value }))}>
                  {SHAPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select></div>
              <button type="button" onClick={generateBulkRows} className="btn-secondary btn-sm">Generate rows</button>
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>Generate fills the list below — you can still edit each row's config individually.</p>
          </div>

          {/* Editable rows */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold px-1" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ flex: 2 }}>Table number *</span><span style={{ width: 64 }}>Seats</span><span style={{ width: 110 }}>Shape</span>
              {serverAreas.length > 0 && <span style={{ width: 120 }}>Zone</span>}<span style={{ width: 28 }} />
            </div>
            {bulkRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input" style={{ flex: 2 }} placeholder={`e.g. T${i + 1}`} value={row.table_number}
                  onChange={e => setBulkRows(rs => rs.map((r, j) => j === i ? { ...r, table_number: e.target.value } : r))} />
                <input type="number" min="1" max="50" className="input" style={{ width: 64 }} value={row.capacity}
                  onChange={e => setBulkRows(rs => rs.map((r, j) => j === i ? { ...r, capacity: e.target.value } : r))} />
                <select className="input" style={{ width: 110 }} value={row.shape}
                  onChange={e => setBulkRows(rs => rs.map((r, j) => j === i ? { ...r, shape: e.target.value } : r))}>
                  {SHAPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                {serverAreas.length > 0 && (
                  <select className="input" style={{ width: 120 }} value={row.area_id}
                    onChange={e => setBulkRows(rs => rs.map((r, j) => j === i ? { ...r, area_id: e.target.value } : r))}>
                    <option value="">No Zone</option>
                    {serverAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => setBulkRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)}
                  className="p-1.5 rounded-md" style={{ color: '#ef4444' }} title="Remove row">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={() => setBulkRows(rs => [...rs, blankRow()])} className="btn-ghost text-xs flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add row
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {bulkRows.filter(r => String(r.table_number).trim()).length} ready
              </span>
              <button type="button" onClick={() => setBulkAddOpen(false)} className="btn-ghost">Cancel</button>
              <button type="button" disabled={bulkAddMut.isPending || bulkRows.every(r => !String(r.table_number).trim())}
                onClick={() => bulkAddMut.mutate(bulkRows.filter(r => String(r.table_number).trim()).map(r => ({ table_number: r.table_number, capacity: Number(r.capacity) || 4, shape: r.shape, area_id: r.area_id || null })))}
                className="btn-primary">
                {bulkAddMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Tables'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Add Zone */}
      <Modal isOpen={addAreaOpen} onClose={() => setAddAreaOpen(false)} title="Add Zone / Area" size="sm">
        <form onSubmit={e => {
          e.preventDefault();
          addAreaMut.mutate({ outlet_id: outletId, name: areaForm.name, color: areaForm.color, pos_x: 20, pos_y: 20 });
        }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Zone Name *</label>
            <input required type="text" className="input w-full" placeholder="e.g. Indoor, Terrace, Bar, Private"
              value={areaForm.name} onChange={e => setAreaForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-2">Zone Color</label>
            <div className="flex gap-2 flex-wrap">
              {AREA_COLORS.map(c => (
                <button type="button" key={c} onClick={() => setAreaForm(f => ({ ...f, color: c }))}
                  style={{ background: c, border: `2px solid ${areaForm.color === c ? '#3b82f6' : 'transparent'}` }}
                  className="w-8 h-8 rounded-lg transition-all hover:scale-110" />
              ))}
              <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border border-surface-700"
                value={areaForm.color} onChange={e => setAreaForm(f => ({ ...f, color: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setAddAreaOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={addAreaMut.isPending} className="btn-primary flex-1">
              {addAreaMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Add Zone'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Properties (table or area) */}
      <Modal isOpen={editPropOpen} onClose={() => setEditPropOpen(false)} title={selected?.type === 'table' ? 'Table Properties' : 'Zone Properties'} size="sm">
        <div className="space-y-4">
          {selected?.type === 'table' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">Table Number</label>
                <input type="text" className="input w-full" value={editForm.table_number || ''}
                  onChange={e => setEditForm(f => ({ ...f, table_number: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">Capacity</label>
                <input type="number" min="1" max="50" className="input w-full" value={editForm.seating_capacity || 4}
                  onChange={e => setEditForm(f => ({ ...f, seating_capacity: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">Shape</label>
                <div className="flex gap-2">
                  {SHAPES.map(s => (
                    <button type="button" key={s.id}
                      onClick={() => setEditForm(f => ({ ...f, shape: s.id }))}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all text-xs font-medium ${editForm.shape === s.id ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-surface-700 text-surface-400 hover:bg-surface-800'}`}>
                      <s.Icon className="w-5 h-5" />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">Zone</label>
                <select className="input w-full" value={editForm.area_id || ''} onChange={e => setEditForm(f => ({ ...f, area_id: e.target.value }))}>
                  <option value="">No Zone</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">Zone Name</label>
                <input type="text" className="input w-full" value={editForm.name || ''}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">Zone Color</label>
                <div className="flex gap-2 flex-wrap">
                  {AREA_COLORS.map(c => (
                    <button type="button" key={c} onClick={() => setEditForm(f => ({ ...f, color: c }))}
                      style={{ background: c, border: `2px solid ${editForm.color === c ? '#3b82f6' : 'transparent'}` }}
                      className="w-8 h-8 rounded-lg transition-all hover:scale-110" />
                  ))}
                  <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border border-surface-700"
                    value={editForm.color || '#1e293b'} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setEditPropOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button onClick={applyEditProp} className="btn-primary flex-1">Apply</button>
          </div>
        </div>
      </Modal>

      {/* Table Detail (view mode) */}
      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={`Table T${focusTable?.table_number}`} size="sm">
        {focusTable && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Status',   value: (STATUS_CFG[focusTable.status] || STATUS_CFG.available).label, color: (STATUS_CFG[focusTable.status] || STATUS_CFG.available).text },
                { label: 'Capacity', value: `${focusTable.seating_capacity || focusTable.capacity || 4} pax`, color: '#94a3b8' },
                { label: 'Zone',     value: focusTable.area?.name || '—', color: '#94a3b8' },
              ].map(d => (
                <div key={d.label} className="bg-surface-800/60 rounded-xl p-3 text-center border border-surface-700">
                  <p className="text-xs text-surface-500 mb-1">{d.label}</p>
                  <p className="text-sm font-bold" style={{ color: d.color }}>{d.value}</p>
                </div>
              ))}
            </div>

            {focusTable.orders?.[0] && (
              <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-3">
                <p className="text-xs text-surface-400 mb-1">Active Order</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">#{focusTable.orders[0].order_number}</span>
                  <span className="text-sm font-bold text-brand-400">{symbol}{Number(focusTable.orders[0].grand_total || 0).toFixed(2)}</span>
                </div>
                <p className="text-xs text-surface-500 mt-1"><ElapsedTimer timestamp={focusTable.orders[0].created_at} /> elapsed</p>
              </div>
            )}

            {focusTable.orders?.[0] && (
              <button onClick={() => { setDetailOpen(false); setVoidOpen(true); }}
                className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-bold flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors text-sm">
                <Ban className="w-4 h-4" /> Void Order
              </button>
            )}

            <div className="border-t border-surface-800 pt-3">
              <p className="text-xs text-surface-500 font-bold uppercase mb-2">Manual Status Override</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => statusMut.mutate({ id: focusTable.id, status: 'available' })}
                  className="py-2 rounded-lg border border-surface-700 text-sm text-success-400 hover:bg-success-500/10 transition-colors">
                  Mark Free
                </button>
                <button onClick={() => statusMut.mutate({ id: focusTable.id, status: 'reserved' })}
                  className="py-2 rounded-lg border border-surface-700 text-sm text-blue-400 hover:bg-blue-500/10 transition-colors">
                  Reserve
                </button>
                <button onClick={() => statusMut.mutate({ id: focusTable.id, status: 'dirty' })}
                  className="py-2 rounded-lg border border-surface-700 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                  Mark Dirty
                </button>
                <button onClick={() => statusMut.mutate({ id: focusTable.id, status: 'blocked' })}
                  className="py-2 rounded-lg border border-surface-700 text-sm text-surface-400 hover:bg-surface-700 transition-colors">
                  Block
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Void Order Modal */}
      <Modal isOpen={voidOpen} onClose={() => setVoidOpen(false)} title="Void Order — Manager PIN" size="sm">
        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-sm text-surface-400 mb-1">Manager PIN</label>
            <input type="password" maxLength={4} autoFocus
              className="input w-full text-center text-3xl tracking-[1em]" placeholder="••••"
              value={voidPin} onChange={e => setVoidPin(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-surface-400 mb-1">Reason</label>
            <textarea className="input w-full h-16 resize-none text-sm" placeholder="Customer left, wrong order..."
              value={voidReason} onChange={e => setVoidReason(e.target.value)} />
          </div>
          <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-xs text-red-400 flex items-start gap-2">
            <Ban className="w-4 h-4 shrink-0 mt-0.5" />
            <p>This action is permanent and logged in the audit trail.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setVoidOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button onClick={handleVoid} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors">Confirm Void</button>
          </div>
        </div>
      </Modal>

      {/* Delete Table */}
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteTableMut.mutate(selected?.id)}
        title="Remove Table"
        message={`Remove Table T${selectedTable?.table_number}? This cannot be undone.`}
        isLoading={deleteTableMut.isPending}
      />

      {/* Delete Area */}
      <ConfirmDialog
        isOpen={deleteAreaOpen}
        onClose={() => setDeleteAreaOpen(false)}
        onConfirm={() => deleteAreaMut.mutate(selected?.id)}
        title="Remove Zone"
        message={`Remove zone "${selectedArea?.name}"? Tables in this zone will be unassigned.`}
        isLoading={deleteAreaMut.isPending}
      />
    </div>
  );
}
