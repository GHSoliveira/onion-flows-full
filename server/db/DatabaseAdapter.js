

import { MongoClient } from 'mongodb';

class MongoAdapter {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect(uri, dbName) {
    try {
      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db(dbName);
      console.log('✅ Conectado ao MongoDB');
      return true;
    } catch (error) {
      console.error('❌ Erro ao conectar ao MongoDB:', error.message);
      throw error;
    }
  }

  async init() {
    if (this.db) return;

    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME || 'onionflow';

    if (!uri) {
      throw new Error('MONGODB_URI não definido nas variáveis de ambiente');
    }

    await this.connect(uri, dbName);
  }

  async getCollection(name, tenantId = null) {
    if (!this.db) await this.init();
    const collection = this.db.collection(name);

    const query = {};
    if (tenantId && tenantId !== 'super_admin' && tenantId !== null) {
      query.tenantId = tenantId;
    }

    return await collection.find(query).toArray();
  }

  async saveCollection(name, data) {
    if (!this.db) await this.init();
    const collection = this.db.collection(name);

    if (!data || data.length === 0) return true;


    const operations = data.map(doc => ({
      updateOne: {
        filter: { id: doc.id },
        update: { $set: doc },
        upsert: true
      }
    }));

    await collection.bulkWrite(operations);
    return true;
  }


  async getUsers(tenantId = null) {
    return await this.getCollection('users', tenantId);
  }

  async saveUsers(users) {
    return await this.saveCollection('users', users);
  }

  async getFlows(tenantId = null) {
    return await this.getCollection('flows', tenantId);
  }

  async saveFlows(flows) {
    return await this.saveCollection('flows', flows);
  }

  async getVariables(tenantId = null) {
    return await this.getCollection('variables', tenantId);
  }

  async saveVariables(variables) {
    return await this.saveCollection('variables', variables);
  }

  async getActiveChats(tenantId = null) {
    return await this.getCollection('activeChats', tenantId);
  }

  async saveActiveChats(chats) {
    return await this.saveCollection('activeChats', chats);
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }
}


const adapter = new MongoAdapter();

export default adapter;

