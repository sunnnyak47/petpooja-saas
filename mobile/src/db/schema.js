import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'orders',
      columns: [
        { name: 'table_number', type: 'string' },
        { name: 'order_type', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'total_amount', type: 'number' },
        { name: 'items_json', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'inventory',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'min_quantity', type: 'number' },
        { name: 'price', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'dashboard_cache',
      columns: [
        { name: 'date', type: 'string' },
        { name: 'revenue', type: 'number' },
        { name: 'orders_count', type: 'number' },
        { name: 'active_orders', type: 'number' },
        { name: 'data_json', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
  ],
});
