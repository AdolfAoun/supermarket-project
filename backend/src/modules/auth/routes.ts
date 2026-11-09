import { createHash, randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { HttpError } from '../../middleware/errors.js';
import { body, text } from '../shared/validation.js';
import type { AuthRepository, User } from './repository.js';
import { dummyHash, hashPassword, verifyPassword } from './password.js';

export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');
export function requireAuth(repository: AuthRepository): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer ([a-f0-9]{64})$/i.exec(header) : null;
    if (!match) throw new HttpError(401, 'Authentication required');
    const hash = tokenHash(match[1]);
    const user = await repository.authenticate(hash);
    if (!user) throw new HttpError(401, 'Authentication required');
    res.locals.user = user;
    res.locals.tokenHash = hash;
    next();
  };
}
export const currentUser = (locals: Record<string, unknown>): User => locals.user as User;
function email(value: unknown): string {
  const result = text(value, 'email', 254).toLowerCase();
  // Deliberately ordinary ASCII email addresses, no quoted local parts or IDNs.
  const parts = result.split('@');
  if (parts.length !== 2 || parts[0].length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(parts[0])
    || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')
    || !parts[1].includes('.') || parts[1].split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new HttpError(400, 'Invalid email');
  }
  return result;
}
function password(value: unknown): string {
  if (typeof value !== 'string' || [...value].length < 8 || [...value].length > 128 || Buffer.byteLength(value, 'utf8') > 512) {
    throw new HttpError(400, 'password must contain 8 to 128 characters (at most 512 UTF-8 bytes)');
  }
  return value; // Never trim or normalize a password.
}
export function authRoutes(repository: AuthRepository): Router {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/register', async (req, res) => {
    const input = body(req.body, ['displayName', 'email', 'password']);
    const name = text(input.displayName, 'displayName', 80);
    const address = email(input.email);
    const secret = password(input.password);
    const user = await repository.register(name, address, await hashPassword(secret));
    res.status(201).json({ user }); // Explicit login required after registration.
  });
  router.post('/login', async (req, res) => {
    const input = body(req.body, ['email', 'password']);
    const address = email(input.email);
    const secret = password(input.password);
    const account = await repository.findAccount(address);
    const valid = await verifyPassword(secret, account?.passwordHash ?? dummyHash);
    if (!valid || !account) throw new HttpError(401, 'Invalid email or password');
    const token = randomBytes(32).toString('hex');
    const expiresAt = await repository.createSession(account.id, tokenHash(token));
    const user = { id: account.id, displayName: account.displayName, email: account.email };
    res.json({ token, tokenType: 'Bearer', expiresAt, user });
  });
  router.post('/logout', requireAuth(repository), async (_req, res) => {
    await repository.logout(res.locals.tokenHash as string);
    res.status(204).end();
  });
  router.get('/me', requireAuth(repository), (_req, res) => { res.json({ user: currentUser(res.locals) }); });
  return router;
}
