import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import {
  Users, UserPlus, Search, Clock, Phone, Edit2,
  RefreshCw, LogIn, LogOut, Key, IndianRupee,
  ShieldCheck, Hash, X
} from 'lucide-react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtCurrency(n) {
  return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// ── OTP Clock Modal ─────────────────────────────────────────────
function OTPClockModal({ isOpen, onClose, outletId }) {
  const [step, setStep] = useState('select');
  const [action, setAction] = useState('clock_in');
  const [otp, setOtp] = useState('');
  const [generatedOTP, setGeneratedOTP] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: () => api.post('/staff/otp/generate', { action, outlet_id: outletId }),
    onSuccess: (res) => {
      setGeneratedOTP(res.data.data.otp);
      setExpiresAt(res.data.data.expires_at);
      setStep('otp');
      toast.success('OTP generated');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.post('/staff/otp/verify', { otp, action, outlet_id: outletId }),
    onSuccess: () => {
      toast.success(action === 'clock_in' ? 'Clocked In ✓' : 'Clocked Out ✓');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['shift-report'] });
      handleModalClose();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Invalid OTP'),
  });

  function handleModalClose() {
    onClose(); setStep('select'); setOtp(''); setGeneratedOTP(null);
  }

  return (
    <Modal isOpen={isOpen} onClose={handleModalClose} title="OTP Clock In / Out" size="sm">
      {step === 'select' ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Generate a one-time PIN for a staff member to clock in or out.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { val: 'clock_in', label: 'Clock In', icon: LogIn, bg: 'bg-emerald-500' },
              { val: 'clock_out', label: 'Clock Out', icon: LogOut, bg: 'bg-orange-500' },
            ].map(({ val, label, icon: Icon, bg }) => (
              <button key={val} onClick={() => setAction(val)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
                style={{
                  borderColor: action === val ? 'var(--accent)' : 'var(--border)',
                  background: action === val ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--bg-hover)'
                }}>
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2">
            <Key className="w-4 h-4" />
            {generateMutation.isPending ? 'Generating…' : 'Generate OTP'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {generatedOTP && (
            <div className="text-center p-5 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                Show this OTP to staff
              </p>
              <div className="text-5xl font-black tracking-[0.3em] font-mono" style={{ color: 'var(--accent)' }}>
                {generatedOTP}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Expires at {fmtTime(expiresAt)}
              </p>
            </div>
          )}
          <div>
            <label className="label">Staff enters OTP below to confirm</label>
            <input className="input text-center text-2xl font-mono tracking-widest" maxLength={6}
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="_ _ _ _ _ _" autoFocus />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep('select')} className="btn-ghost flex-1">Back</button>
            <button onClick={() => verifyMutation.mutate()} disabled={otp.length !== 6 || verifyMutation.isPending}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {verifyMutation.isPending ? 'Verifying…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Add / Edit Staff Modal ──────────────────────────────────────
function StaffModal({ isOpen, onClose, staff, outletId, onSuccess }) {
  const profile = staff?.profile || staff?.staff_profiles?.[0];
  const [form, setForm] = useState({
    full_name: staff?.full_name || '',
    email: staff?.email || '',
    phone: staff?.phone || '',
    designation: profile?.designation || '',
    department: profile?.department || '',
    monthly_salary: profile?.monthly_salary || '',
    hourly_rate: profile?.hourly_rate || '',
    employee_code: profile?.employee_code || '',
    join_date: profile?.join_date?.split('T')[0] || '',
    manager_pin: '',
  });

  const mutation = useMutation({
    mutationFn: (body) => staff
      ? api.patch(`/staff/${staff.id}`, body)
      : api.post('/staff', { ...body, outlet_id: outletId, role: 'staff' }),
    onSuccess: () => { toast.success(staff ? 'Staff updated ✓' : 'Staff added ✓'); onSuccess(); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={staff ? 'Edit Staff' : 'Add Staff Member'} size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Full Name *</label>
            <input className="input" value={form.full_name} onChange={e => upd('full_name', e.target.value)} placeholder="John Doe" />
          </div>
          {!staff && (
            <>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" value={form.email} onChange={e => upd('email', e.target.value)} placeholder="john@example.com" />
              </div>
              <div>
                <label className="label">Phone *</label>
                <input className="input" value={form.phone} onChange={e => upd('phone', e.target.value)} placeholder="9876543210" />
              </div>
            </>
          )}
          <div>
            <label className="label">Designation</label>
            <input className="input" value={form.designation} onChange={e => upd('designation', e.target.value)} placeholder="Waiter / Chef…" />
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={form.department} onChange={e => upd('department', e.target.value)}>
              <option value="">Select…</option>
              {['Kitchen','Service','Bar','Cashier','Manager','Security','Housekeeping'].map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Monthly Salary (₹)</label>
            <input className="input" type="number" value={form.monthly_salary} onChange={e => upd('monthly_salary', e.target.value)} placeholder="15000" />
          </div>
          <div>
            <label className="label">Hourly Rate (₹)</label>
            <input className="input" type="number" value={form.hourly_rate} onChange={e => upd('hourly_rate', e.target.value)} placeholder="100" />
          </div>
          <div>
            <label className="label">Employee Code</label>
            <input className="input" value={form.employee_code} onChange={e => upd('employee_code', e.target.value)} placeholder="EMP001" />
          </div>
          <div>
            <label className="label">Join Date</label>
            <input className="input" type="date" value={form.join_date} onChange={e => upd('join_date', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Manager PIN (4–6 digits)</label>
            <input className="input font-mono" type="password" maxLength={6}
              value={form.manager_pin} onChange={e => upd('manager_pin', e.target.value.replace(/\D/g, ''))}
              placeholder="Leave blank to keep existing" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
            className="btn-primary flex-1">
            {mutation.isPending ? 'Saving…' : staff ? 'Update' : 'Add Staff'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Attendance / Shift Report Tab ───────────────────────────────
function AttendanceTab({ outletId }) {
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [to, setTo] = useState(now.toISOString().split('T')[0]);
  const [expanded, setExpanded] = useState(null);

  const { data: report, isLoading, refetch } = useQuery({
    queryKey: ['shift-report', outletId, from, to],
    queryFn: () => api.get(`/staff/shift-report?outlet_id=${outletId}&from=${from}&to=${to}`).then(r => r.data.data),
    enabled: !!outletId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input className="input w-36" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>to</span>
        <input className="input w-36" type="date" value={to} onChange={e => setTo(e.target.value)} />
        <button onClick={() => refetch()} className="btn-ghost btn-sm">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {report && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Staff Tracked', value: report.summary?.total_staff || 0 },
            { label: 'Total Logs', value: report.summary?.total_logs || 0 },
          ].map(s => (
            <div key={s.label} className="card text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : (
        <div className="space-y-2">
          {(report?.staff || []).length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No attendance records for this period.</p>
            </div>
          ) : (report?.staff || []).map(s => (
            <div key={s.user_id} className="card">
              <button className="w-full flex items-center justify-between"
                onClick={() => setExpanded(expanded === s.user_id ? null : s.user_id)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm"
                    style={{ background: 'var(--accent)' }}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{s.days_present} days</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Present</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{(s.total_hours ?? 0).toFixed(1)}h</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Hours</p>
                  </div>
                  {s.overtime_hours > 0 && (
                    <div>
                      <p className="text-sm font-bold text-amber-600">{(s.overtime_hours ?? 0).toFixed(1)}h OT</p>
                    </div>
                  )}
                  <span style={{ color: 'var(--text-secondary)' }}>{expanded === s.user_id ? '▲' : '▼'}</span>
                </div>
              </button>
              {expanded === s.user_id && (
                <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--bg-hover)' }}>
                        {['Date','Shift','Clock In','Clock Out','Hours','OT'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.logs.map((log, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{fmtDate(log.clock_in)}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{log.shift}</td>
                          <td className="px-3 py-2 font-medium text-emerald-600">{fmtTime(log.clock_in)}</td>
                          <td className="px-3 py-2 font-medium text-orange-600">{fmtTime(log.clock_out)}</td>
                          <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{(log.hours ?? 0).toFixed(1)}</td>
                          <td className="px-3 py-2">
                            {log.overtime > 0
                              ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">+{(log.overtime ?? 0).toFixed(1)}h</span>
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Salary Tab ──────────────────────────────────────────────────
function SalaryTab({ outletId }) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [bonusId, setBonusId] = useState(null);
  const [bonusAmt, setBonusAmt] = useState('');

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['salary', outletId, month, year],
    queryFn: () => api.get(`/staff/salary?outlet_id=${outletId}&month=${month}&year=${year}`).then(r => r.data.data || []),
    enabled: !!outletId,
  });

  const bulkCalc = useMutation({
    mutationFn: () => api.post('/staff/salary/bulk-calculate', { outlet_id: outletId, month, year }),
    onSuccess: () => { toast.success('Salary calculated ✓'); queryClient.invalidateQueries({ queryKey: ['salary'] }); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const payMutation = useMutation({
    mutationFn: ({ id, bonus }) => api.patch(`/staff/salary/${id}/pay`, { bonus }),
    onSuccess: () => { toast.success('Marked as paid ✓'); queryClient.invalidateQueries({ queryKey: ['salary'] }); setBonusId(null); setBonusAmt(''); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const totalPayable = records.reduce((s, r) => s + parseFloat(r.net_salary || 0), 0);
  const paidCount = records.filter(r => r.status === 'paid').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input w-28" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select className="input w-24" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => bulkCalc.mutate()} disabled={bulkCalc.isPending}
          className="btn-primary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${bulkCalc.isPending ? 'animate-spin' : ''}`} />
          {bulkCalc.isPending ? 'Calculating…' : 'Calculate All'}
        </button>
        <div className="ml-auto text-right">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total Payable</p>
          <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{fmtCurrency(totalPayable)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Staff', value: records.length, color: 'var(--accent)' },
          { label: 'Paid', value: paidCount, color: 'var(--success)' },
          { label: 'Pending', value: records.length - paidCount, color: 'var(--warning)' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : records.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No records. Click "Calculate All" to generate salary for {MONTHS[month-1]} {year}.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ background: 'var(--bg-hover)' }}>
                {['Staff','Days','Hours','OT Hrs','Basic','OT Pay','Bonus','Net Salary','Status','Action'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{r.staff_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r.phone}</p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{r.present_days}/{r.working_days}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--text-primary)' }}>{parseFloat(r.total_hours).toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-amber-600 font-medium">{parseFloat(r.overtime_hours).toFixed(1)}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--text-primary)' }}>{fmtCurrency(r.basic_salary)}</td>
                  <td className="px-3 py-2.5 text-blue-600">{fmtCurrency(r.overtime_pay)}</td>
                  <td className="px-3 py-2.5 text-emerald-600">{fmtCurrency(r.bonus)}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--text-primary)' }}>{fmtCurrency(r.net_salary)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      r.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.status !== 'paid' && (
                      bonusId === r.id ? (
                        <div className="flex gap-1 items-center">
                          <input className="input w-20 text-sm py-1" type="number" placeholder="Bonus ₹"
                            value={bonusAmt} onChange={e => setBonusAmt(e.target.value)} />
                          <button onClick={() => payMutation.mutate({ id: r.id, bonus: bonusAmt || 0 })}
                            disabled={payMutation.isPending} className="btn-success btn-sm">
                            {payMutation.isPending ? '…' : 'Pay'}
                          </button>
                          <button onClick={() => setBonusId(null)} className="btn-ghost btn-sm p-1">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { setBonusId(r.id); setBonusAmt(''); }}
                          className="btn-primary btn-sm flex items-center gap-1">
                          <IndianRupee className="w-3 h-3" /> Pay
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────
export default function StaffPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('list');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [showOTP, setShowOTP] = useState(false);

  const { data: staffData, isLoading } = useQuery({
    queryKey: ['staff', outletId, search],
    queryFn: () => api.get(`/staff?outlet_id=${outletId}&search=${search}`).then(r => r.data),
    enabled: !!outletId,
  });

  const staff = staffData?.data?.staff || staffData?.data || [];

  const clockSelf = useMutation({
    mutationFn: (action) => action === 'in'
      ? api.post('/staff/clock-in', { outlet_id: outletId })
      : api.post('/staff/clock-out', { outlet_id: outletId }),
    onSuccess: (_, action) => {
      toast.success(action === 'in' ? 'Clocked In ✓' : 'Clocked Out ✓');
      queryClient.invalidateQueries({ queryKey: ['shift-report'] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Already clocked in/out'),
  });

  const TABS = [
    { id: 'list', label: 'Staff List', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: Clock },
    { id: 'salary', label: 'Salary', icon: IndianRupee },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            Staff Management
          </h1>
          <p className="page-subtitle">Attendance · OTP clock-in · Shift reports · Salary calculation</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => clockSelf.mutate('in')} disabled={clockSelf.isPending}
            className="btn-success flex items-center gap-2">
            <LogIn className="w-4 h-4" /> Clock In
          </button>
          <button onClick={() => clockSelf.mutate('out')} disabled={clockSelf.isPending}
            className="btn-warning flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Clock Out
          </button>
          <button onClick={() => setShowOTP(true)} className="btn-secondary flex items-center gap-2">
            <Key className="w-4 h-4" /> OTP Clock
          </button>
          <button onClick={() => { setEditStaff(null); setShowAdd(true); }} className="btn-primary flex items-center gap-2">
            <Users className="w-4 h-4" /> Add Staff
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-hover)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`${activeTab === t.id ? 'tab-btn-active' : 'tab-btn'} flex items-center gap-1.5`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* Staff List */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            <input className="input pl-9 max-w-xs" placeholder="Search staff…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
            </div>
          ) : staff.length === 0 ? (
            <div className="card text-center py-16 space-y-3">
              <Users className="w-12 h-12 mx-auto opacity-20" style={{ color: 'var(--text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No staff found</p>
              <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm">Add First Staff Member</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {staff.map(s => {
                const profile = s.profile || s.staff_profiles?.[0];
                const name = s.full_name || s.name;
                return (
                  <div key={s.id} className="card space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-lg"
                          style={{ background: 'var(--accent)' }}>
                          {name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {profile?.designation || 'Staff'}{profile?.department ? ` · ${profile.department}` : ''}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => { setEditStaff(s); setShowAdd(true); }}
                        className="btn-ghost btn-sm p-1.5">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {s.phone && (
                        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                          <Phone className="w-3 h-3" />{s.phone}
                        </p>
                      )}
                      {profile?.employee_code && (
                        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                          <Hash className="w-3 h-3" />{profile.employee_code}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Salary</p>
                        <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                          {profile?.monthly_salary
                            ? fmtCurrency(profile.monthly_salary) + '/mo'
                            : profile?.hourly_rate
                            ? fmtCurrency(profile.hourly_rate) + '/hr'
                            : '—'}
                        </p>
                      </div>
                      {profile?.join_date && (
                        <div className="text-right">
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Since</p>
                          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {new Date(profile.join_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'attendance' && <AttendanceTab outletId={outletId} />}
      {activeTab === 'salary' && <SalaryTab outletId={outletId} />}

      {/* Modals */}
      <OTPClockModal isOpen={showOTP} onClose={() => setShowOTP(false)} outletId={outletId} />
      {showAdd && (
        <StaffModal
          isOpen={showAdd}
          onClose={() => { setShowAdd(false); setEditStaff(null); }}
          staff={editStaff}
          outletId={outletId}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['staff'] })}
        />
      )}
    </div>
  );
}
