import fs from 'fs';
import path from 'path';

// Criar um ambiente de desenvolvimento funcional com JSON
const createDevelopmentEnv = () => {
  const envContent = `# 🔐 SEGURANÇA
JWT_SECRET=dhuish4h32ui4h32iufnjdkhf89889f0ds8f0vnjsnnsdshauhu32
JWT_EXPIRES_IN=8h

# 🌐 CONFIGURAÇÃO
NODE_ENV=development
PORT=3001
CLIENT_URL=http://localhost:3000

# 📊 BANCO DE DADOS (OPCIONAL)
# Descomente para usar MongoDB (requerido: cluster válido + credenciais)
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/fiberbot
MONGODB_DB_NAME=fiberbot

# 📝 LOGS
LOG_LEVEL=info
LOG_FILE_PATH=./logs

# 🚀 RATE LIMITING
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOGIN_RATE_LIMIT_MAX=5

# 📡 WEBSOCKETS
SOCKET_CORS_ORIGIN=http://localhost:3000

# 🔧 FORÇAR USO DO ADAPTER
USE_MONGODB=false
`;

  const envPath = path.join(__dirname, '..', '.env');
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Arquivo .env de desenvolvimento criado');
  console.log('📋 USE_MONGODB=false (JSON file)');
  console.log('📁 Para usar MongoDB, edite as credenciais e defina USE_MONGODB=true');
};

createDevelopmentEnv();