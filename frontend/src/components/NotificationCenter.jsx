/**
 * NotificationCenter — In-app notification bell + slide-out drawer
 * Used in DashboardLayout header
 */
import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import {
  Bell, X, CheckCheck, Info, AlertTriangle, Gift, Clock,
  Megaphone, ChevronRight, Package
} from 'lucide-react';

const TYPE_CFG = {
  INFO:        { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  icon: Info },
  WARNING:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: AlertTriangle },
  MAINTENANCE: { color: '#f87171', bg: 'rgba(239,68,68,0.15)',   icon: Clock },
  PROMO:       { color: '#4ade80', bg: 'rgba(34,197,94,0.15)',   icon: Gift },
  ANNOUNCEMENT:{ color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', icon: Megaphone },
};

function timeAgo(dt) {
  if (!dt) return '—';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('notif_read') || '[]')); }
    catch { return new Set(); }
  });
  const drawerRef = useRef(null);
  const { user } = useSelector(s => s.auth);
  const headOfficeId = user?.head_office_id;

  // Fetch announcements as notifications
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements-notif', headOfficeId],
    queryFn: () => {
      if (user?.role === 'super_admin') {
        return api.get('/superadmin/announcements').then(r => r.data).catch(() => []);
      }
      return api.get(`/superadmin/announcements/for-chain/${headOfficeId}`).then(r => r.data).catch(() => []);
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Fetch low-stock alerts
  const { data: lowStockItems = [] } = useQuery({
    queryKey: ['low-stock-notif'],
    queryFn: () => api.get('/inventory/low-stock').then(r => r.data || []).catch(() => []),
    enabled: !!user,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // Fetch pending KOTs (kitchen delays)
  const { data: dashData } = useQuery({
    queryKey: ['dashboard-notif'],
    queryFn: () => api.get('/reports/dashboard').then(r => r.data).catch(() => null),
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Build merged notification list
  const announcementNotifs = announcements.map(a => ({
    id: a.id,
    title: a.title,
    body: a.body || a.message || '',
    type: a.type || 'ANNOUNCEMENT',
    created_at: a.created_at || a.sent_at,
  }));

  const stockNotifs = lowStockItems.slice(0, 5).map(item => ({
    id: `stock-${item.id || item.inventory_item_id}`,
    title: `Low Stock: ${item.name || item.item_name}`,
    body: `${item.current_stock} ${item.unit || 'units'} remaining (min: ${item.min_threshold ?? item.minimum_stock ?? 0})`,
    type: 'WARNING',
    created_at: new Date().toISOString(),
  }));

  const operationalNotifs = [];
  if (dashData?.live?.pending_kots > 0) {
    operationalNotifs.push({
      id: 'pending-kots',
      title: `${dashData.live.pending_kots} Pending KOT${dashData.live.pending_kots > 1 ? 's' : ''}`,
      body: 'Kitchen orders waiting to be prepared',
      type: 'INFO',
      created_at: new Date().toISOString(),
    });
  }
  if (dashData?.today?.running_orders > 0) {
    operationalNotifs.push({
      id: 'running-orders',
      title: `${dashData.today.running_orders} Running Order${dashData.today.running_orders > 1 ? 's' : ''}`,
      body: 'Orders in progress awaiting payment',
      type: 'INFO',
      created_at: new Date().toISOString(),
    });
  }

  const notifications = [...announcementNotifs, ...stockNotifs, ...operationalNotifs];

  const unread = notifications.filter(n => !readIds.has(n.id));

  const markAllRead = () => {
    const newSet = new Set([...readIds, ...notifications.map(n => n.id)]);
    setReadIds(newSet);
    localStorage.setItem('notif_read', JSON.stringify([...newSet]));
  };

  const markRead = (id) => {
    const newSet = new Set([...readIds, id]);
    setReadIds(newSet);
    localStorage.setItem('notif_read', JSON.stringify([...newSet]));
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={drawerRef}>
      {/* Bell Button */}
      <button onClick={() => setOpen(o => !o)}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
        style={{ background: open ? 'var(--bg-secondary)' : 'transparent' }}>
        <Bell className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: '#ef4444', color: '#fff' }}>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="absolute right-0 top-10 w-80 rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Notifications</span>
              {unread.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                  {unread.length} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread.length > 0 && (
                <button onClick={markAllRead}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: '#818cf8' }}>
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)}>
                <X className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <Package className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No notifications</p>
              </div>
            ) : (
              notifications.map((n, i) => {
                const cfg = TYPE_CFG[n.type] || TYPE_CFG.ANNOUNCEMENT;
                const isRead = readIds.has(n.id);
                return (
                  <div key={n.id}
                    onClick={() => markRead(n.id)}
                    className="px-4 py-3 cursor-pointer transition-opacity hover:opacity-80"
                    style={{
                      borderBottom: i < notifications.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isRead ? 'transparent' : `${cfg.color}08`,
                    }}>
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: cfg.bg }}>
                        <cfg.icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{n.body}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{timeAgo(n.created_at)}</p>
                      </div>
                      {!isRead && (
                        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: cfg.color }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                {notifications.length} total notification{notifications.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
