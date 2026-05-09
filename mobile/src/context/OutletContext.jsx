import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const OutletContext = createContext(null);

export function OutletProvider({ children }) {
  const { user } = useAuth();
  const [outletId, setOutletId] = useState(null);
  const [outlets, setOutlets] = useState([]);

  // Seed the selected outlet from the authenticated user's default
  useEffect(() => {
    if (user?.outlet_id && !outletId) {
      setOutletId(user.outlet_id);
    }
  }, [user]);

  return (
    <OutletContext.Provider value={{ outletId, setOutletId, outlets, setOutlets }}>
      {children}
    </OutletContext.Provider>
  );
}

export const useOutlet = () => {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error('useOutlet must be used within OutletProvider');
  return ctx;
};
