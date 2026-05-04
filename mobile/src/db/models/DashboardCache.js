import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class DashboardCache extends Model {
  static table = 'dashboard_cache';

  @field('date') date;
  @field('revenue') revenue;
  @field('orders_count') ordersCount;
  @field('active_orders') activeOrders;
  @field('data_json') dataJson;
  @date('cached_at') cachedAt;

  get data() {
    try {
      return JSON.parse(this.dataJson || '{}');
    } catch {
      return {};
    }
  }

  get isStale() {
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() - this.cachedAt > fiveMinutes;
  }
}
