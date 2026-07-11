import { createSlice } from '@reduxjs/toolkit';

const storedToken = localStorage.getItem('accessToken');
const userRaw = localStorage.getItem('user');
let user = null;
try { user = userRaw ? JSON.parse(userRaw) : null; } catch { localStorage.removeItem('user'); }

const isTokenValid = (() => {
  if (!storedToken) return false;
  try {
    const payload = JSON.parse(atob(storedToken.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch { return false; }
})();

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user,
    token: storedToken || null,
    refreshToken: localStorage.getItem('refreshToken') || null,
    isAuthenticated: isTokenValid,
    loading: false,
  },
  reducers: {
    loginSuccess(state, action) {
      state.user = action.payload.user;
      state.token = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.loading = false;
      localStorage.setItem('accessToken', action.payload.accessToken);
      localStorage.setItem('refreshToken', action.payload.refreshToken);
      localStorage.setItem('user', JSON.stringify(action.payload.user));
      // Desktop auth bridge: hand the renderer JWT + outlet to the main-process
      // sync engine. No-op in the browser (window.electron is undefined).
      if (typeof window !== 'undefined' && window.electron?.setAuth) {
        try {
          window.electron.setAuth({
            token: action.payload.accessToken,
            outletId: action.payload.user?.outlet_id || action.payload.user?.outlet?.id,
          });
        } catch (_) { /* ignore */ }
      }
    },
    logout(state) {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      // Desktop auth bridge: clear the main-process sync engine credentials.
      if (typeof window !== 'undefined' && window.electron?.setAuth) {
        try {
          window.electron.setAuth({ token: null, outletId: null });
        } catch (_) { /* ignore */ }
      }
    },
    setLoading(state, action) {
      state.loading = action.payload;
    },
    updateUser(state, action) {
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem('user', JSON.stringify(state.user));
    },
  },
});

export const { loginSuccess, logout, setLoading, updateUser } = authSlice.actions;
export default authSlice.reducer;
