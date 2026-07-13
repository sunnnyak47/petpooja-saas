import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import OrdersPage from './pages/OrdersPage';
import MenuPage from './pages/MenuPage';
import TablesPage from './pages/TablesPage';
import CustomersPage from './pages/CustomersPage';
import StaffPage from './pages/StaffPage';
import StaffManagementPage from './pages/StaffManagementPage';
import ReportsPage from './pages/ReportsPage';
import OnlineOrdersPage from './pages/OnlineOrdersPage';
import InventoryPage from './pages/InventoryPage';
import PurchaseOrderPage from './pages/PurchaseOrderPage';
import CentralKitchenPage from './pages/CentralKitchenPage';
import CRMPage from './pages/CRMPage';
import ONDCPage from './pages/ONDCPage';
import DynamicPricingPage from './pages/DynamicPricingPage';
import FestivalModePage from './pages/FestivalModePage';
import FraudDetectionPage from './pages/FraudDetectionPage';
import RosteringPage from './pages/RosteringPage';
import AUIntegrationsPage from './pages/AUIntegrationsPage';
import AggregatorPage from './pages/AggregatorPage';
import PrepTimeAnalyticsPage from './pages/PrepTimeAnalyticsPage';
import EODReportPage from './pages/EODReportPage';
import SuperAdminPage from './pages/SuperAdminPage';
import PlatformAnalyticsPage from './pages/PlatformAnalyticsPage';
import SupportPage from './pages/SupportPage';
import SuperAdminLoginPage from './pages/SuperAdminLoginPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import ChainDetailPage from './pages/ChainDetailPage';
import RevenueAnalyticsPage from './pages/RevenueAnalyticsPage';
import InvoicingPage from './pages/InvoicingPage';
import TaxProfilesPage from './pages/TaxProfilesPage';
import PlatformSettingsPage from './pages/PlatformSettingsPage';
import SupportTicketsPage from './pages/SupportTicketsPage';
import BroadcastPage from './pages/BroadcastPage';
import AllUsersPage from './pages/AllUsersPage';
import LeadsPage from './pages/LeadsPage';
import PromoCodesPage from './pages/PromoCodesPage';
import BillingPage from './pages/BillingPage';
import FeatureAccessPage from './pages/FeatureAccessPage';
import FeatureGate from './components/FeatureGate';
import TallySync from './pages/integrations/TallySync';
import KitchenDisplayPage from './pages/KitchenDisplayPage';
import PaymentsPage from './pages/PaymentsPage';
import CreditNotesPage from './pages/CreditNotesPage';
import SettlementsPage from './pages/SettlementsPage';
import AggregatorReconciliationPage from './pages/AggregatorReconciliationPage';
import DeliveryDispatchPage from './pages/DeliveryDispatchPage';
import Channel86Board from './pages/Channel86Board';
import ChannelAnalyticsPage from './pages/ChannelAnalyticsPage';
import DiscountsPage from './pages/DiscountsPage';
import SettingsPage from './pages/SettingsPage';
import DevicesSecurityPage from './pages/DevicesSecurityPage';
import IntegrationsPage from './pages/IntegrationsPage';
import RunningOrdersPage from './pages/RunningOrdersPage';
import AuditLogPage from './pages/AuditLogPage';
import TableQROrdersPage from './pages/TableQROrdersPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import QRCodesPage from './pages/QRCodesPage';
import CustomerOrderPage from './pages/CustomerOrderPage';
import PublicReservationPage from './pages/PublicReservationPage';
import OnlineStatusBar from './components/OnlineStatusBar';
import SyncStatusIndicator from './components/SyncStatusIndicator';
import SetupWizard from './pages/SetupWizard';
import WelcomePage from './pages/WelcomePage';
import PlatformHealthPage from './pages/PlatformHealthPage';
import ImpersonationLogPage from './pages/ImpersonationLogPage';
import PlatformAuditLogPage from './pages/PlatformAuditLogPage';
import PlatformStaffPage from './pages/PlatformStaffPage';
import ErrorDashboardPage from './pages/ErrorDashboardPage';
import { hasSAPermission } from './lib/platformRoles';
import SubscriptionPage from './pages/SubscriptionPage';
import MenuAnalyticsPage from './pages/MenuAnalyticsPage';
import LiveDashboardPage from './pages/LiveDashboardPage';
import AdvancedReportsPage from './pages/AdvancedReportsPage';
import ReservationsPage from './pages/ReservationsPage';
import ChainHealthPage from './pages/ChainHealthPage';
import OnboardingPage from './pages/OnboardingPage';
import GSTCompliancePage from './pages/GSTCompliancePage';
import GstReturnsPage from './pages/GstReturnsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import XeroAnalyticsPage from './pages/XeroAnalyticsPage';
import BusinessHealthPage from './pages/BusinessHealthPage';
import AccountingPage from './pages/AccountingPage';
import PayrollPage from './pages/PayrollPage';
import FixedAssetsPage from './pages/FixedAssetsPage';
import BudgetsPage from './pages/BudgetsPage';
import CustomerInvoicesPage from './pages/CustomerInvoicesPage';

/* ── 404 Page ───────────────────────────────────────────────────────────────── */
function NotFoundPage() {
  const location = useLocation();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
        <div style={{ fontSize: 72, fontWeight: 900, color: '#e2e8f0', marginBottom: 8 }}>404</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
          Page Not Found
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
          The page <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{location.pathname}</code> doesn't exist.
        </p>
        <button
          onClick={() => { window.location.hash = '#/'; }}
          style={{
            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

/* ── Role Guard ─────────────────────────────────────────────────────────────── */
function RoleGuard({ allowed, children }) {
  const { user } = useSelector((s) => s.auth);
  if (!user || !allowed.includes(user.role)) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, fontFamily: 'Inter, -apple-system, sans-serif',
      }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Access Denied</h2>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            You don't have permission to view this page. Required role: {allowed.join(' or ')}.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

// Simple check for access
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useSelector((s) => s.auth);
  return isAuthenticated ? children : <Navigate to="/welcome" replace />;
}

/* ── Permission Guard ──────────────────────────────────────────────────────────
   For SuperAdmin console pages that scoped staff must not reach. super_admin
   always passes; scoped staff need the given permission. (Backend re-enforces.) */
function PermissionGuard({ permission, children }) {
  const { user } = useSelector((s) => s.auth);
  if (!hasSAPermission(user, permission)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Access Denied</h2>
          <p style={{ fontSize: 14, color: '#64748b' }}>You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return children;
}

// Logic: If I am the software owner, take me to my client list.
// If I am a client (restaurant), take me to my dashboard.
function HomeRedirect() {
  const { user } = useSelector((s) => s.auth);
  if (user?.role === 'super_admin') {
    // SA-001: the super-admin landing is the platform Analytics dashboard, NOT the
    // Restaurant-Chains list (that lives at /super-admin). Previously both routes
    // rendered SuperAdminPage, so the two sidebar tabs showed the identical screen.
    return <PlatformAnalyticsPage />;
  }
  // New restaurant owners who haven't completed onboarding
  const onboardingComplete =
    user?.head_office?.setup_completed === true ||
    localStorage.getItem('msrm_onboarding_complete') === 'true';
  if (!onboardingComplete && user?.role === 'owner') {
    return <Navigate to="/onboarding" replace />;
  }
  return <DashboardPage />;
}

export default function App() {
  const { isAuthenticated } = useSelector((s) => s.auth);
  const [setupComplete, setSetupComplete] = useState(
    localStorage.getItem('msrm_setup_completed') === 'true'
  );

  // ── Xero OAuth2 callback interceptor ────────────────────────────────────
  // Xero redirects to the root URL with ?code=...&state=... in the query string.
  // Hash routing loses those params, so we stash them in sessionStorage and
  // navigate to #/au-integrations which reads them back.
  useEffect(() => {
    const search = window.location.search;
    if (!search) return;
    const params = new URLSearchParams(search);
    const code  = params.get('code');
    const state = params.get('state');
    // state format is "outletId:timestamp" (set in au-integrations.routes.js)
    if (code && state && state.includes(':')) {
      sessionStorage.setItem('xero_oauth_code',  code);
      sessionStorage.setItem('xero_oauth_state', state);
      // Clean the query string from the browser URL without a full reload
      window.history.replaceState({}, '', window.location.pathname);
      // Navigate into the app at the integrations page
      window.location.hash = '#/au-integrations';
    }
  }, []);

  const handleSetupComplete = async (config) => {
    if (window.electron) {
      await window.electron.invoke('set-config', 'outlet_id', config.outlet_id);
      await window.electron.invoke('set-config', 'printerIp', config.printer_ip);
      // Boot rehydration: Redux rehydrates the session from localStorage, but nothing
      // pushes that token to the Electron main process until the next explicit login.
      // Bridge the already-valid token now so getHeaders has it from the first sync
      // cycle. Guarded by window.electron?.setAuth — no-op on the browser path.
      const t = localStorage.getItem('accessToken');
      if (t && window.electron?.setAuth) window.electron.setAuth({ token: t, outletId: config.outlet_id });
    }
    localStorage.setItem('msrm_setup_completed', 'true');
    setSetupComplete(true);
  };

  return (
    <ErrorBoundary>
    <OnlineStatusBar />
    <SyncStatusIndicator />
    <Routes>
      {typeof window !== 'undefined' && window.electron && !setupComplete && !isAuthenticated && (
        <Route path="*" element={<SetupWizard onComplete={handleSetupComplete} />} />
      )}
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/superadmin-login" element={<SuperAdminLoginPage />} />
      {/* TODO: Signup route is a placeholder — LoginPage does not use isSignup prop yet */}
      <Route path="/signup" element={<LoginPage isSignup={true} />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* PUBLIC: Customer ordering page — accessed via QR code scan */}
      <Route path="/order" element={<CustomerOrderPage />} />

      {/* PUBLIC: Self-service table reservation — accessed via QR code / shared link */}
      <Route path="/reserve" element={<PublicReservationPage />} />

      <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        {/* The Home page acts as an intelligent traffic officer */}
        <Route index element={<HomeRedirect />} />
        <Route path="onboarding" element={<OnboardingPage />} />

        {/* Owner Dashboard Items (Hidden for Super Admin via Sidebar) */}
        <Route path="pos"             element={<FeatureGate feature="pos"><POSPage /></FeatureGate>} />
        <Route path="running-orders"  element={<FeatureGate feature="running_orders"><RunningOrdersPage /></FeatureGate>} />
        <Route path="orders"          element={<FeatureGate feature="orders"><OrdersPage /></FeatureGate>} />
        <Route path="menu"            element={<FeatureGate feature="menu"><MenuPage /></FeatureGate>} />
        <Route path="tables"          element={<FeatureGate feature="tables"><TablesPage /></FeatureGate>} />
        <Route path="customers"       element={<FeatureGate feature="customers"><CustomersPage /></FeatureGate>} />
        <Route path="staff"           element={<FeatureGate feature="staff"><StaffPage /></FeatureGate>} />
        <Route path="staff-management" element={<FeatureGate feature="staff"><StaffManagementPage /></FeatureGate>} />
        <Route path="reports"         element={<FeatureGate feature="reports"><ReportsPage /></FeatureGate>} />
        <Route path="inventory"       element={<FeatureGate feature="inventory"><InventoryPage /></FeatureGate>} />
        <Route path="purchase-orders" element={<FeatureGate feature="purchase_orders"><PurchaseOrderPage /></FeatureGate>} />
        <Route path="central-kitchen" element={<FeatureGate feature="central_kitchen"><CentralKitchenPage /></FeatureGate>} />
        <Route path="crm"             element={<FeatureGate feature="crm"><CRMPage /></FeatureGate>} />
        <Route path="ondc"            element={<FeatureGate feature="ondc"><ONDCPage /></FeatureGate>} />
        <Route path="pricing"         element={<FeatureGate feature="dynamic_pricing"><DynamicPricingPage /></FeatureGate>} />
        <Route path="festival"        element={<FeatureGate feature="festival_mode"><FestivalModePage /></FeatureGate>} />
        <Route path="fraud"           element={<FeatureGate feature="fraud"><FraudDetectionPage /></FeatureGate>} />
        <Route path="rostering"       element={<FeatureGate feature="rostering"><RosteringPage /></FeatureGate>} />
        <Route path="au-integrations" element={<FeatureGate feature="integrations"><AUIntegrationsPage /></FeatureGate>} />
        <Route path="aggregators"     element={<FeatureGate feature="aggregators"><AggregatorPage /></FeatureGate>} />
        <Route path="prep-analytics"  element={<FeatureGate feature="prep_analytics"><PrepTimeAnalyticsPage /></FeatureGate>} />
        <Route path="eod-report"      element={<FeatureGate feature="eod_report"><EODReportPage /></FeatureGate>} />
        <Route path="online-orders"   element={<FeatureGate feature="online_orders"><OnlineOrdersPage /></FeatureGate>} />
        <Route path="kitchen"         element={<FeatureGate feature="kitchen"><KitchenDisplayPage /></FeatureGate>} />
        <Route path="payments"        element={<FeatureGate feature="payments"><PaymentsPage /></FeatureGate>} />
        <Route path="credit-notes"    element={<FeatureGate feature="payments"><CreditNotesPage /></FeatureGate>} />
        <Route path="settlements"     element={<FeatureGate feature="payments"><SettlementsPage /></FeatureGate>} />
        <Route path="aggregator-reconciliation" element={<FeatureGate feature="payments"><AggregatorReconciliationPage /></FeatureGate>} />
        <Route path="delivery"        element={<FeatureGate feature="payments"><DeliveryDispatchPage /></FeatureGate>} />
        <Route path="86-board"        element={<FeatureGate feature="menu"><Channel86Board /></FeatureGate>} />
        <Route path="channel-analytics" element={<FeatureGate feature="reports"><ChannelAnalyticsPage /></FeatureGate>} />
        <Route path="discounts"       element={<FeatureGate feature="discounts"><DiscountsPage /></FeatureGate>} />
        <Route path="settings"        element={<SettingsPage />} />
        <Route path="integrations"    element={<FeatureGate feature="integrations"><IntegrationsPage /></FeatureGate>} />
        <Route path="integrations/tally" element={<FeatureGate feature="integrations"><TallySync /></FeatureGate>} />
        <Route path="audit-log"       element={<FeatureGate feature="audit_log"><AuditLogPage /></FeatureGate>} />
        <Route path="qr-codes"        element={<FeatureGate feature="qr_codes"><QRCodesPage /></FeatureGate>} />
        <Route path="qr-orders"       element={<FeatureGate feature="qr_orders"><TableQROrdersPage /></FeatureGate>} />
        <Route path="gst-compliance"  element={<ProtectedRoute><GSTCompliancePage /></ProtectedRoute>} />
        <Route path="gst-returns"     element={<ProtectedRoute><GstReturnsPage /></ProtectedRoute>} />
        <Route path="privacy-policy"  element={<ProtectedRoute><PrivacyPolicyPage /></ProtectedRoute>} />
        <Route path="devices"         element={<DevicesSecurityPage />} />

        {/* The "Super Root" — guarded by RoleGuard for super_admin only */}
        <Route path="super-admin" element={<RoleGuard allowed={['super_admin']}><SuperAdminPage /></RoleGuard>} />
        <Route path="billing" element={<RoleGuard allowed={['super_admin']}><BillingPage /></RoleGuard>} />
        <Route path="feature-access" element={<RoleGuard allowed={['super_admin']}><FeatureAccessPage /></RoleGuard>} />
        <Route path="announcements" element={<RoleGuard allowed={['super_admin']}><AnnouncementsPage /></RoleGuard>} />
        <Route path="chain/:id" element={<RoleGuard allowed={['super_admin']}><ChainDetailPage /></RoleGuard>} />
        <Route path="revenue-analytics" element={<RoleGuard allowed={['super_admin']}><RevenueAnalyticsPage /></RoleGuard>} />
        <Route path="invoicing" element={<RoleGuard allowed={['super_admin']}><InvoicingPage /></RoleGuard>} />
        <Route path="tax-profiles" element={<RoleGuard allowed={['super_admin']}><TaxProfilesPage /></RoleGuard>} />
        <Route path="platform-settings" element={<RoleGuard allowed={['super_admin']}><PlatformSettingsPage /></RoleGuard>} />
        <Route path="support-tickets" element={<RoleGuard allowed={['super_admin']}><SupportTicketsPage /></RoleGuard>} />
        <Route path="broadcasts" element={<RoleGuard allowed={['super_admin']}><BroadcastPage /></RoleGuard>} />
        <Route path="all-users" element={<RoleGuard allowed={['super_admin']}><AllUsersPage /></RoleGuard>} />
        <Route path="leads" element={<RoleGuard allowed={['super_admin', 'platform_admin', 'platform_support', 'platform_billing', 'platform_readonly']}><LeadsPage /></RoleGuard>} />
        <Route path="promo-codes" element={<RoleGuard allowed={['super_admin']}><PromoCodesPage /></RoleGuard>} />

        {/* P3 Routes */}
        <Route path="platform-health"    element={<RoleGuard allowed={['super_admin']}><PlatformHealthPage /></RoleGuard>} />
        <Route path="impersonation-log"  element={<RoleGuard allowed={['super_admin']}><ImpersonationLogPage /></RoleGuard>} />
        <Route path="platform-audit-log" element={<RoleGuard allowed={['super_admin']}><PlatformAuditLogPage /></RoleGuard>} />
        <Route path="error-dashboard" element={<RoleGuard allowed={['super_admin']}><PermissionGuard permission="sa.audit.view"><ErrorDashboardPage /></PermissionGuard></RoleGuard>} />
        <Route path="platform-staff" element={<RoleGuard allowed={['super_admin']}><PermissionGuard permission="sa.staff.manage"><PlatformStaffPage /></PermissionGuard></RoleGuard>} />
        <Route path="advanced-reports"   element={<AdvancedReportsPage />} />
        <Route path="xero-analytics"    element={<XeroAnalyticsPage />} />
        <Route path="business-health"   element={<BusinessHealthPage />} />
        <Route path="accounting"        element={<AccountingPage />} />
        <Route path="payroll"           element={<PayrollPage />} />
        <Route path="fixed-assets"      element={<FixedAssetsPage />} />
        <Route path="budgets"           element={<BudgetsPage />} />
        <Route path="customer-invoices" element={<CustomerInvoicesPage />} />
        <Route path="reservations"       element={<ReservationsPage />} />

        {/* Chain Health Score */}
        <Route path="chain-health"       element={<ChainHealthPage />} />

        {/* P4 Routes */}
        <Route path="subscription"       element={<SubscriptionPage />} />
        <Route path="menu-analytics"     element={<MenuAnalyticsPage />} />
        <Route path="support"            element={<SupportPage />} />
        <Route path="live"               element={<LiveDashboardPage />} />
      </Route>

      {/* 404 Catch All */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </ErrorBoundary>
  );
}
