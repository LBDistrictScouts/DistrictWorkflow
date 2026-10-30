import { createRemoteJWKSet, jwtVerify } from 'jose';

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
export async function verifySession(token: string) {
  const config = cognitoConfig();
  let keys = keySets.get(config.issuer);
  if (!keys) { keys = createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`)); keySets.set(config.issuer, keys); }
  const { payload } = await jwtVerify(token, keys, { issuer: config.issuer, audience: config.clientId, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'] });
  if (payload.token_use !== 'id' || !Array.isArray(payload['cognito:groups']) || !payload['cognito:groups'].includes(config.group)) throw new Error('Workflow group membership required');
  return payload;
}

export function cookieOptions() {
  return { httpOnly: true, secure: cognitoConfig().origin.startsWith('https:'), sameSite: 'lax' as const, path: '/' };
}
