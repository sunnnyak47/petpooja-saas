import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import OrdersPage from './pages/OrdersPage';
import MenuPage from './pages/MenuPage';
import TablesPage from './pages/TablesPage';
import CustomersPage from './pages/CustomersPage';
import StaffPage from './pages/StaffPage';
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
import AnnouncementsPage from './pages/AnnouncementsPage';
import ChainDetailPage from './pages/ChainDetailPage';
import RevenueAnalyticsPage from './pages/RevenueAnalyticsPage';
import InvoicingPage from './pages/InvoicingPage';
import TaxProfilesPage from './pages/TaxProfilesPage';
import PlatformSettingsPage from './pages/PlatformSettingsPage';
import SupportTicketsPage from './pages/SupportTicketsPage';
import BroadcastPage from './pages/BroadcastPage';
import AllUsersPage from './pages/AllUsersPage';
import PromoCodesPage from './pages/PromoCodesPage';
import BillingPage from './pages/BillingPage';
import FeatureAccessPage from './pages/FeatureAccessPage';
import FeatureGate from './components/FeatureGate';
import TallySync from './pages/integrations/TallySync';
import KitchenDisplayPage from './pages/KitchenDisplayPage';
import PaymentsPage from './pages/PaymentsPage';
import DiscountsPage from './pages/DiscountsPage';
import SettingsPage from './pages/SettingsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import RunningOrdersPage from './pages/RunningOrdersPage';
import AuditLogPage from './pages/AuditLogPage';
import TableQROrdersPage from './pages/TableQROrdersPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import QRCodesPage from './pages/QRCodesPage';
import CustomerOrderPage from './pages/CustomerOrderPage';
import { OfflineBanner } from './hooks/useOfflineSync';
import OnlineStatusBar from './components/OnlineStatusBar';
import SyncStatusIndicator from './components/SyncStatusIndicator';
import SetupWizard from './pages/SetupWizard';
import WelcomePage from './pages/WelcomePage';

// Simple check for access
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useSelector((s) => s.auth);
  return isAuthenticated ? children : <Navigate to="/welcome" replace />;
}

// Logic: If I am the software owner, take me to my client list.
// If I am a client (restaurant), take me to my dashboard.
function HomeRedirect() {
  const { user } = useSelector((s) => s.auth);
  if (user?.role === 'super_admin') {
     return <SuperAdminPage />;
  }
  return <DashboardPage />;
}

export default function App() {
  const [setupComplete, setSetupComplete] = useState(
    localStorage.getItem('petpooja_setup_complete') === 'true'
  );

  const handleSetupComplete = (config) => {
    window.electron.invoke('set-config', 'outlet_id', config.outlet_id);
    window.electron.invoke('set-config', 'printerIp', config.printer_ip);
    localStorage.setItem('petpooja_setup_complete', 'true');
    setSetupComplete(true);
  };

  return (
    <>
    <OnlineStatusBar />
    <SyncStatusIndicator />
    <OfflineBanner />
    <Routes>
      {typeof window !== 'undefined' && window.electron && !setupComplete && (
        <Route path="*" element={<SetupWizard onComplete={handleSetupComplete} />} />
      )}
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<LoginPage isSignup={true} />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      
      {/* PUBLIC: Customer ordering page — accessed via QR code scan */}
      <Route path="/order" element={<CustomerOrderPage />} />
      
      <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        {/* The Home page acts as an intelligent traffic officer */}
        <Route index element={<HomeRedirect />} />
        
        {/* Owner Dashboard Items (Hidden for Super Admin via Sidebar) */}
        <Route path="pos"             element={<FeatureGate feature="pos"><POSPage /></FeatureGate>} />
        <Route path="running-orders"  element={<FeatureGate feature="running_orders"><RunningOrdersPage /></FeatureGate>} />
        <Route path="orders"          element={<FeatureGate feature="orders"><OrdersPage /></FeatureGate>} />
        <Route path="menu"            element={<FeatureGate feature="menu"><MenuPage /></FeatureGate>} />
        <Route path="tables"          element={<FeatureGate feature="tables"><TablesPage /></FeatureGate>} />
        <Route path="customers"       element={<FeatureGate feature="customers"><CustomersPage /></FeatureGate>} />
        <Route path="staff"           element={<FeatureGate feature="staff"><StaffPage /></FeatureGate>} />
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
        <Route path="discounts"       element={<FeatureGate feature="discounts"><DiscountsPage /></FeatureGate>} />
        <Route path="settings"        element={<SettingsPage />} />
        <Route path="integrations"    element={<FeatureGate feature="integrations"><IntegrationsPage /></FeatureGate>} />
        <Route path="integrations/tally" element={<FeatureGate feature="integrations"><TallySync /></FeatureGate>} />
        <Route path="audit-log"       element={<FeatureGate feature="audit_log"><AuditLogPage /></FeatureGate>} />
        <Route path="qr-codes"        element={<FeatureGate feature="qr_codes"><QRCodesPage /></FeatureGate>} />
        <Route path="qr-orders"       element={<FeatureGate feature="qr_orders"><TableQROrdersPage /></FeatureGate>} />
        
        {/* The "Super Root" (Hidden for Owners via Sidebar) */}
        <Route path="super-admin" element={<SuperAdminPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="feature-access" element={<FeatureAccessPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="chain/:id" element={<ChainDetailPage />} />
        <Route path="revenue-analytics" element={<RevenueAnalyticsPage />} />
        <Route path="invoicing" element={<InvoicingPage />} />
        <Route path="tax-profiles" element={<TaxProfilesPage />} />
        <Route path="platform-settings" element={<PlatformSettingsPage />} />
        <Route path="support-tickets" element={<SupportTicketsPage />} />
        <Route path="broadcasts" element={<BroadcastPage />} />
        <Route path="all-users" element={<AllUsersPage />} />
        <Route path="promo-codes" element={<PromoCodesPage />} />
      </Route>
      
      {/* Catch All */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
