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
import CentralKitchenPage from './pages/CentralKitchenPage';
import SuperAdminPage from './pages/SuperAdminPage';
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

  if (typeof window !== 'undefined' && window.electron && !setupComplete) {
    return <SetupWizard onComplete={(config) => {
      window.electron.invoke('set-config', 'outlet_id', config.outlet_id);
      window.electron.invoke('set-config', 'printerIp', config.printer_ip);
      localStorage.setItem('petpooja_setup_complete', 'true');
      setSetupComplete(true);
    }} />;
  }

  return (
    <>
    <OnlineStatusBar />
    <SyncStatusIndicator />
    <OfflineBanner />
    <Routes>
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
        <Route path="pos" element={<POSPage />} />
        <Route path="running-orders" element={<RunningOrdersPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="tables" element={<TablesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="central-kitchen" element={<CentralKitchenPage />} />
        <Route path="online-orders" element={<OnlineOrdersPage />} />
        <Route path="kitchen" element={<KitchenDisplayPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="discounts" element={<DiscountsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="integrations/tally" element={<TallySync />} />
        <Route path="audit-log" element={<AuditLogPage />} />
        <Route path="qr-codes" element={<QRCodesPage />} />
        <Route path="qr-orders" element={<TableQROrdersPage />} />
        
        {/* The "Super Root" (Hidden for Owners via Sidebar) */}
        <Route path="super-admin" element={<SuperAdminPage />} />
      </Route>
      
      {/* Catch All */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
