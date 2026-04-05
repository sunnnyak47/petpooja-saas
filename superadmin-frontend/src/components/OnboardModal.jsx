import { useState, useMemo } from 'react';
import { 
  X, Building2, User, Mail, Phone, Lock, MapPin, 
  CheckCircle2, Loader2, IndianRupee, Gavel, ArrowRight, 
  ArrowLeft, Smartphone, Printer, Globe, CreditCard, 
  Zap, ChefHat, Hash 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 1, title: 'Identity', icon: Building2 },
  { id: 2, title: 'Legal & Tax', icon: Gavel },
  { id: 3, title: 'Owner', icon: User },
  { id: 4, title: 'Subscription', icon: CreditCard },
  { id: 5, title: 'Setup', icon: ChefHat },
  { id: 6, title: 'Connect', icon: Zap },
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", 
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", 
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", 
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", 
  "Uttarakhand", "West Bengal", "Delhi", "Chandigarh", "Puducherry"
];

export default function OnboardModal({ isOpen, onClose, onOnboard }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // Step 1: Identity
    name: '',
    legal_name: '',
    type: 'RESTAURANT',
    cuisine: '',
    address: '',
    city: '',
    state: 'Maharashtra',
    district: '',
    pincode: '',
    logo_url: '',
    // Step 2: Legal
    gstin: '',
    gst_type: 'REGULAR',
    fssai: '',
    fssai_expiry: '',
    pan: '',
    is_ac: false,
    serves_alcohol: false,
    service_charge_pct: 0,
    gst_inclusive: false,
    default_gst_slab: '5',
    // Step 3: Owner
    owner_name: '',
    contact_email: '',
    contact_phone: '',
    whatsapp_number: '',
    language: 'en',
    password: '',
    // Step 4: Subscription
    plan: 'PREMIUM',
    payment_status: 'pending',
    payment_method: 'upi_razorpay',
    starts_at: new Date().toISOString().split('T')[0],
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    // Step 5: Setup
    tables_count: 10,
    printer_type: 'THERMAL',
    printer_ip: '',
    bill_header: '',
    bill_footer: 'Thank you for dining with us!',
    // Step 6: Integrations
    zomato_id: '',
    swiggy_id: '',
    razorpay_key: '',
    tally_enabled: false
  });

  if (!isOpen) return null;

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 6));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (currentStep < 6) return nextStep();

    setLoading(true);
    try {
      await onOnboard(formData);
      onClose();
      setCurrentStep(1); // Reset
    } catch (error) {
      toast.error(error.message || 'Onboarding failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-900 border border-white/10 w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-8 py-6 bg-indigo-600 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <Building2 className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white leading-tight">Onboard Enterprise</h2>
              <p className="text-[10px] text-white/60 font-bold uppercase tracking-[0.2em]">6-Step Indian Market Wizard</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-8 py-4 bg-slate-900 border-b border-white/5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center gap-2 min-w-max">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500 ${
                  isActive ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40' : 
                  isCompleted ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500'
                }`}>
                  {isCompleted ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-white' : 'text-slate-600'}`}>
                  {step.title}
                </span>
                {step.id < 6 && <div className="w-4 h-[1px] bg-slate-800 mx-2" />}
              </div>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ x: 10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -10, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* STEP 1: IDENTITY */}
              {currentStep === 1 && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 flex items-center gap-2 text-indigo-400">
                    <Building2 size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Restaurant Identity</h3>
                  </div>
                  <InputField label="Restaurant Brand Name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Punjabi Tadka" icon={Building2} required />
                  <InputField label="Legal Entity Name" name="legal_name" value={formData.legal_name} onChange={handleChange} placeholder="e.g. Punjabi Tadka Pvt Ltd" icon={Gavel} />
                  <SelectField label="Outlet Type" name="type" value={formData.type} onChange={handleChange} options={['RESTAURANT', 'CAFE', 'BAKERY', 'BAR', 'CLOUD_KITCHEN']} />
                  <InputField label="Primary Cuisine" name="cuisine" value={formData.cuisine} onChange={handleChange} placeholder="North Indian, Chinese..." icon={ChefHat} />
                  <div className="col-span-2">
                    <InputField label="Full Operation Address" name="address" value={formData.address} onChange={handleChange} placeholder="Shop 4, Ground Floor, Global Mall..." icon={MapPin} />
                  </div>
                  <InputField label="City" name="city" value={formData.city} onChange={handleChange} placeholder="Mumbai" icon={MapPin} />
                  <SelectField label="State" name="state" value={formData.state} onChange={handleChange} options={INDIAN_STATES} />
                  <InputField label="District" name="district" value={formData.district} onChange={handleChange} placeholder="Mumbai Suburban" icon={MapPin} />
                  <InputField label="PIN Code" name="pincode" value={formData.pincode} onChange={handleChange} placeholder="400001" icon={Hash} />
                </div>
              )}

              {/* STEP 2: LEGAL & TAX */}
              {currentStep === 2 && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 flex items-center gap-2 text-indigo-400">
                    <Gavel size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Compliance & Taxation</h3>
                  </div>
                  <InputField label="GSTIN (15 Digits)" name="gstin" value={formData.gstin} onChange={handleChange} placeholder="27XXXXX0000X1Z5" icon={Hash} />
                  <SelectField label="GST Registration Type" name="gst_type" value={formData.gst_type} onChange={handleChange} options={['REGULAR', 'COMPOSITION', 'UNREGISTERED']} />
                  <InputField label="FSSAI License No." name="fssai" value={formData.fssai} onChange={handleChange} placeholder="14 Digit Number" icon={Hash} />
                  <InputField label="FSSAI Expiry" name="fssai_expiry" type="date" value={formData.fssai_expiry} onChange={handleChange} icon={Zap} />
                  <InputField label="PAN Number" name="pan" value={formData.pan} onChange={handleChange} placeholder="ABCDE1234F" icon={Hash} />
                  <SelectField label="Default GST Slab (%)" name="default_gst_slab" value={formData.default_gst_slab} onChange={handleChange} options={['0', '5', '12', '18', '28']} />
                  
                  <div className="col-span-2 grid grid-cols-3 gap-4 pt-4">
                    <ToggleField label="AC Facility" name="is_ac" checked={formData.is_ac} onChange={handleChange} />
                    <ToggleField label="Serves Alcohol" name="serves_alcohol" checked={formData.serves_alcohol} onChange={handleChange} />
                    <ToggleField label="GST Inclusive Pricing" name="gst_inclusive" checked={formData.gst_inclusive} onChange={handleChange} />
                  </div>
                </div>
              )}

              {/* STEP 3: OWNER */}
              {currentStep === 3 && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 flex items-center gap-2 text-indigo-400">
                    <User size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Owner / SuperAdmin Access</h3>
                  </div>
                  <InputField label="Owner Full Name" name="owner_name" value={formData.owner_name} onChange={handleChange} placeholder="Sundeep Thakur" icon={User} required />
                  <InputField label="Login Mobile No." name="contact_phone" value={formData.contact_phone} onChange={handleChange} placeholder="98XXXXXXXX" icon={Phone} required />
                  <InputField label="Login Password" name="password" type="password" value={formData.password} onChange={handleChange} placeholder="••••••••" icon={Lock} required />
                  <InputField label="Work Email" name="contact_email" type="email" value={formData.contact_email} onChange={handleChange} placeholder="owner@restaurant.com" icon={Mail} required />
                  <InputField label="WhatsApp (Optional)" name="whatsapp_number" value={formData.whatsapp_number} onChange={handleChange} placeholder="Update notifications here" icon={Smartphone} />
                  <SelectField label="System Language" name="language" value={formData.language} onChange={handleChange} options={['en', 'hi', 'mr', 'gu']} />
                </div>
              )}

              {/* STEP 4: SUBSCRIPTION */}
              {currentStep === 4 && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 flex items-center gap-2 text-indigo-400">
                    <CreditCard size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">License & Billing</h3>
                  </div>
                  <SelectField label="Software Plan" name="plan" value={formData.plan} onChange={handleChange} options={['BASIC', 'ENTERPRISE', 'PREMIUM', 'TRIAL']} />
                  <SelectField label="Payment Status" name="payment_status" value={formData.payment_status} onChange={handleChange} options={['pending', 'paid', 'trial']} />
                  <InputField label="UTR / Reference No" name="utr_reference" value={formData.utr_reference} onChange={handleChange} placeholder="Transaction ID" icon={Hash} />
                  <SelectField label="Payment Method" name="payment_method" value={formData.payment_method} onChange={handleChange} options={['cash', 'upi_razorpay', 'bank_transfer', 'cheque']} />
                  <InputField label="Plan Start Date" name="starts_at" type="date" value={formData.starts_at} onChange={handleChange} icon={Zap} />
                  <InputField label="Plan Expiry Date" name="expires_at" type="date" value={formData.expires_at} onChange={handleChange} icon={Zap} />
                </div>
              )}

              {/* STEP 5: SETUP & HARDWARE */}
              {currentStep === 5 && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 flex items-center gap-2 text-indigo-400">
                    <Printer size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">POS Configuration</h3>
                  </div>
                  <InputField label="Total Table Count" name="tables_count" type="number" value={formData.tables_count} onChange={handleChange} icon={Hash} />
                  <SelectField label="Printer Interface" name="printer_type" value={formData.printer_type} onChange={handleChange} options={['THERMAL', 'LASER', 'NETWORK', 'BLUETOOTH']} />
                  <InputField label="Printer Local IP" name="printer_ip" value={formData.printer_ip} onChange={handleChange} placeholder="192.168.1.100" icon={Globe} />
                  <div className="col-span-2 space-y-4">
                    <TextAreaField label="Invoice Header Text" name="bill_header" value={formData.bill_header} onChange={handleChange} placeholder="Brand Name, GST No, Tagline..." />
                    <TextAreaField label="Invoice Footer Message" name="bill_footer" value={formData.bill_footer} onChange={handleChange} placeholder="Visit again! No alcohol served." />
                  </div>
                </div>
              )}

              {/* STEP 6: INTEGRATIONS */}
              {currentStep === 6 && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 flex items-center gap-2 text-indigo-400">
                    <Zap size={16} />
                    <h3 className="text-xs font-black uppercase tracking-widest">Connect 3rd Party</h3>
                  </div>
                  <InputField label="Zomato Restaurant ID" name="zomato_id" value={formData.zomato_id} onChange={handleChange} placeholder="E.g. 1892341" icon={IndianRupee} />
                  <InputField label="Swiggy Restaurant ID" name="swiggy_id" value={formData.swiggy_id} onChange={handleChange} placeholder="E.g. 772311" icon={IndianRupee} />
                  <InputField label="Razorpay API Key" name="razorpay_key" value={formData.razorpay_key} onChange={handleChange} placeholder="rzp_live_XXXXXXXX" icon={Zap} />
                  <ToggleField label="Enable Tally Prime Export" name="tally_enabled" checked={formData.tally_enabled} onChange={handleChange} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </form>

        {/* Footer Actions */}
        <div className="p-8 bg-slate-950/50 border-t border-white/5 flex items-center justify-between">
          <button 
            type="button"
            onClick={prevStep}
            disabled={currentStep === 1 || loading}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-0 text-white font-bold rounded-2xl transition-all flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            Back
          </button>
          
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Step {currentStep} of 6
            </span>
            <button 
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className={`px-10 py-3 ${currentStep === 6 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-black rounded-2xl transition-all shadow-lg flex items-center gap-3 active:scale-[0.98]`}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Processing...
                </>
              ) : currentStep === 6 ? (
                <>
                  <CheckCircle2 size={18} />
                  Launch Restaurant
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// —— Reusable UI Components ——

function InputField({ label, name, value, onChange, placeholder, icon: Icon, type = 'text', required }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{label} {required && '*'}</label>
      <div className="relative group">
        <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
        <input 
          name={name}
          type={type}
          required={required}
          value={value}
          onChange={onChange}
          className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-700" 
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{label}</label>
      <select 
        name={name}
        value={value}
        onChange={onChange}
        className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-3 px-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer"
      >
        {options.map(opt => (
          <option key={opt} value={opt} className="bg-slate-900">{opt}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, name, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 p-4 bg-slate-950/50 border border-white/5 rounded-2xl cursor-pointer hover:border-white/10 transition-all group">
      <div className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" name={name} checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
      </div>
      <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{label}</span>
    </label>
  );
}

function TextAreaField({ label, name, value, onChange, placeholder }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{label}</label>
      <textarea 
        name={name}
        value={value}
        onChange={onChange}
        rows={2}
        className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-3 px-4 text-white text-sm font-bold focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-slate-700 resize-none" 
        placeholder={placeholder}
      />
    </div>
  );
}
