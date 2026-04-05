import { createSlice } from '@reduxjs/toolkit';

const token = localStorage.getItem('accessToken');
const user = localStorage.getItem('user');

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: user ? JSON.parse(user) : null,
    token: token || null,
    isAuthenticated: !!token,
    loading: false,
  },
  reducers: {
    loginSuccess(state, action) {
      state.user = action.payload.user;
      state.token = action.payload.accessToken;
      state.isAuthenticated = true;
      state.loading = false;
      localStorage.setItem('accessToken', action.payload.accessToken);
      localStorage.setItem('refreshToken', action.payload.refreshToken);
      localStorage.setItem('user', JSON.stringify(action.payload.user));
    },
    logout(state) {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
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
