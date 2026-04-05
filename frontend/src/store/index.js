import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import posReducer from './slices/posSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    pos: posReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
});
