/*
 * Seed script - fills the database with sample data so the project can be tested immediately.
 *   npm run seed           -> wipes the collections and inserts sample data
 *   npm run seed:destroy   -> wipes the collections only
 *
 * Demo accounts (all passwords are hashed with bcrypt in the database):
 *   admin@shop.com      / Admin@123
 *   seller1@shop.com    / Seller@123   (TechHub)
 *   seller2@shop.com    / Seller@123   (HomeStyle)
 *   customer1@shop.com  / Customer@123
 *   customer2@shop.com  / Customer@123
 */
const mongoose = require('mongoose');
require('../src/config/env');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const Cart = require('../src/models/Cart');
const Order = require('../src/models/Order');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function wipe() {
  await Promise.all([User, Category, Product, Cart, Order].map((m) => m.deleteMany({})));
  console.log('Collections cleared');
}

async function seed() {
  const [admin, seller1, seller2, customer1, customer2] = await User.create([
    { name: 'Admin User', email: 'admin@shop.com', password: 'Admin@123', role: 'admin' },
    { name: 'TechHub Seller', email: 'seller1@shop.com', password: 'Seller@123', role: 'seller' },
    { name: 'HomeStyle Seller', email: 'seller2@shop.com', password: 'Seller@123', role: 'seller' },
    { name: 'Aarav Sharma', email: 'customer1@shop.com', password: 'Customer@123', role: 'customer' },
    { name: 'Priya Verma', email: 'customer2@shop.com', password: 'Customer@123', role: 'customer' },
  ]);

  const [electronics, home, books, fashion] = await Category.create([
    { name: 'Electronics', description: 'Phones, audio and accessories' },
    { name: 'Home & Kitchen', description: 'Appliances and home essentials' },
    { name: 'Books', description: 'Technical and general books' },
    { name: 'Fashion', description: 'Clothing and accessories' },
  ]);

  const p = (name, price, stock, category, seller, extra = {}) => ({
    name, price, stock, category: category._id, seller: seller._id, description: `${name} - sample product`, ...extra,
  });

  const products = await Product.create([
    p('Wireless Bluetooth Headphones', 2499, 40, electronics, seller1),
    p('USB-C Fast Charger 65W', 1299, 60, electronics, seller1),
    p('Mechanical Keyboard', 3499, 25, electronics, seller1),
    p('Smart Fitness Band', 1999, 3, electronics, seller1), // LOW STOCK (threshold 5)
    p('Portable Power Bank 20000mAh', 1799, 0, electronics, seller1), // OUT OF STOCK
    p('Non-stick Frying Pan', 899, 35, home, seller2),
    p('Electric Kettle 1.5L', 1199, 20, home, seller2),
    p('Cotton Bedsheet Set', 1599, 4, home, seller2), // LOW STOCK
    p('Node.js Design Patterns (Book)', 799, 50, books, seller2),
    p('Clean Code (Book)', 699, 45, books, seller2),
    p('Running Shoes', 2999, 18, fashion, seller2),
    p('Denim Jacket', 2199, 12, fashion, seller2),
  ]);
  const byName = (n) => products.find((x) => x.name.startsWith(n));

  const address = (u) => ({
    fullName: u.name, phone: '9876543210', line1: '221B Baker Street', city: 'New Delhi',
    state: 'Delhi', postalCode: '110001', country: 'India',
  });

  // Historical orders (so the aggregation reports have data). Stock is decremented for non-cancelled orders.
  const specs = [
    [customer1, seller1, [['Wireless Bluetooth Headphones', 2], ['USB-C Fast Charger', 1]], 'delivered', 28],
    [customer2, seller1, [['Mechanical Keyboard', 1]], 'delivered', 21],
    [customer1, seller2, [['Non-stick Frying Pan', 2], ['Electric Kettle', 1]], 'delivered', 18],
    [customer2, seller2, [['Node.js Design Patterns', 2], ['Clean Code', 1]], 'shipped', 10],
    [customer1, seller1, [['Wireless Bluetooth Headphones', 1]], 'confirmed', 6],
    [customer2, seller2, [['Running Shoes', 1]], 'pending', 2],
    [customer1, seller2, [['Denim Jacket', 1]], 'cancelled', 12],
    [customer2, seller1, [['USB-C Fast Charger', 2]], 'delivered', 4],
  ];

  for (const [customer, seller, lines, status, ago] of specs) {
    const items = lines.map(([name, qty]) => {
      const prod = byName(name);
      return { product: prod._id, name: prod.name, price: prod.price, quantity: qty, subtotal: prod.price * qty };
    });
    await Order.create({
      checkoutId: new mongoose.Types.ObjectId().toString(),
      customer: customer._id,
      seller: seller._id,
      items,
      totalAmount: items.reduce((s, i) => s + i.subtotal, 0),
      shippingAddress: address(customer),
      status,
      statusHistory: [{ status: 'pending', changedBy: customer._id, note: 'Order placed', at: daysAgo(ago) }],
      payment: { method: 'SIMULATED_CARD', status: status === 'cancelled' ? 'simulated_refunded' : 'simulated_paid', simulated: true },
      createdAt: daysAgo(ago),
    });
    if (status !== 'cancelled') {
      for (const it of items) await Product.updateOne({ _id: it.product }, { $inc: { stock: -it.quantity } });
    }
  }

  console.log('Seed complete: 5 users, 4 categories, 12 products, 8 orders');
  console.log('Login with admin@shop.com / Admin@123, seller1@shop.com / Seller@123, customer1@shop.com / Customer@123');
}

(async () => {
  await connectDB();
  await wipe();
  if (!process.argv.includes('--destroy')) await seed();
  await mongoose.connection.close();
})().catch((e) => { console.error(e); process.exit(1); });
