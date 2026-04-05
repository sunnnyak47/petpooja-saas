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
import SuperAdminPage from './pages/SuperAdminPage';

// Simple check for access
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useSelector((s) => s.auth);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
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
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<LoginPage isSignup={true} />} />
      
      <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        {/* The Home page acts as an intelligent traffic officer */}
        <Route index element={<HomeRedirect />} />
        
        {/* Owner Dashboard Items (Hidden for Super Admin via Sidebar) */}
        <Route path="pos" element={<POSPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="tables" element={<TablesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="online-orders" element={<OnlineOrdersPage />} />
        
        {/* The "Super Root" (Hidden for Owners via Sidebar) */}
        <Route path="super-admin" element={<SuperAdminPage />} />
      </Route>
      
      {/* Catch All */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
