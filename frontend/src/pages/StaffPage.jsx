import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { 
  Users, UserPlus, Search, Shield, Clock, 
  MapPin, Phone, Mail, UserCog, Edit2, 
  Trash2, Key, Calendar, DollarSign, 
  Briefcase, ChevronRight, CheckCircle2,
  BarChart2
} from 'lucide-react';

export default function StaffPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('list'); // list | attendance | performance
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  // Queries
  const { data: staffData, isLoading } = useQuery({
    queryKey: ['staff', outletId, search],
    queryFn: () => api.get(`/staff?outlet_id=${outletId}&search=${search}`).then(r => r.data),
    enabled: !!outletId
  });

  const { data: attendanceData } = useQuery({
    queryKey: ['staff', 'attendance', outletId],
    queryFn: () => api.get(`/staff/attendance?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && activeTab === 'attendance'
  });

  const { data: performanceData } = useQuery({
    queryKey: ['staff', 'performance', outletId],
    queryFn: () => api.get(`/staff/performance?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && activeTab === 'performance'
  });

  // Mutations
  const createStaffMutation = useMutation({
    mutationFn: (data) => api.post('/staff', { ...data, outlet_id: outletId }),
    onSuccess: () => {
      toast.success('Staff member registered successfully');
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setIsModalOpen(false);
    }
  });

  const updateStaffMutation = useMutation({
    mutationFn: ({id, data}) => api.patch(`/staff/${id}`, data),
    onSuccess: () => {
      toast.success('Staff profile updated');
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setIsModalOpen(false);
    }
  });

  const deleteStaffMutation = useMutation({
    mutationFn: (id) => api.patch(`/staff/${id}`, { is_deleted: true, user_id: editingStaff?.user_id }),
    onSuccess: () => {
      toast.success('Staff member deactivated');
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setIsModalOpen(false);
    }
  });

  const clockInMutation = useMutation({
    mutationFn: (staffId) => api.post('/staff/clock-in', { outlet_id: outletId, staff_id: staffId }),
    onSuccess: () => {
      toast.success('Staff clocked in');
      queryClient.invalidateQueries();
    }
  });

  const clockOutMutation = useMutation({
    mutationFn: (staffId) => api.post('/staff/clock-out', { outlet_id: outletId, staff_id: staffId }),
    onSuccess: () => {
      toast.success('Staff clocked out');
      queryClient.invalidateQueries();
    }
  });

  const staff = staffData?.items || staffData?.staff || [];

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white px-2">Staff & Governance</h1>
          <p className="text-surface-500 text-sm px-2">Manage local outlet employees, roles and POS permissions</p>
        </div>
        <div className="flex gap-2">
           <div className="flex bg-surface-900 p-1 rounded-xl border border-surface-800">
              {[
                { id: 'list', label: 'Directory', icon: Users },
                { id: 'attendance', label: 'Attendance', icon: Clock },
                { id: 'performance', label: 'Performance', icon: BarChart2 }
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} 
                   className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === t.id ? 'bg-surface-800 text-white' : 'text-surface-500 hover:text-surface-300'}`}>
                   <t.icon className="w-3.5 h-3.5"/> {t.label}
                </button>
              ))}
           </div>
           <button onClick={() => { setEditingStaff(null); setIsModalOpen(true); }} className="btn-brand font-bold gap-2 px-6">
              <UserPlus className="w-4 h-4"/> Add Staff
           </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-surface-900 p-4 rounded-3xl border border-surface-800 shadow-sm">
         <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input className="input pl-12 h-12 text-sm bg-surface-950" placeholder="Search by name, phone or employee code..." value={search} onChange={e=>setSearch(e.target.value)} />
         </div>
         <select className="input h-12 px-6 text-sm font-bold bg-surface-950 border-surface-800 min-w-[200px]">
            <option>All Departments</option>
            <option>Kitchen</option>
            <option>Service</option>
            <option>Bar</option>
            <option>Management</option>
         </select>
      </div>

      {/* Tab Content */}
      {activeTab === 'list' ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
               [...Array(6)].map((_, i) => <div key={i} className="h-64 bg-surface-900 rounded-3xl animate-pulse border border-surface-800"/>)
            ) : staff.map(s => (
               <div key={s.id} className="group bg-surface-900 border border-surface-800 rounded-3xl p-6 hover:border-brand-500/50 transition-all relative overflow-hidden">
                  <div className="flex items-start justify-between mb-4">
                     <div className="relative">
                       <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-surface-800 to-surface-700 flex items-center justify-center text-brand-400 font-black text-2xl border border-surface-700 group-hover:scale-105 transition-transform duration-500 overflow-hidden shadow-lg">
                          {s.user?.full_name?.charAt(0)}
                       </div>
                       <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-surface-900 ${s.user?.is_active ? 'bg-success-500' : 'bg-surface-600'}`}/>
                     </div>
                     <div className="text-right">
                        <span className="px-3 py-1 rounded-full bg-brand-500/10 text-brand-400 text-[10px] font-black uppercase tracking-widest border border-brand-500/20 shadow-sm">
                           {s.designation || 'Staff'}
                        </span>
                        <p className="text-[10px] text-surface-500 font-mono mt-2 uppercase tracking-wide">{s.employee_code || `#${s.id.slice(0, 5)}`}</p>
                     </div>
                  </div>

                  <h3 className="text-xl font-bold text-white group-hover:text-brand-400 transition-colors truncate">{s.user?.full_name}</h3>
                  <p className="text-sm text-surface-400 mb-5 flex items-center gap-1.5"><Briefcase className="w-3 h-3 text-surface-600"/> {s.department || 'N/A'}</p>

                  <div className="pt-5 border-t border-surface-800 flex items-center justify-between">
                     <div className="flex gap-2">
                        {!s.is_clocked_in ? (
                           <button onClick={() => clockInMutation.mutate(s.id)} className="btn-brand bg-success-600 hover:bg-success-500 border-success-600 py-1.5 px-3 text-[10px]">Clock In</button>
                        ) : (
                           <button onClick={() => clockOutMutation.mutate(s.id)} className="btn-brand bg-red-600 hover:bg-red-500 border-red-600 py-1.5 px-3 text-[10px]">Clock Out</button>
                        )}
                     </div>
                     <div className="flex gap-2">
                        <button onClick={() => { setEditingStaff(s); setIsModalOpen(true); }} className="p-2.5 bg-surface-950 hover:bg-brand-500 hover:text-white rounded-xl border border-surface-800 text-surface-400 transition-all">
                           <Edit2 className="w-4 h-4"/>
                        </button>
                     </div>
                  </div>
               </div>
            ))}
         </div>
      ) : activeTab === 'attendance' ? (
         <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
               <table className="w-full text-left font-medium">
                  <thead className="bg-surface-950/50 text-surface-500 text-[10px] font-black uppercase tracking-[0.1em] border-b border-surface-800">
                     <tr>
                        <th className="p-4">Name</th>
                        <th className="p-4">Date</th>
                        <th className="p-4">In Time</th>
                        <th className="p-4">Out Time</th>
                        <th className="p-4">Duration</th>
                        <th className="p-4">Overtime</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/40 text-sm">
                     {(attendanceData?.records || []).map(r => (
                        <tr key={r.id} className="hover:bg-surface-800/30 transition-colors">
                           <td className="p-4 text-white font-bold">{r.user?.full_name}</td>
                           <td className="p-4 text-surface-400">{new Date(r.clock_in).toLocaleDateString()}</td>
                           <td className="p-4 text-success-400 font-mono">{new Date(r.clock_in).toLocaleTimeString()}</td>
                           <td className="p-4 text-red-300 font-mono">{r.clock_out ? new Date(r.clock_out).toLocaleTimeString() : '--:--'}</td>
                           <td className="p-4 text-white">{r.hours_worked || 0} hrs</td>
                           <td className="p-4 text-orange-400">{r.overtime_hours > 0 ? `${r.overtime_hours} hrs` : '-'}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      ) : (
         <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-8 text-center text-surface-500">
               <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-20"/>
               <h3 className="font-bold text-white">Performance Analytics</h3>
               <p className="text-sm max-w-xs mx-auto">Compare staff sales performance, order speed and discount metrics here.</p>
               <div className="grid grid-cols-2 gap-4 mt-8">
                  {(performanceData || []).map(p => (
                     <div key={p.name} className="bg-surface-950 p-4 rounded-2xl border border-surface-800 text-left">
                        <p className="text-xs text-surface-500 font-black uppercase tracking-widest">{p.name}</p>
                        <p className="text-xl font-black text-brand-400 mt-1">₹{p.revenue.toLocaleString()}</p>
                        <p className="text-[10px] text-surface-400 mt-0.5">{p.orders} Orders Handled</p>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      )}

      {/* Staff Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingStaff ? 'Update Staff Member' : 'Register New Staff Member'} size="lg">
         <form onSubmit={e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            data.monthly_salary = Number(data.monthly_salary);
            
            if(editingStaff) {
               updateStaffMutation.mutate({ id: editingStaff.id, data: { ...data, user_id: editingStaff.user_id } });
            } else {
               createStaffMutation.mutate(data);
            }
         }} className="space-y-6">
            <div className="bg-surface-950/50 p-6 rounded-3xl border border-surface-800 space-y-4">
               <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-400 flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"/> Personal Details
               </p>
               <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                     <label className="label">Full Name*</label>
                     <input name="full_name" defaultValue={editingStaff?.user?.full_name} className="input" placeholder="e.g. Rahul Sharma" required />
                  </div>
                  <div>
                     <label className="label">Mobile Number*</label>
                     <input name="phone" defaultValue={editingStaff?.user?.phone} className="input font-mono" placeholder="9876543210" required />
                  </div>
                  <div>
                     <label className="label">Email Address</label>
                     <input name="email" type="email" defaultValue={editingStaff?.user?.email} className="input" placeholder="rahul@example.com" />
                  </div>
               </div>
            </div>

            <div className="bg-surface-950/50 p-6 rounded-3xl border border-surface-800 space-y-4">
               <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400 flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"/> Professional Role
               </p>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="label">Employee ID</label>
                     <input name="employee_code" defaultValue={editingStaff?.employee_code} className="input font-mono" placeholder="EMP-001" />
                  </div>
                  <div>
                     <label className="label">System Role*</label>
                     <select name="role" defaultValue={editingStaff?.user?.user_roles?.[0]?.role?.name || 'staff'} className="input font-bold">
                        <option value="owner">Owner (Admin)</option>
                        <option value="manager">Manager (High Access)</option>
                        <option value="cashier">Cashier (POS Only)</option>
                        <option value="waiter">Waiter (Ordering Only)</option>
                        <option value="staff">Basic Staff</option>
                     </select>
                  </div>
                  <div>
                     <label className="label">Department</label>
                     <select name="department" defaultValue={editingStaff?.department || 'Service'} className="input">
                        <option>Management</option>
                        <option>Kitchen</option>
                        <option>Service</option>
                        <option>Bar</option>
                        <option>Housekeeping</option>
                     </select>
                  </div>
                  <div>
                     <label className="label">Designation</label>
                     <input name="designation" defaultValue={editingStaff?.designation} className="input" placeholder="e.g. Captain, Head Chef" />
                  </div>
                  <div>
                     <label className="label">Monthly Salary (₹)*</label>
                     <div className="relative">
                        <input name="monthly_salary" type="number" defaultValue={editingStaff?.monthly_salary} className="input pl-9" placeholder="0" required />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 font-bold">₹</span>
                     </div>
                  </div>
                  <div>
                     <label className="label text-orange-400">Security PIN (POS)*</label>
                     <div className="relative">
                        <input name="manager_pin" type="password" defaultValue={editingStaff?.manager_pin} className="input pl-9 font-black tracking-[0.5em]" maxLength={4} placeholder="XXXX" required />
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500" />
                     </div>
                  </div>
               </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-surface-800">
               {editingStaff && (
                  <button type="button" onClick={() => { if(confirm('Are you sure you want to delete this staff member?')) deleteStaffMutation.mutate(editingStaff.id); }} className="text-red-500 hover:text-red-400 text-sm font-bold flex items-center gap-2">
                     <Trash2 className="w-4 h-4"/> Delete Member
                  </button>
               )}
               <div className="flex gap-3 ml-auto">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-surface">Cancel</button>
                  <button type="submit" disabled={createStaffMutation.isPending || updateStaffMutation.isPending} className="btn-brand px-10 relative overflow-hidden group">
                     <div className="relative z-10 flex items-center gap-2">
                        {editingStaff ? 'Update Profile' : 'Confirm Registration'}
                        <CheckCircle2 className="w-4 h-4"/>
                     </div>
                     <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"/>
                  </button>
               </div>
            </div>
         </form>
      </Modal>
    </div>
  );
}
