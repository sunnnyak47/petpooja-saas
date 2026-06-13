/**
 * SupportTicketsPage — Chain support inbox for superadmin
 * Route: /support-tickets
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  MessageSquare, AlertCircle, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, X, Send, Search, Plus, Filter, ArrowLeft, Shield
} from 'lucide-react';

const STATUS_CFG = {
  OPEN:        { bg: 'color-mix(in srgb, #ef4444 14%, transparent)',  color: '#ef4444', label: 'Open' },
  IN_PROGRESS: { bg: 'color-mix(in srgb, #f59e0b 14%, transparent)',  color: '#f59e0b', label: 'In Progress' },
  RESOLVED:    { bg: 'color-mix(in srgb, #16a34a 14%, transparent)',  color: '#16a34a', label: 'Resolved' },
  CLOSED:      { bg: 'color-mix(in srgb, #64748b 14%, transparent)',  color: '#64748b', label: 'Closed' },
};

const PRIORITY_CFG = {
  LOW:    { color: '#64748b', bg: 'color-mix(in srgb, #64748b 14%, transparent)' },
  MEDIUM: { color: '#64748b', bg: 'color-mix(in srgb, #64748b 14%, transparent)' },
  HIGH:   { color: '#f59e0b', bg: 'color-mix(in srgb, #f59e0b 14%, transparent)' },
  URGENT: { color: '#ef4444', bg: 'color-mix(in srgb, #ef4444 14%, transparent)' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.OPEN;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CFG[priority] || PRIORITY_CFG.MEDIUM;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
      {priority}
    </span>
  );
}

function timeAgo(dt) {
  if (!dt) return '—';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NewTicketForm({ onClose, onCreated }) {
  const [form, setForm] = useState({ chain_name: '', email: '', subject: '', body: '', priority: 'MEDIUM' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.subject || !form.body) return;
    setLoading(true);
    try {
      const res = await api.post('/superadmin/support-tickets', form);
      onCreated(res.data);
      onClose();
    } catch(e) { alert(e?.response?.data?.message || 'Failed to create ticket'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Create Support Ticket</h3>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Chain Name</label>
              <input value={form.chain_name} onChange={e => setForm(f => ({ ...f, chain_name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Subject *</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Description *</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={4} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              {Object.keys(PRIORITY_CFG).map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
            {loading ? <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketDetail({ ticket, onClose, onUpdate }) {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await api.post(`/superadmin/support-tickets/${ticket.id}/reply`, { from: 'admin', body: replyText });
      setReplyText('');
      qc.invalidateQueries(['support-tickets']);
      onUpdate();
    } catch(e) { alert('Failed to send reply'); }
    setSending(false);
  };

  const handleStatus = async (status) => {
    try {
      await api.patch(`/superadmin/support-tickets/${ticket.id}`, { status });
      qc.invalidateQueries(['support-tickets']);
      onUpdate();
    } catch(e) { alert('Failed to update status'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="ml-auto w-full max-w-2xl h-full flex flex-col"
        style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-start gap-3 p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} className="mt-0.5 p-1 rounded hover:opacity-70">
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{ticket.id}</p>
            <h3 className="font-semibold mt-0.5 truncate" style={{ color: 'var(--text-primary)' }}>{ticket.subject}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ticket.chain_name} · {timeAgo(ticket.created_at)}</span>
            </div>
          </div>
          <select value={ticket.status} onChange={e => handleStatus(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg outline-none"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {Object.keys(STATUS_CFG).map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
          </select>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Original */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{ticket.chain_name || 'Restaurant'}</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{timeAgo(ticket.created_at)}</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{ticket.body}</p>
          </div>

          {/* Replies */}
          {(ticket.replies || []).map((r, i) => (
            <div key={i} className={`p-4 rounded-xl ${r.from === 'admin' ? 'ml-6' : 'mr-6'}`}
              style={{
                background: r.from === 'admin' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-primary)',
                border: `1px solid ${r.from === 'admin' ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border)'}`,
              }}>
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: r.from === 'admin' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {r.from === 'admin' ? <><Shield size={12} /> Support Team</> : ticket.chain_name}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{timeAgo(r.created_at)}</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{r.body}</p>
            </div>
          ))}
        </div>

        {/* Reply box */}
        {ticket.status !== 'CLOSED' && (
          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              rows={3} placeholder="Type your reply…"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none mb-3"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <div className="flex justify-end">
              <button onClick={handleReply} disabled={sending || !replyText.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                {sending ? <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Send className="w-4 h-4" />}
                Send Reply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupportTicketsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const { data: tickets = [], isLoading, refetch } = useQuery({
    queryKey: ['support-tickets', statusFilter, search],
    queryFn: () => api.get('/superadmin/support-tickets', { params: { status: statusFilter !== 'ALL' ? statusFilter : undefined, search: search || undefined } }).then(r => r.data),
    staleTime: 30_000,
  });

  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const inProgressCount = tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const urgentCount = tickets.filter(t => t.priority === 'URGENT').length;

  const filtered = tickets.filter(t => priorityFilter === 'ALL' || t.priority === priorityFilter);
  const selectedTicket = selected ? tickets.find(t => t.id === selected) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Support Tickets</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Manage support requests from restaurant chains</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open Tickets', value: openCount, color: '#ef4444', icon: AlertCircle },
          { label: 'In Progress', value: inProgressCount, color: '#f59e0b', icon: Clock },
          { label: 'Urgent', value: urgentCount, color: '#ef4444', icon: AlertTriangle },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${c.color}20` }}>
              <c.icon className="w-5 h-5" style={{ color: c.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{c.value}</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        {['ALL', ...Object.keys(STATUS_CFG)].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: statusFilter === s ? 'var(--accent)' : 'var(--bg-secondary)',
              border: `1px solid ${statusFilter === s ? 'var(--accent)' : 'var(--border)'}`,
              color: statusFilter === s ? 'var(--accent-text)' : 'var(--text-secondary)',
            }}>{s}</button>
        ))}
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="ALL">All Priorities</option>
          {Object.keys(PRIORITY_CFG).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Ticket List */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <MessageSquare className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No tickets found</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {tickets.length === 0 ? 'No support tickets yet' : 'Try adjusting filters'}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((t, i) => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className="w-full text-left px-5 py-4 flex items-start gap-4 hover:opacity-80 transition-opacity"
                style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                  style={{ background: PRIORITY_CFG[t.priority]?.bg || 'color-mix(in srgb, var(--accent) 12%, transparent)', color: PRIORITY_CFG[t.priority]?.color || 'var(--accent)' }}>
                  {t.chain_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{t.subject}</p>
                    <StatusBadge status={t.status} />
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {t.chain_name} · {t.email} · {timeAgo(t.created_at)}
                  </p>
                  <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>{t.body}</p>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  {(t.replies?.length > 0) && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                      {t.replies.length} replies
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
        Showing {filtered.length} of {tickets.length} tickets
      </p>

      {selectedTicket && (
        <TicketDetail ticket={selectedTicket} onClose={() => setSelected(null)} onUpdate={refetch} />
      )}
      {showNew && (
        <NewTicketForm onClose={() => setShowNew(false)} onCreated={() => { qc.invalidateQueries(['support-tickets']); }} />
      )}
    </div>
  );
}
