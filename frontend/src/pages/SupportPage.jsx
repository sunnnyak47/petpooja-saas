import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  LifeBuoy, Plus, X, Send, MessageSquare, Clock, CheckCircle2, Loader2, ChevronDown,
} from 'lucide-react';

/**
 * SupportPage (SA-006) — owner-facing support tickets. Raise a ticket, see its
 * status + the platform's replies, and reply back. Tickets land in the same inbox
 * the super-admin Support Tickets page manages (`/api/support/tickets`).
 */

const STATUS_META = {
  OPEN:        { label: 'Open',        color: 'var(--accent)',  Icon: Clock },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--warning)', Icon: Loader2 },
  RESOLVED:    { label: 'Resolved',    color: 'var(--success)', Icon: CheckCircle2 },
};
const PRIORITY_META = {
  LOW:    'var(--text-secondary)',
  MEDIUM: 'var(--accent)',
  HIGH:   'var(--warning)',
  URGENT: 'var(--danger)',
};
const badge = (color) => ({
  color, background: `color-mix(in srgb, ${color} 14%, transparent)`,
});

export default function SupportPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => api.get('/support/tickets').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const createMut = useMutation({
    mutationFn: (body) => api.post('/support/tickets', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['support-tickets'] }); setShowNew(false); },
  });
  const replyMut = useMutation({
    mutationFn: ({ id, body }) => api.post(`/support/tickets/${id}/reply`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  });

  const list = Array.isArray(tickets) ? tickets : (tickets?.data || []);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <LifeBuoy size={22} style={{ color: 'var(--accent)' }} /> Support
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Raise a ticket with the platform team and track its progress</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowNew(true)}>
          <Plus size={15} /> New Ticket
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : list.length === 0 ? (
        <div className="card text-center py-14">
          <LifeBuoy size={32} className="mx-auto mb-3" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No tickets yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Raise one and we'll get back to you here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((t) => {
            const st = STATUS_META[t.status] || STATUS_META.OPEN;
            const { Icon } = st;
            const open = openId === t.id;
            return (
              <div key={t.id} className="card p-0 overflow-hidden">
                <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpenId(open ? null : t.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{t.subject}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={badge(st.color)}>
                        <Icon size={10} className="inline mr-0.5" />{st.label}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={badge(PRIORITY_META[t.priority] || 'var(--text-secondary)')}>{t.priority}</span>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {t.id} · {new Date(t.created_at).toLocaleString()}{t.replies?.length ? ` · ${t.replies.length} repl${t.replies.length === 1 ? 'y' : 'ies'}` : ''}
                    </p>
                  </div>
                  <ChevronDown size={16} style={{ color: 'var(--text-secondary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                </button>

                {open && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm mt-3 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{t.body}</p>
                    {(t.replies || []).map((rep) => (
                      <div key={rep.id} className="mt-3 rounded-lg p-3" style={{ background: rep.from === 'owner' ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--bg-hover)' }}>
                        <p className="text-[10px] font-bold uppercase" style={{ color: rep.from === 'owner' ? 'var(--accent)' : 'var(--success)' }}>
                          {rep.from === 'owner' ? 'You' : 'Support Team'} · {new Date(rep.created_at).toLocaleString()}
                        </p>
                        <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{rep.body}</p>
                      </div>
                    ))}
                    {t.status !== 'RESOLVED' && <ReplyBox onSend={(body) => replyMut.mutate({ id: t.id, body })} sending={replyMut.isPending} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onSubmit={(b) => createMut.mutate(b)} pending={createMut.isPending} error={createMut.error?.message} />}
    </div>
  );
}

function ReplyBox({ onSend, sending }) {
  const [text, setText] = useState('');
  return (
    <div className="mt-3 flex gap-2">
      <input className="input flex-1" placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onSend(text.trim()); setText(''); } }} />
      <button className="btn-primary btn-sm" disabled={!text.trim() || sending} onClick={() => { onSend(text.trim()); setText(''); }}>
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      </button>
    </div>
  );
}

function NewTicketModal({ onClose, onSubmit, pending, error }) {
  const [form, setForm] = useState({ subject: '', body: '', priority: 'MEDIUM' });
  const valid = form.subject.trim().length >= 3 && form.body.trim().length >= 5;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><MessageSquare size={18} style={{ color: 'var(--accent)' }} /> New Support Ticket</h2>
          <button onClick={onClose} className="btn-ghost btn-sm"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Subject</label>
            <input className="input mt-1" placeholder="Short summary of the issue" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Priority</label>
            <select className="input mt-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Message</label>
            <textarea className="input mt-1" rows={5} placeholder="Describe what's happening…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={!valid || pending} onClick={() => onSubmit(form)}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Raise Ticket
          </button>
        </div>
      </div>
    </div>
  );
}
