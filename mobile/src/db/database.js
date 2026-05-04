import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import Order from './models/Order';
import InventoryItem from './models/InventoryItem';
import DashboardCache from './models/DashboardCache';

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'petpooja_owner',
  jsi: true,
  onSetUpError: (error) => {
    console.error('[WatermelonDB] Setup error:', error);
  },
});

const database = new Database({
  adapter,
  modelClasses: [Order, InventoryItem, DashboardCache],
});

export { database };
export { Order, InventoryItem, DashboardCache };
