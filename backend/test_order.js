const { PrismaClient } = require('@prisma/client');
const orderService = require('./src/modules/orders/order.service');

async function test() {
  try {
    const data = {
      outlet_id: '00c68b05-5b6f-47fb-a460-2c53c6ed99da',
      table_id: '4b24ac34-f0d1-44c6-9fb8-27c6a824f8e9',
      customer_name: 'Test Customer',
      source: 'qr',
      order_type: 'qr_order',
      status: 'pending',
      items: [
        {
          menu_item_id: '0fcb6408-db28-4ad0-b0c0-67cdeb4bca57', // Butter Chicken
          quantity: 1,
          addons: []
        }
      ]
    };
    console.log('Calling createOrder...');
    const result = await orderService.createOrder(data, null);
    console.log('Result type:', typeof result);
    console.log('Result ID:', result?.id);
    console.log('Keys:', result ? Object.keys(result) : 'null');
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit();
}
test();
