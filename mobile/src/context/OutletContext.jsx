import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import api from '../lib/api';

const OUTLET_KEY = 'selected_outlet_id';
const OutletContext = createContext(null);

export function OutletProvider({ children }) {
  const { user } = useAuth();
  const [outletId, setOutletIdState] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Fetch outlets
        const res = await api.get('/ho/outlets');
        const list = res?.data || res?.outlets || res || [];
        const outletList = Array.isArray(list) ? list : [];
        setOutlets(outletList);

        // Restore saved selection or default to user's outlet
        const saved = await AsyncStorage.getItem(OUTLET_KEY);
        const validId = saved && outletList.some(o => String(o.id) === saved)
          ? saved
          : String(user.outlet_id || outletList[0]?.id || '');
        setOutletIdState(validId);
      } catch (e) {
        // Fallback to user's outlet_id
        setOutletIdState(String(user.outlet_id || ''));
      }
      setIsLoading(false);
    })();
  }, [user]);

  const setOutletId = async (id) => {
    const strId = String(id);
    setOutletIdState(strId);
    await AsyncStorage.setItem(OUTLET_KEY, strId);
  };

  const currentOutlet = outlets.find(o => String(o.id) === String(outletId)) || null;

  return (
    <OutletContext.Provider value={{ outletId, setOutletId, outlets, currentOutlet, isLoading }}>
      {children}
    </OutletContext.Provider>
  );
}

export const useOutlet = () => {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error('useOutlet must be inside OutletProvider');
  return ctx;
};
