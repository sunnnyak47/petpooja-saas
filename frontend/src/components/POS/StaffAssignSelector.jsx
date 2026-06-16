import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import { User, ChevronDown, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Returns a deterministic color from the shared palette based on a string hash.
 * Used to give each staff member a consistent avatar background color.
 */
function hashColor(str) {
  const colors = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f97316'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Returns up to 2 uppercase initials from a full name string.
 */
function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * StaffAssignSelector — compact inline widget for the POS cart header.
 *
 * Props:
 *   outletId      {string}                          — used to scope staff list
 *   orderId       {string|null}                     — if set, PATCH the server on assign
 *   assignedStaff {{ id, full_name }|null}          — currently assigned staff
 *   onAssign      (staff: {id,full_name}|null)=>void — parent state updater
 */
export default function StaffAssignSelector({ outletId, orderId, assignedStaff, onAssign }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!popoverRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch staff list scoped to this outlet
  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-list', outletId],
    queryFn: async () => {
      const res = await api.get('/staff', { params: { outlet_id: outletId, limit: 50 } });
      // Backend may return { data: [...] } or a plain array
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      // listStaff returns StaffProfile rows — the name/id live under .user. Normalize to a
      // flat shape ({ id: user id, full_name, role }) so search/display work and the
      // assign endpoint (which expects a User id) gets the right id.
      return rows.map((s) => {
        const u = s.user ?? s;
        const roleObj = u.user_roles?.[0]?.role;
        return {
          id: u.id ?? s.user_id ?? s.id,
          full_name: u.full_name ?? s.full_name ?? 'Unnamed',
          role: roleObj?.display_name || roleObj?.name || s.designation || null,
        };
      });
    },
    enabled: !!outletId && open,
    staleTime: 60_000,
  });

  // Mutation: PATCH /orders/:id/assign-staff when an order already exists
  const assignMutation = useMutation({
    mutationFn: async (staffId) => {
      if (!orderId) return null;
      const res = await api.patch(`/orders/${orderId}/assign-staff`, { staff_id: staffId });
      return res.data;
    },
    onError: () => toast.error('Failed to assign staff'),
  });

  const handleSelect = async (staff) => {
    try {
      if (orderId) {
        await assignMutation.mutateAsync(staff.id);
      }
      onAssign(staff);
      setOpen(false);
      setSearch('');
      toast.success(`Assigned to ${staff.full_name}`);
    } catch {
      // error handled by mutation onError
    }
  };

  const handleUnassign = async () => {
    try {
      if (orderId) {
        await assignMutation.mutateAsync(null);
      }
      onAssign(null);
      setOpen(false);
      setSearch('');
      toast.success('Staff unassigned');
    } catch {
      // error handled by mutation onError
    }
  };

  const filtered = staffList.filter((s) =>
    s.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const triggerColor = assignedStaff ? hashColor(assignedStaff.id) : '#6b7280';
  const triggerInitials = assignedStaff ? getInitials(assignedStaff.full_name) : null;

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-800 hover:bg-surface-700 border border-surface-600 transition-colors text-sm"
        title="Assign staff member"
      >
        {assignedStaff ? (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
            style={{ backgroundColor: triggerColor }}
          >
            {triggerInitials}
          </span>
        ) : (
          <User className="w-4 h-4 text-surface-400 flex-shrink-0" />
        )}
        <span style={assignedStaff ? { color: 'var(--text-primary)' } : undefined} className={assignedStaff ? 'max-w-[100px] truncate' : 'text-surface-400'}>
          {assignedStaff ? assignedStaff.full_name : 'Assign Staff'}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-surface-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Search bar */}
          <div className="p-2 border-b border-surface-700">
            <div className="flex items-center gap-2 bg-surface-800 rounded-lg px-2 py-1.5">
              <Search className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff…"
                style={{ color: 'var(--text-primary)' }}
                className="flex-1 bg-transparent text-xs placeholder-surface-500 outline-none"
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-surface-400 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Staff list */}
          <div className="max-h-52 overflow-y-auto">
            {isLoading ? (
              <div className="py-6 text-center text-surface-500 text-xs">Loading staff…</div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-surface-500 text-xs">No staff found</div>
            ) : (
              filtered.map((staff) => {
                const color = hashColor(staff.id);
                const initials = getInitials(staff.full_name);
                const isAssigned = assignedStaff?.id === staff.id;

                return (
                  <button
                    key={staff.id}
                    type="button"
                    onClick={() => handleSelect({ id: staff.id, full_name: staff.full_name })}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-800 transition-colors text-left ${
                      isAssigned ? 'bg-surface-800' : ''
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {initials}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{staff.full_name}</p>
                      {staff.role && (
                        <p className="text-surface-500 text-[10px] truncate capitalize">
                          {staff.role.replace(/_/g, ' ').toLowerCase()}
                        </p>
                      )}
                    </div>
                    {isAssigned && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Unassign option */}
          {assignedStaff && (
            <div className="border-t border-surface-700">
              <button
                type="button"
                onClick={handleUnassign}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-800 transition-colors text-left"
              >
                <span className="w-7 h-7 rounded-full flex items-center justify-center bg-surface-700 flex-shrink-0">
                  <X className="w-3.5 h-3.5 text-surface-400" />
                </span>
                <span className="text-surface-400 text-xs">Unassign</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
