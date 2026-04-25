import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const REALM = 'FreeLLMAPI Admin';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * HTTP Basic Auth gate for the dashboard and admin /api/* routes.
 *
 * Enabled only when both ADMIN_USER and ADMIN_PASSWORD are set. Local dev
 * remains zero-config. The OpenAI-compatible proxy at /v1/* is intentionally
 * left out so SDK clients (which use Bearer auth) keep working, and so does
 * /api/ping for uptime probes.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;

  if (!user || !pass) {
    if (user || pass) {
      console.warn(
        '[adminAuth] ADMIN_USER and ADMIN_PASSWORD must both be set; admin dashboard is currently UNPROTECTED.',
      );
    }
    return next();
  }

  if (req.method === 'OPTIONS') return next();
  if (req.path.startsWith('/v1/')) return next();
  if (req.path === '/api/ping') return next();

  const header = req.headers.authorization ?? '';
  if (!header.toLowerCase().startsWith('basic ')) {
    res.set('WWW-Authenticate', `Basic realm="${REALM}"`);
    res.status(401).send('Authentication required');
    return;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    res.set('WWW-Authenticate', `Basic realm="${REALM}"`);
    res.status(401).send('Authentication required');
    return;
  }

  const idx = decoded.indexOf(':');
  if (idx === -1) {
    res.set('WWW-Authenticate', `Basic realm="${REALM}"`);
    res.status(401).send('Authentication required');
    return;
  }

  const reqUser = decoded.slice(0, idx);
  const reqPass = decoded.slice(idx + 1);

  if (safeEqual(reqUser, user) && safeEqual(reqPass, pass)) {
    return next();
  }

  res.set('WWW-Authenticate', `Basic realm="${REALM}"`);
  res.status(401).send('Authentication required');
}
