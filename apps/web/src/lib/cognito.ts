import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from 'jose';

export const sessionCookie = 'workflow-session';
export const transactionCookie = 'workflow-login';

export function cognitoConfig() {
  const { COGNITO_DOMAIN, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, WORKFLOW_ENV, PUBLIC_APP_ORIGIN } = process.env;

  if (!COGNITO_DOMAIN || !COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID || !WORKFLOW_ENV || !PUBLIC_APP_ORIGIN) throw new Error('Cognito configuration is incomplete');

  if (!/^[a-z0-9-]+$/.test(WORKFLOW_ENV)) throw new Error('Invalid workflow environment');
  const domain = new URL(COGNITO_DOMAIN);
  const origin = new URL(PUBLIC_APP_ORIGIN);

  if (domain.protocol !== 'https:' || (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))) throw new Error('HTTPS is required');
  const region = COGNITO_USER_POOL_ID.split('_')[0];

  return { domain: domain.origin, origin: origin.origin, clientId: COGNITO_CLIENT_ID, issuer: `https://cognito-idp.${region}.amazonaws.com/${COGNITO_USER_POOL_ID}`, group: `workflow-${WORKFLOW_ENV}`, callback: `${origin.origin}/auth/callback` };
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifySession(token: string, allowExpiredForRefresh = false) {
  const config = cognitoConfig();
  let keys = keySets.get(config.issuer);

  if (!keys) { keys = createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`)); keySets.set(config.issuer, keys); }

  // An expired token is used only to bind renewal to its signed subject.
  const expiry = allowExpiredForRefresh ? decodeJwt(token).exp : undefined;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  const currentDate = typeof expiry === 'number' && expiry <= Date.now() / 1000 ? new Date((expiry - 1) * 1000) : undefined;
  const { payload } = await jwtVerify(token, keys, { issuer: config.issuer, audience: config.clientId, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'], currentDate });

  if (payload.token_use !== 'id' || !Array.isArray(payload['cognito:groups']) || !payload['cognito:groups'].includes(config.group)) throw new Error('Workflow group membership required');

  return payload;
}

export function cookieOptions() {
  return { httpOnly: true, secure: cognitoConfig().origin.startsWith('https:'), sameSite: 'lax' as const, path: '/' };
}

// Call only after verifySession: trust SAML profiles asserted by our Cognito pool.
export function sessionEmail(identity: JWTPayload): string {
  const saml = Array.isArray(identity.identities) && identity.identities.some(
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    provider => provider && typeof provider === 'object' && provider.providerType === 'SAML',
  );

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (typeof identity.email !== 'string' || !identity.email.trim()) throw new Error('Email required');

  if (identity.email_verified !== true && !saml) throw new Error('Verified email required');

  return identity.email.trim();
}
