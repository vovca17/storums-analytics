import type { NextFunction, Request, Response } from 'express';

/**
 * Заголовки безопасности для JSON-API (минимальный аналог helmet, без лишней зависимости).
 * Swagger (/api/docs) — HTML, ему CSP не ставим, чтобы не сломать UI.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (!req.path.startsWith('/api/docs')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    // Ответы с личными данными не кэшируем в прокси и браузере
    res.setHeader('Cache-Control', 'no-store');
  }
  res.removeHeader('X-Powered-By');
  next();
}
