import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function responseEncryptionKey(): Buffer {
  const key = process.env.RESPONSE_ENCRYPTION_KEY;

  if (!key || !/^[0-9a-f]{64}$/i.test(key)) throw new Error('RESPONSE_ENCRYPTION_KEY must be a 32-byte hex key');

  return Buffer.from(key, 'hex');
}

export function encryptResponse(id: string, answers: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', responseEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(id));
  const body = Buffer.concat([cipher.update(JSON.stringify(answers), 'utf8'), cipher.final()]);

  return [iv, cipher.getAuthTag(), body].map(part => part.toString('base64url')).join('.');
}

export function decryptResponse(id: string, ciphertext: string): Record<string, string> {
  const [iv, tag, body] = ciphertext.split('.').map(part => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', responseEncryptionKey(), iv!);
  cipher.setAAD(Buffer.from(id)); cipher.setAuthTag(tag!);

  return JSON.parse(Buffer.concat([cipher.update(body!), cipher.final()]).toString('utf8'));
}
