import { NextResponse } from 'next/server';

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /api/* (serverless functions)
     * - /_next/* (Next.js internals)
     * - /images/* (static assets)
     * - /favicon.ico, /favicon-32x32.png, /apple-touch-icon.png
     * - /shared.css, /shared.js, /chatbot.css, /chatbot.js (assets needed by pages)
     * - /password.html (the password page itself)
     */
    '/((?!api|_next|images|favicon|shared\\.|chatbot\\.|password\\.html).*)',
  ],
};

export default function middleware(request) {
  const authCookie = request.cookies.get('site_auth');

  if (authCookie && authCookie.value === 'verified') {
    return NextResponse.next();
  }

  // Rewrite to password.html while keeping the original URL
  const url = request.nextUrl.clone();
  url.pathname = '/password.html';
  return NextResponse.rewrite(url);
}
