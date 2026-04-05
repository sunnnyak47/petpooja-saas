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
        (c) => c.menu_item_id === item.menu_item_id && c.variant_id === item.variant_id
      );
      if (existing) {
        existing.quantity += item.quantity || 1;
      } else {
        state.cart.push({ ...item, quantity: item.quantity || 1 });
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
    setSelectedTable(state, action) {
      state.selectedTable = action.payload;
    },
    setSelectedCustomer(state, action) {
      state.selectedCustomer = action.payload;
    },
    setOrderType(state, action) {
      state.orderType = action.payload;
    },
    setDiscount(state, action) {
      state.discount = action.payload;
    },
    setCurrentOrder(state, action) {
      state.currentOrder = action.payload;
    },
    setOrderNotes(state, action) {
      state.orderNotes = action.payload;
    },
    setCovers(state, action) {
      state.covers = action.payload;
    },
  },
});

export const {
  addToCart, removeFromCart, updateCartQuantity, clearCart,
  setSelectedTable, setSelectedCustomer, setOrderType, setDiscount, setCurrentOrder,
  setOrderNotes, setCovers,
} = posSlice.actions;
export default posSlice.reducer;
