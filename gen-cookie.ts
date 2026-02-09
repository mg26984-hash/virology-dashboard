import 'dotenv/config';
import { SignJWT } from 'jose';

const secret = process.env.JWT_SECRET || '';
const ownerOpenId = process.env.OWNER_OPEN_ID || '';
const appId = process.env.VITE_APP_ID || '';

async function main() {
  const secretKey = new TextEncoder().encode(secret);
  const expirationSeconds = Math.floor((Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000);
  
  const token = await new SignJWT({
    openId: ownerOpenId,
    appId: appId,
    name: 'Owner',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
  
  console.log(token);
}

main().catch(console.error);
