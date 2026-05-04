import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Order extends Model {
  static table = 'orders';

  @field('table_number') tableNumber;
  @field('order_type') orderType;
  @field('status') status;
  @field('total_amount') totalAmount;
  @field('items_json') itemsJson;
  @readonly @date('created_at') createdAt;
  @date('synced_at') syncedAt;

  get items() {
    try {
      return JSON.parse(this.itemsJson || '[]');
    } catch {
      return [];
    }
  }
}
