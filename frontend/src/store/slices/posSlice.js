import { createSlice } from '@reduxjs/toolkit';

const posSlice = createSlice({
  name: 'pos',
  initialState: {
    currentOrder: null,
    cart: [],
    selectedTable: null,
    selectedCustomer: null,
    orderType: 'dine_in',
    discount: { type: null, value: 0, reason: '' },
    orderNotes: '',
    covers: 1,
  },
  reducers: {
    addToCart(state, action) {
      const item = action.payload;
      const existing = state.cart.find(
        (c) => 
          c.menu_item_id === item.menu_item_id && 
          c.variant_id === item.variant_id &&
          JSON.stringify(c.addons || []) === JSON.stringify(item.addons || [])
      );
      if (existing) {
        existing.quantity += item.quantity || 1;
      } else {
        state.cart.push({ ...item, quantity: item.quantity || 1, addons: item.addons || [] });
      }
    },
    removeFromCart(state, action) {
      state.cart = state.cart.filter((_, i) => i !== action.payload);
    },
    updateCartQuantity(state, action) {
      const { index, quantity } = action.payload;
      if (quantity <= 0) {
        state.cart.splice(index, 1);
      } else {
        state.cart[index].quantity = quantity;
      }
    },
    clearCart(state) {
      state.cart = [];
      state.selectedTable = null;
      state.selectedCustomer = null;
      state.discount = { type: null, value: 0, reason: '' };
      state.orderNotes = '';
      state.covers = 1;
    },
    setCart(state, action) {
      state.cart = action.payload;
    },
    setPOSState(state, action) {
      const { cart, selectedTable, selectedCustomer, orderType, orderNotes, covers } = action.payload;
      if (cart !== undefined) state.cart = cart;
      if (selectedTable !== undefined) state.selectedTable = selectedTable;
      if (selectedCustomer !== undefined) state.selectedCustomer = selectedCustomer;
      if (orderType !== undefined) state.orderType = orderType;
      if (orderNotes !== undefined) state.orderNotes = orderNotes;
      if (covers !== undefined) state.covers = covers;
    },
  },
});

export const {
  addToCart, removeFromCart, updateCartQuantity, clearCart,
  setSelectedTable, setSelectedCustomer, setOrderType, setDiscount, setCurrentOrder,
  setOrderNotes, setCovers, setCart, setPOSState,
} = posSlice.actions;
export default posSlice.reducer;
