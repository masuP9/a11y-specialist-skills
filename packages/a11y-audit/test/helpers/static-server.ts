/**
 * Minimal static HTTP server for fixture pages.
 *
 * Design:
 * - listen(0) → OS-assigned random port (no port conflict under fullyParallel)
 * - Serves test/fixtures/pages/ as the document root
 * - Path traversal rejected (resolved path must stay inside root)
 * - Content-Type for .html / .css / .js
 * - Cache-Control: no-store on every response
 * - 404 for unknown paths, no directory listing
 */

import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { AddressInfo } from 'node:net';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export interface StaticServer {
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Start a static file server rooted at `root`.
 * URL path `/foo/bar.html` maps to `<root>/foo/bar.html`.
 */
export async function startStaticServer(root: string): Promise<StaticServer> {
  const resolvedRoot = resolve(root);

  const server: Server = createServer(async (req, res) => {
    try {
      // Decode and strip query string
      const rawPath = req.url?.split('?')[0] ?? '/';
      const decoded = decodeURIComponent(rawPath);

      // Resolve to an absolute path — reject traversal outside root
      const target = resolve(resolvedRoot, '.' + decoded);
      if (!target.startsWith(resolvedRoot + '/') && target !== resolvedRoot) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      const ext = extname(target).toLowerCase();
      const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

      let data: Buffer;
      try {
        data = await readFile(target);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found: ' + decoded);
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
