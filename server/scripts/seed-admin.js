import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

async function seedAdmin() {
  console.log('🔌 Conectando ao MongoDB Atlas...');

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const db = client.db(process.env.MONGODB_DB_NAME || 'fluxadmin');
  const users = db.collection('users');

  console.log('✅ Conectado ao MongoDB Atlas');


  const existing = await users.findOne({ username: 'admin' });
  if (existing) {
    console.log('ℹ️ Usuário admin já existe no banco de dados');
    console.log('   Username:', existing.username);
    console.log('   Role:', existing.role);
    await client.close();
    return;
  }


  console.log('🔐 Criando usuário admin...');
  const hashedPassword = await bcrypt.hash('123', 12);

  await users.insertOne({
    id: 'u_admin',
    name: 'Super Admin',
    username: 'admin',
    password: hashedPassword,
    role: 'SUPER_ADMIN',
    queues: [],
    permissions: ['all'],
    tenantId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log('✅ Usuário admin criado com sucesso!');
  console.log('   Username: admin');
  console.log('   Password: 123');
  console.log('   Role: SUPER_ADMIN');

  await client.close();
  process.exit(0);
}

seedAdmin().catch(async (error) => {
  console.error('❌ Erro ao criar usuário admin:', error.message);
  process.exit(1);
});
