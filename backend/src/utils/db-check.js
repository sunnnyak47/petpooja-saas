/**
 * @fileoverview Database Connectivity Check
 * Simple script to verify Prisma can reach Supabase via the pooler.
 */
const { PrismaClient } = require('@prisma/client');

async function checkConnection() {
  const prisma = new PrismaClient();
  console.log('🚀 Starting Database Connectivity Check...');
  console.log(`📡 URL: ${process.env.DATABASE_URL?.split('@')[1] || 'NOT SET'}`);

  try {
    const start = Date.now();
    // Simple query to verify connection
    await prisma.$queryRaw`SELECT 1`;
    const duration = Date.now() - start;
    
    console.log('✅ DATABASE CONNECTED SUCCESSFULLY!');
    console.log(`⏱️ Latency: ${duration}ms`);
    
    // Check user count as a sanity check
    const userCount = await prisma.user.count();
    console.log(`👥 Total Users in DB: ${userCount}`);

  } catch (error) {
    console.error('❌ DATABASE CONNECTION FAILED:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkConnection();
