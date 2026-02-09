import 'dotenv/config';
import { ENV } from './server/_core/env';

console.log('DB URL set:', !!ENV.databaseUrl);
console.log('Forge API set:', !!ENV.forgeApiUrl);
console.log('Forge key set:', !!ENV.forgeApiKey);
