// Password gate.
//
// Only the paths listed in GATED need the cookie; every other page is public.
// Visitors can also unlock via a link: any URL carrying ?key=<access key> sets
// the cookie and redirects to the same URL with the key removed, so a resume
// link like https://site/?key=xxxx drops recruiters straight in.
//
// Keys come from SITE_ACCESS_KEYS (comma separated, so a key can be issued per
// application and revoked later) and fall back to SITE_PASSWORD.

const GATED = [
  '/plan-and-pricing',
  '/product-led-growth',
  '/metric-investigation',
];

const AUTH_COOKIE = 'site_auth=verified; Path=/; Max-Age=604800; SameSite=Lax; Secure';

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /api/* (serverless functions)
     * - /images/* (static assets)
     * - /favicon.ico, /favicon-32x32.png, /apple-touch-icon.png
     * - /shared.css, /shared.js, /chatbot.css, /chatbot.js (assets needed by pages)
     * - /password and /password.html (the password page itself)
     */
    '/((?!api|images|favicon|shared\\.|chatbot\\.|password).*)',
  ],
};

function normalize(value) {
  return (value || '').trim().toLowerCase();
}

function accessKeys() {
  const raw = process.env.SITE_ACCESS_KEYS || process.env.SITE_PASSWORD || '';
  return raw.split(',').map(normalize).filter(Boolean);
}

function isGated(pathname) {
  const clean = pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  return GATED.includes(clean);
}

function isAuthed(request) {
  const cookies = request.headers.get('cookie') || '';
  return cookies.split(';').some(c => c.trim() === 'site_auth=verified');
}

export default async function middleware(request) {
  const url = new URL(request.url);

  // Unlock link: always strip the key from the address bar; set the cookie
  // only when it matches.
  if (url.searchParams.has('key')) {
    const key = normalize(url.searchParams.get('key'));
    url.searchParams.delete('key');
    const headers = { Location: url.toString(), 'Cache-Control': 'no-store' };
    if (key && accessKeys().includes(key)) headers['Set-Cookie'] = AUTH_COOKIE;
    return new Response(null, { status: 302, headers });
  }

  if (!isGated(url.pathname) || isAuthed(request)) {
    return;
  }

  // Serve the password page in place, keeping the original URL so the reload
  // after a successful unlock lands on the page that was asked for.
  const page = await fetch(new URL('/password', request.url));
  return new Response(page.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
