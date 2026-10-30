import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { verifySession, cognitoConfig } from '../src/lib/cognito.ts';

process.env.COGNITO_DOMAIN = 'https://example.auth.eu-west-2.amazoncognito.com';
process.env.COGNITO_USER_POOL_ID = 'eu-west-2_example';
process.env.COGNITO_CLIENT_ID = 'workflow-client';
process.env.WORKFLOW_ENV = 'dev';
process.env.PUBLIC_APP_ORIGIN = 'http://localhost:3030';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
globalThis.fetch = async () => Response.json({ keys: [jwk] });
async function token(claims = {}, signingKey = privateKey) {
  return new SignJWT({ token_use: 'id', 'cognito:groups': ['workflow-dev'], ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(cognitoConfig().issuer)
    .setAudience('workflow-client').setSubject('staff-123').setIssuedAt().setExpirationTime('5m')
    .sign(signingKey);
}

test('accepts a signed ID token in the exact environment group', async () => {
  assert.equal((await verifySession(await token())).sub, 'staff-123');
});
test('rejects absent, mismatched, and malformed group claims', async () => {
  for (const groups of [undefined, [], ['workflow-prod'], ['workflow-dev-admin'], 'workflow-dev']) {
    await assert.rejects(verifySession(await token({ 'cognito:groups': groups })));
  }
});
test('rejects access tokens and forged signatures', async () => {
  await assert.rejects(verifySession(await token({ token_use: 'access' })));
  const other = await generateKeyPair('RS256');
  await assert.rejects(verifySession(await token({}, other.privateKey)));
});
test('rejects expired tokens, wrong issuer and wrong client', async () => {
  for (const overrides of [{ exp: 1 }, { iss: 'https://attacker.example' }, { aud: 'other-client' }]) {
    const jwt = await new SignJWT({ token_use: 'id', 'cognito:groups': ['workflow-dev'], sub: 'staff', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, iss: cognitoConfig().issuer, aud: 'workflow-client', ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
    await assert.rejects(verifySession(jwt));
  }
});
