import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class InventoryItem extends Model {
  static table = 'inventory';

  @field('name') name;
  @field('category') category;
  @field('quantity') quantity;
  @field('unit') unit;
  @field('min_quantity') minQuantity;
  @field('price') price;
  @date('synced_at') syncedAt;

  get isLowStock() {
    return this.quantity <= this.minQuantity;
  }
}
