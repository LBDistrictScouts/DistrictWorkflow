import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { verifySession, cognitoConfig, sessionEmail } from '../src/lib/cognito.ts';

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
    .setAudience('workflow-client').setSubject('staff-123').setIssuedAt().setExpirationTime(claims.exp ?? '5m')
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

test('accepts SAML email without Cognito email verification', async () => {
  for (const email_verified of [false, undefined]) {
    const identity = await verifySession(await token({ email: 'member@example.org', email_verified, identities: [{ providerType: 'SAML' }] }));
    assert.equal(sessionEmail(identity), 'member@example.org');
  }
});

test('requires verified email for other profiles and an email for every profile', () => {
  for (const identities of [undefined, [], [{ providerType: 'OIDC' }], 'SAML', [null]]) {
    assert.throws(() => sessionEmail({ email: 'member@example.org', email_verified: false, identities }));
  }

  for (const email of [undefined, '', ' ', 42]) {
    assert.throws(() => sessionEmail({ email, identities: [{ providerType: 'SAML' }] }));
  }

  assert.equal(sessionEmail({ email: 'member@example.org', email_verified: true }), 'member@example.org');
});

test('expired tokens are accepted only for renewal binding and still require a valid signature', async () => {
  const expired = await token({ exp: Math.floor(Date.now() / 1000) - 10 });
  await assert.rejects(verifySession(expired));
  assert.equal((await verifySession(expired, true)).sub, 'staff-123');
  const other = await generateKeyPair('RS256');
  await assert.rejects(verifySession(await token({ exp: 1 }, other.privateKey), true));
});

test('refresh validates subject, retains or rotates refresh token, and rejects failures', async () => {
  const { refreshSession } = await import('../src/lib/session-refresh.ts');
  const previousFetch = globalThis.fetch;

  try {
    const id_token = await token();
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).pathname, '/oauth2/token');
      assert.equal(options.body.get('grant_type'), 'refresh_token');
      assert.equal(options.body.get('refresh_token'), 'original');

      return Response.json({ id_token });
    };

    assert.equal((await refreshSession('original', 'staff-123')).refreshToken, 'original');
    await assert.rejects(refreshSession('original', 'another-subject'));
    globalThis.fetch = async () => Response.json({ id_token, refresh_token: 'rotated' });
    assert.equal((await refreshSession('original', 'staff-123')).refreshToken, 'rotated');
    globalThis.fetch = async () => Response.json({}, { status: 400 });
    await assert.rejects(refreshSession('original', 'staff-123'));
    globalThis.fetch = async () => Response.json({ id_token: await token({ exp: 1 }) });
    await assert.rejects(refreshSession('original', 'staff-123'));
  } finally { globalThis.fetch = previousFetch; }
});
