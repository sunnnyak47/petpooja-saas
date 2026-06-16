/**
 * StaffManagementPage — Comprehensive HR profile management.
 * Tabs: Personal Details · Employment · Compliance · Certifications · Availability
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { isValidPhone, isValidEmail, PHONE_MAXLEN, phonePlaceholder } from '../lib/validation';
import {
  Users, User, Briefcase, ShieldCheck, Award, CalendarCheck,
  Plus, Trash2, Edit2, Search, ChevronRight, CheckCircle2,
  AlertTriangle, Clock, Phone, Mail, MapPin, Heart, Cake,
  Flag, Banknote, Building2, Hash, FileText, Lock,
  Globe, ClipboardCheck, IdCard, AlertCircle, X, Save,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmt(v) { return v || '—'; }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function isExpired(d) { return d && new Date(d) < new Date(); }
function expiresWithin90(d) {
  if (!d) return false;
  const diff = new Date(d) - new Date();
  return diff > 0 && diff < 90 * 24 * 3600 * 1000;
}

function ExpiryBadge({ date, label }) {
  if (!date) return <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>—</span>;
  const expired = isExpired(date);
  const warning = expiresWithin90(date);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        background: expired ? 'color-mix(in srgb, #ef4444 12%, transparent)'
          : warning ? 'color-mix(in srgb, #f59e0b 12%, transparent)'
          : 'color-mix(in srgb, #22c55e 12%, transparent)',
        color: expired ? '#ef4444' : warning ? '#d97706' : '#16a34a',
      }}>
      {expired ? <AlertCircle size={10} /> : warning ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
      {fmtDate(date)}
    </span>
  );
}

function FieldRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon size={15} style={{ color: 'var(--text-secondary)', marginTop: 2, flexShrink: 0 }} />}
      <div className="min-w-0">
        <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{fmt(value)}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
        {Icon && <Icon size={15} style={{ color: 'var(--accent)' }} />}
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Input({ label, name, type = 'text', value, onChange, options, disabled, maxLength, placeholder }) {
  const base = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-primary)',
    color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  };
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {options ? (
        <select name={name} value={value || ''} onChange={onChange} disabled={disabled} style={base}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} name={name} value={value || ''} onChange={onChange}
          disabled={disabled} maxLength={maxLength} placeholder={placeholder} style={base} />
      )}
    </div>
  );
}

// ── Staff list sidebar ────────────────────────────────────────────────────────
function StaffListItem({ member, selected, onClick }) {
  const name = member.user?.full_name || 'Unknown';
  const role = member.user?.user_roles?.[0]?.role?.display_name || member.designation || '—';
  const initial = name.charAt(0).toUpperCase();
  return (
    <button onClick={onClick} className="w-full text-left px-3 py-3 rounded-lg transition-all flex items-center gap-3"
      style={{
        background: selected ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
        border: selected ? '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' : '1px solid transparent',
      }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{ background: 'var(--accent)', color: '#fff' }}>{initial}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{name}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{role}</p>
      </div>
      {selected && <ChevronRight size={14} style={{ color: 'var(--accent)', marginLeft: 'auto', flexShrink: 0 }} />}
    </button>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'employment', label: 'Employment', icon: Briefcase },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { id: 'certifications', label: 'Certifications', icon: Award },
  { id: 'availability', label: 'Availability', icon: CalendarCheck },
];

// ── Personal Details Tab ──────────────────────────────────────────────────────
function PersonalTab({ profile, editing, form, onChange }) {
  if (!editing) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
      <SectionCard title="Basic Info" icon={User}>
        <FieldRow icon={User} label="Full Name" value={profile?.user?.full_name} />
        <FieldRow icon={Mail} label="Email" value={profile?.user?.email} />
        <FieldRow icon={Phone} label="Phone" value={profile?.user?.phone} />
        <FieldRow icon={Cake} label="Date of Birth" value={fmtDate(profile?.date_of_birth)} />
        <FieldRow icon={null} label="Gender" value={profile?.gender} />
        <FieldRow icon={Flag} label="Nationality" value={profile?.nationality} />
        <FieldRow icon={Heart} label="Blood Group" value={profile?.blood_group} />
        <FieldRow icon={MapPin} label="Address" value={profile?.address} />
      </SectionCard>
      <SectionCard title="Emergency Contact" icon={Phone}>
        <FieldRow icon={User} label="Contact Name" value={profile?.emergency_contact_name} />
        <FieldRow icon={null} label="Relationship" value={profile?.emergency_relationship} />
        <FieldRow icon={Phone} label="Phone" value={profile?.emergency_contact} />
      </SectionCard>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Date of Birth" name="date_of_birth" type="date" value={form.date_of_birth?.split('T')[0]} onChange={onChange} />
      <Input label="Gender" name="gender" value={form.gender} onChange={onChange}
        options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'non_binary', label: 'Non-binary' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }]} />
      <Input label="Nationality" name="nationality" value={form.nationality} onChange={onChange} />
      <Input label="Blood Group" name="blood_group" value={form.blood_group} onChange={onChange}
        options={['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => ({ value: g, label: g }))} />
      <div className="sm:col-span-2">
        <Input label="Address" name="address" value={form.address} onChange={onChange} />
      </div>
      <div className="sm:col-span-2 pt-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Emergency Contact</p>
      </div>
      <Input label="Contact Name" name="emergency_contact_name" value={form.emergency_contact_name} onChange={onChange} />
      <Input label="Relationship" name="emergency_relationship" value={form.emergency_relationship} onChange={onChange}
        options={[{ value: 'partner', label: 'Partner/Spouse' }, { value: 'parent', label: 'Parent' }, { value: 'sibling', label: 'Sibling' }, { value: 'friend', label: 'Friend' }, { value: 'other', label: 'Other' }]} />
      <Input label="Phone" name="emergency_contact" value={form.emergency_contact} onChange={onChange} maxLength={PHONE_MAXLEN} placeholder={phonePlaceholder('AU')} />
    </div>
  );
}

// ── Employment Tab ────────────────────────────────────────────────────────────
function EmploymentTab({ profile, editing, form, onChange }) {
  if (!editing) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
      <SectionCard title="Work Details" icon={Briefcase}>
        <FieldRow icon={Hash} label="Employee Code" value={profile?.employee_code} />
        <FieldRow icon={Briefcase} label="Department" value={profile?.department} />
        <FieldRow icon={null} label="Designation" value={profile?.designation} />
        <FieldRow icon={null} label="Employment Type" value={profile?.employment_type?.replace('_', ' ')} />
        <FieldRow icon={Clock} label="Join Date" value={fmtDate(profile?.join_date)} />
        <FieldRow icon={null} label="Contract End" value={fmtDate(profile?.contract_end_date)} />
        <FieldRow icon={null} label="End Date" value={fmtDate(profile?.end_date)} />
        <FieldRow icon={Lock} label="Manager PIN" value={profile?.manager_pin ? '••••' : '—'} />
      </SectionCard>
      <SectionCard title="Payroll" icon={Banknote}>
        <FieldRow icon={Banknote} label="Hourly Rate" value={profile?.hourly_rate ? `$${Number(profile.hourly_rate).toFixed(2)}/hr` : null} />
        <FieldRow icon={Banknote} label="Monthly Salary" value={profile?.monthly_salary ? `$${Number(profile.monthly_salary).toFixed(2)}` : null} />
        <FieldRow icon={Building2} label="Bank BSB" value={profile?.bank_bsb} />
        <FieldRow icon={Hash} label="Account Number" value={profile?.bank_account ? `••••${profile.bank_account.slice(-4)}` : null} />
        <FieldRow icon={User} label="Account Name" value={profile?.bank_account_name} />
        <FieldRow icon={FileText} label="TFN" value={profile?.tax_file_number ? '••• ••• •••' : null} />
        <FieldRow icon={Building2} label="Super Fund" value={profile?.superannuation_fund} />
        <FieldRow icon={Hash} label="Member Number" value={profile?.super_member_number} />
      </SectionCard>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Employee Code" name="employee_code" value={form.employee_code} onChange={onChange} />
      <Input label="Department" name="department" value={form.department} onChange={onChange}
        options={[{ value: 'front_of_house', label: 'Front of House' }, { value: 'back_of_house', label: 'Back of House' }, { value: 'bar', label: 'Bar' }, { value: 'management', label: 'Management' }, { value: 'kitchen', label: 'Kitchen' }, { value: 'delivery', label: 'Delivery' }, { value: 'admin', label: 'Admin' }]} />
      <Input label="Designation" name="designation" value={form.designation} onChange={onChange} />
      <Input label="Employment Type" name="employment_type" value={form.employment_type} onChange={onChange}
        options={[{ value: 'full_time', label: 'Full Time' }, { value: 'part_time', label: 'Part Time' }, { value: 'casual', label: 'Casual' }, { value: 'contract', label: 'Contract' }]} />
      <Input label="Join Date" name="join_date" type="date" value={form.join_date?.split('T')[0]} onChange={onChange} />
      <Input label="Contract End Date" name="contract_end_date" type="date" value={form.contract_end_date?.split('T')[0]} onChange={onChange} />
      <Input label="End Date (Termination)" name="end_date" type="date" value={form.end_date?.split('T')[0]} onChange={onChange} />
      <Input label="Manager PIN (4 digits)" name="manager_pin" value={form.manager_pin} onChange={onChange} />
      <div className="sm:col-span-2 pt-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Pay & Banking</p>
      </div>
      <Input label="Hourly Rate ($)" name="hourly_rate" type="number" value={form.hourly_rate} onChange={onChange} />
      <Input label="Monthly Salary ($)" name="monthly_salary" type="number" value={form.monthly_salary} onChange={onChange} />
      <Input label="Bank BSB" name="bank_bsb" value={form.bank_bsb} onChange={onChange} />
      <Input label="Bank Account Number" name="bank_account" value={form.bank_account} onChange={onChange} />
      <Input label="Account Name" name="bank_account_name" value={form.bank_account_name} onChange={onChange} />
      <Input label="Tax File Number (TFN)" name="tax_file_number" value={form.tax_file_number} onChange={onChange} />
      <Input label="Superannuation Fund" name="superannuation_fund" value={form.superannuation_fund} onChange={onChange} />
      <Input label="Super Member Number" name="super_member_number" value={form.super_member_number} onChange={onChange} />
    </div>
  );
}

// ── Compliance Tab ────────────────────────────────────────────────────────────
function ComplianceBadge({ checked }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        background: checked ? 'color-mix(in srgb, #22c55e 12%, transparent)' : 'color-mix(in srgb, #ef4444 12%, transparent)',
        color: checked ? '#16a34a' : '#ef4444',
      }}>
      {checked ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
      {checked ? 'Verified' : 'Not Verified'}
    </span>
  );
}

function ComplianceTab({ profile, editing, form, onChange }) {
  if (!editing) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
      <SectionCard title="Working Rights" icon={Globe}>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Right to Work</span>
          <ComplianceBadge checked={profile?.right_to_work_checked} />
        </div>
        <FieldRow icon={IdCard} label="Visa Type" value={profile?.visa_type} />
        <div className="flex items-center justify-between py-1">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Visa Expiry</span>
          <ExpiryBadge date={profile?.visa_expiry} />
        </div>
      </SectionCard>
      <SectionCard title="Induction" icon={ClipboardCheck}>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Induction Completed</span>
          <ComplianceBadge checked={profile?.induction_completed} />
        </div>
        <FieldRow icon={Clock} label="Induction Date" value={fmtDate(profile?.induction_date)} />
      </SectionCard>
      <SectionCard title="Liquor & Food Licensing" icon={ShieldCheck}>
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>RSA Certificate Number</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(profile?.rsa_number)}</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>RSA Expiry</span>
            <ExpiryBadge date={profile?.rsa_expiry} />
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Food Safety Certificate</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(profile?.food_safety_cert)}</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Food Safety Expiry</span>
            <ExpiryBadge date={profile?.food_safety_expiry} />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Background & Child Safety" icon={ShieldCheck}>
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>WWCC Number</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(profile?.wwcc_number)}</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>WWCC Expiry</span>
            <ExpiryBadge date={profile?.wwcc_expiry} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Police Check Date</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fmtDate(profile?.police_check_date)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Police Check Expiry</span>
            <ExpiryBadge date={profile?.police_check_expiry} />
          </div>
        </div>
      </SectionCard>
      {profile?.notes && (
        <div className="sm:col-span-2">
          <SectionCard title="Notes" icon={FileText}>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{profile.notes}</p>
          </SectionCard>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Working Rights</p>
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="rtw" name="right_to_work_checked"
          checked={!!form.right_to_work_checked} onChange={onChange} className="w-4 h-4 cursor-pointer" />
        <label htmlFor="rtw" className="text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>Right to Work Verified</label>
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="ind" name="induction_completed"
          checked={!!form.induction_completed} onChange={onChange} className="w-4 h-4 cursor-pointer" />
        <label htmlFor="ind" className="text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>Induction Completed</label>
      </div>
      <Input label="Visa Type" name="visa_type" value={form.visa_type} onChange={onChange}
        options={[{ value: 'citizen', label: 'Citizen' }, { value: 'permanent_resident', label: 'Permanent Resident' }, { value: '482', label: '482 (TSS)' }, { value: '417', label: '417 (Working Holiday)' }, { value: '485', label: '485 (Graduate)' }, { value: 'student', label: 'Student' }, { value: 'other', label: 'Other' }]} />
      <Input label="Visa Expiry" name="visa_expiry" type="date" value={form.visa_expiry?.split('T')[0]} onChange={onChange} />
      <Input label="Induction Date" name="induction_date" type="date" value={form.induction_date?.split('T')[0]} onChange={onChange} />
      <div className="sm:col-span-2 pt-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>RSA — Responsible Service of Alcohol</p>
      </div>
      <Input label="RSA Certificate Number" name="rsa_number" value={form.rsa_number} onChange={onChange} />
      <Input label="RSA Expiry" name="rsa_expiry" type="date" value={form.rsa_expiry?.split('T')[0]} onChange={onChange} />
      <div className="sm:col-span-2 pt-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Food Safety</p>
      </div>
      <Input label="Food Safety Certificate #" name="food_safety_cert" value={form.food_safety_cert} onChange={onChange} />
      <Input label="Food Safety Expiry" name="food_safety_expiry" type="date" value={form.food_safety_expiry?.split('T')[0]} onChange={onChange} />
      <div className="sm:col-span-2 pt-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>WWCC — Working With Children Check</p>
      </div>
      <Input label="WWCC Number" name="wwcc_number" value={form.wwcc_number} onChange={onChange} />
      <Input label="WWCC Expiry" name="wwcc_expiry" type="date" value={form.wwcc_expiry?.split('T')[0]} onChange={onChange} />
      <div className="sm:col-span-2 pt-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Police Check</p>
      </div>
      <Input label="Police Check Date" name="police_check_date" type="date" value={form.police_check_date?.split('T')[0]} onChange={onChange} />
      <Input label="Police Check Expiry" name="police_check_expiry" type="date" value={form.police_check_expiry?.split('T')[0]} onChange={onChange} />
      <div className="sm:col-span-2 pt-2 pb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Notes</p>
      </div>
      <div className="sm:col-span-2">
        <textarea name="notes" value={form.notes || ''} onChange={onChange} rows={3}
          placeholder="Any additional notes about this staff member..."
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, resize: 'vertical', outline: 'none' }} />
      </div>
    </div>
  );
}

// ── Certifications Tab ─────────────────────────────────────────────────────────
function CertificationsTab({ userId, outletId }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [certForm, setCertForm] = useState({ cert_type: '', provider: '', issue_date: '', expiry_date: '', cert_number: '', outlet_id: outletId });

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ['staff-certs', userId, outletId],
    queryFn: () => api.get(`/staff/${userId}/certifications?outlet_id=${outletId}`).then(r => r.data || []),
    enabled: !!userId,
  });

  const addMut = useMutation({
    mutationFn: (d) => api.post(`/staff/${userId}/certifications`, d),
    onSuccess: () => {
      toast.success('Certification added');
      queryClient.invalidateQueries({ queryKey: ['staff-certs', userId] });
      setShowAdd(false);
      setCertForm({ cert_type: '', provider: '', issue_date: '', expiry_date: '', cert_number: '', outlet_id: outletId });
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/staff/certifications/${id}`),
    onSuccess: () => { toast.success('Removed'); queryClient.invalidateQueries({ queryKey: ['staff-certs', userId] }); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const CERT_TYPES = ['RSA', 'WWCC', 'Food Safety', 'First Aid', 'Police Check', 'Barista', 'Sommelier', 'Other'];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{certs.length} certification{certs.length !== 1 ? 's' : ''} on file</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          <Plus size={14} /> Add Certification
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : certs.length === 0 ? (
        <div className="text-center py-12 rounded-xl" style={{ border: '2px dashed var(--border)' }}>
          <Award size={32} style={{ color: 'var(--text-secondary)', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No certifications on file</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Add RSA, WWCC, Food Safety and other certs here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {certs.map(cert => {
            const expired = isExpired(cert.expiry_date);
            const warning = expiresWithin90(cert.expiry_date);
            return (
              <div key={cert.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${expired ? '#ef4444' : warning ? '#f59e0b' : 'var(--border)'}`,
                }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: expired ? 'color-mix(in srgb, #ef4444 12%, transparent)' : 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
                  <Award size={18} style={{ color: expired ? '#ef4444' : 'var(--accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{cert.cert_type}</p>
                    {cert.cert_number && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>#{cert.cert_number}</span>}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {cert.provider && `${cert.provider} · `}
                    Issued {fmtDate(cert.issue_date)} · Expires <ExpiryBadge date={cert.expiry_date} />
                  </p>
                </div>
                <button onClick={() => delMut.mutate(cert.id)} className="p-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--text-secondary)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Certification" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Certificate Type *</label>
            <select value={certForm.cert_type} onChange={e => setCertForm(f => ({ ...f, cert_type: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}>
              <option value="">— Select —</option>
              {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {['provider', 'cert_number'].map(field => (
            <div key={field}>
              <label className="block text-xs font-medium mb-1 capitalize" style={{ color: 'var(--text-secondary)' }}>{field.replace('_', ' ')}</label>
              <input value={certForm[field]} onChange={e => setCertForm(f => ({ ...f, [field]: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }} />
            </div>
          ))}
          {['issue_date', 'expiry_date'].map(field => (
            <div key={field}>
              <label className="block text-xs font-medium mb-1 capitalize" style={{ color: 'var(--text-secondary)' }}>{field.replace('_', ' ')} *</label>
              <input type="date" value={certForm[field]} onChange={e => setCertForm(f => ({ ...f, [field]: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }} />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>Cancel</button>
            <button onClick={() => addMut.mutate(certForm)} disabled={addMut.isPending || !certForm.cert_type || !certForm.issue_date || !certForm.expiry_date}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'var(--accent)', color: '#fff', opacity: addMut.isPending ? 0.6 : 1 }}>
              {addMut.isPending ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Availability Tab ──────────────────────────────────────────────────────────
function AvailabilityTab({ userId }) {
  const queryClient = useQueryClient();
  const defaultSlots = DAYS.map((_, i) => ({ day_of_week: i, available: i !== 0, start_time: '09:00', end_time: '17:00', notes: '' }));
  const [slots, setSlots] = useState(defaultSlots);

  const { data, isLoading } = useQuery({
    queryKey: ['staff-avail', userId],
    queryFn: () => api.get(`/staff/${userId}/availability`).then(r => r.data || []),
    enabled: !!userId,
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const merged = defaultSlots.map(def => {
        const found = data.find(d => d.day_of_week === def.day_of_week);
        return found ? { ...def, ...found } : def;
      });
      setSlots(merged);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => api.put(`/staff/${userId}/availability`, { slots }),
    onSuccess: () => { toast.success('Availability saved'); queryClient.invalidateQueries({ queryKey: ['staff-avail', userId] }); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const toggleDay = (i) => setSlots(s => s.map((slot, idx) => idx === i ? { ...slot, available: !slot.available } : slot));
  const updateSlot = (i, field, val) => setSlots(s => s.map((slot, idx) => idx === i ? { ...slot, [field]: val } : slot));

  if (isLoading) return <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Set which days and hours this staff member is available to work.</p>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff', opacity: saveMut.isPending ? 0.6 : 1 }}>
          <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl transition-all"
            style={{
              background: slot.available ? 'var(--bg-secondary)' : 'var(--bg-hover)',
              border: '1px solid var(--border)',
              opacity: slot.available ? 1 : 0.55,
            }}>
            <button onClick={() => toggleDay(i)} className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: slot.available ? 'var(--accent)' : 'var(--border)' }}>
              {slot.available && <CheckCircle2 size={12} color="#fff" />}
            </button>
            <span className="text-sm font-semibold w-24 flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{DAYS[i]}</span>
            {slot.available ? (
              <div className="flex items-center gap-2 flex-wrap flex-1">
                <input type="time" value={slot.start_time || '09:00'} onChange={e => updateSlot(i, 'start_time', e.target.value)}
                  className="text-sm px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>to</span>
                <input type="time" value={slot.end_time || '17:00'} onChange={e => updateSlot(i, 'end_time', e.target.value)}
                  className="text-sm px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }} />
                <input value={slot.notes || ''} onChange={e => updateSlot(i, 'notes', e.target.value)} placeholder="Notes…"
                  className="flex-1 text-sm px-2 py-1 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', minWidth: 80 }} />
              </div>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Not available</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compliance summary banner ─────────────────────────────────────────────────
function ComplianceSummary({ profile }) {
  const checks = [
    { label: 'Right to Work', ok: profile?.right_to_work_checked },
    { label: 'RSA', ok: profile?.rsa_number && !isExpired(profile?.rsa_expiry) },
    { label: 'WWCC', ok: profile?.wwcc_number && !isExpired(profile?.wwcc_expiry) },
    { label: 'Food Safety', ok: profile?.food_safety_cert && !isExpired(profile?.food_safety_expiry) },
    { label: 'Police Check', ok: profile?.police_check_date && !isExpired(profile?.police_check_expiry) },
    { label: 'Induction', ok: profile?.induction_completed },
  ];
  const passed = checks.filter(c => c.ok).length;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl mb-4 flex-wrap"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="text-sm font-semibold" style={{ color: passed === checks.length ? '#16a34a' : '#d97706' }}>
        Compliance: {passed}/{checks.length}
      </div>
      {checks.map(c => (
        <span key={c.label} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
          style={{
            background: c.ok ? 'color-mix(in srgb, #22c55e 10%, transparent)' : 'color-mix(in srgb, #ef4444 10%, transparent)',
            color: c.ok ? '#16a34a' : '#ef4444',
          }}>
          {c.ok ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />} {c.label}
        </span>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffManagementPage() {
  const { user } = useSelector(s => s.auth);
  // Some auth implementations put outlet_id directly on user, others nest it in outlets array
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('personal');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  // ── Create-staff form ──
  const EMPTY_ADD = { full_name: '', phone: '', email: '', role: 'waiter', manager_pin: '', password: '' };
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const onAddChange = (e) => setAddForm(f => ({ ...f, [e.target.name]: e.target.value }));

  // Load staff list — sendPaginated wraps array in { success, data: [], meta: {} }
  const { data: staffData, isLoading: loadingList, isError: listError, refetch: refetchList } = useQuery({
    queryKey: ['staff-mgmt-list', outletId],
    queryFn: () => api.get(`/staff?outlet_id=${outletId}&limit=200`).then(r => r.data || []),
    enabled: !!outletId,
    retry: 2,
    staleTime: 30_000,
  });

  const staffList = staffData || [];
  const filtered = staffList.filter(m => {
    const name = m.user?.full_name?.toLowerCase() || '';
    const dept = m.department?.toLowerCase() || '';
    const s = search.toLowerCase();
    return !s || name.includes(s) || dept.includes(s);
  });

  const selectedMember = staffList.find(m => m.user_id === selectedId);

  // Load full profile when staff selected
  const { data: fullProfile, isLoading: loadingProfile } = useQuery({
    queryKey: ['staff-profile', selectedId, outletId],
    queryFn: () => api.get(`/staff/${selectedId}/profile?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!selectedId && !!outletId,
    retry: 1,
    staleTime: 30_000,
  });

  const profile = fullProfile || selectedMember;

  // Start editing — populate form from current profile
  const startEdit = () => {
    const p = profile || {};
    setForm({
      employee_code: p.employee_code || '',
      department: p.department || '',
      designation: p.designation || '',
      manager_pin: p.manager_pin || '',
      employment_type: p.employment_type || '',
      join_date: p.join_date || '',
      end_date: p.end_date || '',
      contract_end_date: p.contract_end_date || '',
      hourly_rate: p.hourly_rate ? Number(p.hourly_rate) : '',
      monthly_salary: p.monthly_salary ? Number(p.monthly_salary) : '',
      date_of_birth: p.date_of_birth || '',
      gender: p.gender || '',
      nationality: p.nationality || '',
      address: p.address || '',
      blood_group: p.blood_group || '',
      emergency_contact: p.emergency_contact || '',
      emergency_contact_name: p.emergency_contact_name || '',
      emergency_relationship: p.emergency_relationship || '',
      bank_bsb: p.bank_bsb || '',
      bank_account: p.bank_account || '',
      bank_account_name: p.bank_account_name || '',
      tax_file_number: p.tax_file_number || '',
      superannuation_fund: p.superannuation_fund || '',
      super_member_number: p.super_member_number || '',
      right_to_work_checked: !!p.right_to_work_checked,
      visa_type: p.visa_type || '',
      visa_expiry: p.visa_expiry || '',
      induction_completed: !!p.induction_completed,
      induction_date: p.induction_date || '',
      wwcc_number: p.wwcc_number || '',
      wwcc_expiry: p.wwcc_expiry || '',
      rsa_number: p.rsa_number || '',
      rsa_expiry: p.rsa_expiry || '',
      food_safety_cert: p.food_safety_cert || '',
      food_safety_expiry: p.food_safety_expiry || '',
      police_check_date: p.police_check_date || '',
      police_check_expiry: p.police_check_expiry || '',
      notes: p.notes || '',
    });
    setEditing(true);
  };

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/staff/${selectedId}/profile`, { ...form, outlet_id: outletId }),
    onSuccess: () => {
      toast.success('Profile saved');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['staff-profile', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['staff-mgmt-list'] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Save failed'),
  });

  const handleSave = () => {
    if (form.emergency_contact && !isValidPhone(form.emergency_contact)) return toast.error('Please enter a valid phone number');
    saveMut.mutate();
  };

  const addStaffMut = useMutation({
    mutationFn: () => {
      const payload = { full_name: addForm.full_name.trim(), email: addForm.email.trim(), phone: addForm.phone.trim(), role: addForm.role, outlet_id: outletId };
      if (addForm.manager_pin) payload.manager_pin = addForm.manager_pin;
      if (addForm.password) payload.password = addForm.password;
      return api.post('/staff', payload);
    },
    onSuccess: () => {
      toast.success('Staff member created');
      setShowAdd(false);
      setAddForm(EMPTY_ADD);
      queryClient.invalidateQueries({ queryKey: ['staff-mgmt-list'] });
      queryClient.invalidateQueries({ queryKey: ['staff-list'] }); // POS assign selector
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not create staff'),
  });

  const handleAddStaff = () => {
    if (!addForm.full_name.trim()) return toast.error('Enter the staff member’s name');
    if (!isValidPhone(addForm.phone)) return toast.error('Enter a valid phone number');
    if (!addForm.email.trim()) return toast.error('Enter an email');
    if (addForm.manager_pin && !/^[0-9]{4,6}$/.test(addForm.manager_pin)) return toast.error('Manager PIN must be 4–6 digits');
    addStaffMut.mutate();
  };

  return (
    <div className="flex h-full" style={{ minHeight: '100vh' }}>
      {/* ── Left sidebar: staff list ── */}
      <div className="w-64 flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
        <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Users size={18} style={{ color: 'var(--accent)' }} /> Staff Management
            </h1>
            <button onClick={() => { setAddForm(EMPTY_ADD); setShowAdd(true); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: 'var(--accent)' }} title="Add a staff member">
              <Plus size={14} /> Add
            </button>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {loadingList ? 'Loading…' : `${staffList.length} staff member${staffList.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <Search size={13} style={{ color: 'var(--text-secondary)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff…"
              className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--text-primary)' }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingList ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loading staff…</p>
            </div>
          ) : listError ? (
            <div className="text-center px-3 py-5">
              <AlertCircle size={20} style={{ color: '#ef4444', margin: '0 auto 6px' }} />
              <p className="text-xs font-medium" style={{ color: '#ef4444' }}>Failed to load</p>
              <button onClick={() => refetchList()} className="mt-2 text-xs underline" style={{ color: 'var(--accent)' }}>Retry</button>
            </div>
          ) : !outletId ? (
            <p className="text-xs text-center py-4 px-2" style={{ color: 'var(--text-secondary)' }}>No outlet selected</p>
          ) : filtered.length === 0 ? (
            <div className="text-center px-3 py-6">
              <Users size={20} style={{ color: 'var(--text-secondary)', margin: '0 auto 6px', opacity: 0.4 }} />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {search ? 'No staff match your search' : 'No staff members yet'}
              </p>
            </div>
          ) : (
            filtered.map(m => (
              <StaffListItem key={m.user_id} member={m} selected={selectedId === m.user_id}
                onClick={() => { setSelectedId(m.user_id); setEditing(false); setActiveTab('personal'); }} />
            ))
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3"
            style={{ color: 'var(--text-secondary)' }}>
            <Users size={48} style={{ opacity: 0.3 }} />
            <p className="text-base font-medium">Select a staff member</p>
            <p className="text-sm">Choose from the list to view and edit their profile</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 flex items-center gap-4 flex-wrap"
              style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                {(profile?.user?.full_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                  {profile?.user?.full_name || 'Loading…'}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {profile?.designation && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.designation}</span>}
                  {profile?.department && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{profile.department}</span>}
                  {profile?.employment_type && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)' }}>{profile.employment_type.replace('_', ' ')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                      <X size={14} /> Cancel
                    </button>
                    <button onClick={handleSave} disabled={saveMut.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--accent)', color: '#fff', opacity: saveMut.isPending ? 0.6 : 1 }}>
                      <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : activeTab !== 'certifications' && activeTab !== 'availability' ? (
                  <button onClick={startEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    <Edit2 size={14} /> Edit
                  </button>
                ) : null}
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex px-6 gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
              {TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (editing) setEditing(false); }}
                    className="flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all"
                    style={{
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: -1,
                    }}>
                    <Icon size={14} /> {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingProfile ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>Loading profile…</p>
              ) : (
                <>
                  {activeTab === 'compliance' && !editing && <ComplianceSummary profile={profile} />}
                  {activeTab === 'personal' && <PersonalTab profile={profile} editing={editing} form={form} onChange={handleChange} />}
                  {activeTab === 'employment' && <EmploymentTab profile={profile} editing={editing} form={form} onChange={handleChange} />}
                  {activeTab === 'compliance' && <ComplianceTab profile={profile} editing={editing} form={form} onChange={handleChange} />}
                  {activeTab === 'certifications' && <CertificationsTab userId={selectedId} outletId={outletId} />}
                  {activeTab === 'availability' && <AvailabilityTab userId={selectedId} />}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Add Staff modal ── */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Staff Member" size="sm">
        <div className="space-y-3 pt-1">
          <Input label="Full Name *" name="full_name" value={addForm.full_name} onChange={onAddChange} placeholder="e.g. Sunny Kumar" />
          <Input label="Phone *" name="phone" value={addForm.phone} onChange={onAddChange} placeholder="e.g. +61 4xx xxx xxx" />
          <Input label="Email *" name="email" type="email" value={addForm.email} onChange={onAddChange} placeholder="staff@restaurant.com" />
          <Input label="Role" name="role" value={addForm.role} onChange={onAddChange}
            options={[
              { value: 'waiter', label: 'Waiter / Server' },
              { value: 'cashier', label: 'Cashier' },
              { value: 'chef', label: 'Chef / Kitchen' },
              { value: 'manager', label: 'Manager' },
              { value: 'delivery', label: 'Delivery' },
            ]} />
          <Input label="Manager PIN (optional, 4–6 digits)" name="manager_pin" value={addForm.manager_pin} onChange={onAddChange} maxLength={6} placeholder="Needed for void/comp/refund approval" />
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            A temporary password (Staff@123) is set if you leave it blank — the staff member can change it on first login.
          </p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>Cancel</button>
            <button onClick={handleAddStaff} disabled={addStaffMut.isPending} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--accent)' }}>
              {addStaffMut.isPending ? 'Creating…' : 'Create Staff'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
