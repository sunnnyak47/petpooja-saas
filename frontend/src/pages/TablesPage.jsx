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
  Maximize2, Minimize2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

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
  '#1e293b','#172554','#14532d','#3b0764','#450a0a',
  '#422006','#0c4a6e','#1c1917','#064e3b','#312e81',
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
  const [areaForm, setAreaForm] = useState({ name: '', color: '#1e293b' });
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
    const s = io(`${SOCKET_URL}/orders`, { transports: ['websocket'], withCredentials: true });
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

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-full space-y-0 animate-fade-in">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="page-title mb-0">Floor Plan</h1>
          {/* status pills */}
          {[
            { label: 'Total',     value: counts.total,     color: '#94a3b8' },
            { label: 'Available', value: counts.available, color: '#22c55e' },
            { label: 'Occupied',  value: counts.occupied,  color: '#3b82f6' },
            { label: 'Held',      value: counts.held,      color: '#eab308' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold"
              style={{ borderColor: s.color + '40', background: s.color + '15', color: s.color }}>
              <span className="text-base">{s.value}</span>
              <span className="opacity-70">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!editMode ? (
            <>
              <button onClick={() => { setEditMode(true); setSelected(null); }}
                className="btn-primary flex items-center gap-2 text-sm">
                <Edit3 className="w-4 h-4" /> Edit Layout
              </button>
              <button onClick={() => setAddTableOpen(true)}
                className="btn-surface flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Add Table
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setAddAreaOpen(true)}
                className="btn-surface flex items-center gap-2 text-sm">
                <Layers className="w-4 h-4" /> Add Zone
              </button>
              <button onClick={() => setAddTableOpen(true)}
                className="btn-surface flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Add Table
              </button>
              <button onClick={handleSave} disabled={saveFloorPlanMut.isPending}
                className="btn-primary flex items-center gap-2 text-sm">
                {saveFloorPlanMut.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                Save Layout
              </button>
              <button onClick={() => {
                  setTables(serverTables.map(t => ({ ...t })));
                  setAreas(serverAreas.map(a => ({ ...a })));
                  setEditMode(false); setSelected(null); setDirty(false);
                }}
                className="btn-ghost flex items-center gap-2 text-sm text-red-400">
                <X className="w-4 h-4" /> Discard
              </button>
            </>
          )}
        </div>
      </div>

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

      {/* ── Canvas ── */}
      <div className="flex-1 rounded-2xl border overflow-hidden relative"
        style={{ borderColor: 'var(--border)', background: '#0f172a', minHeight: 520 }}>

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
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
                  return (
                    <div key={area.id}
                      style={{
                        position: 'absolute',
                        left: area.pos_x || 0,
                        top:  area.pos_y || 0,
                        width:  area.width  || 400,
                        height: area.height || 300,
                        background: (area.color || '#1e293b') + 'cc',
                        border: `2px ${isSel ? 'solid' : 'dashed'} ${isSel ? '#3b82f6' : (area.color || '#334155')}`,
                        borderRadius: 16,
                        cursor: editMode ? 'move' : 'default',
                        userSelect: 'none',
                        zIndex: 1,
                        boxShadow: isSel ? '0 0 0 3px rgba(59,130,246,0.3)' : 'none',
                      }}
                      onMouseDown={editMode ? (e) => handleMouseDown(e, 'area', area.id) : undefined}
                    >
                      <div style={{
                        position: 'absolute', top: 8, left: 12,
                        fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        pointerEvents: 'none',
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
                {tables.map(table => {
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
                              ₹{Number(order.grand_total || 0).toFixed(0)}
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

        {/* Legend */}
        {!editMode && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 8,
            background: 'rgba(15,23,42,0.85)', borderRadius: 10, padding: '6px 10px',
            backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {Object.entries(STATUS_CFG).slice(0, 5).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: v.border, opacity: 0.85 }} />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{v.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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
                  <span className="text-sm font-bold text-brand-400">₹{Number(focusTable.orders[0].grand_total || 0).toFixed(2)}</span>
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
