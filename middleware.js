export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /api/* (serverless functions)
     * - /images/* (static assets)
     * - /favicon.ico, /favicon-32x32.png, /apple-touch-icon.png
     * - /shared.css, /shared.js, /chatbot.css, /chatbot.js (assets needed by pages)
     * - /password.html (the password page itself)
     */
    '/((?!api|images|favicon|shared\\.|chatbot\\.|password\\.html).*)',
  ],
};

export default function middleware(request) {
  const cookies = request.headers.get('cookie') || '';
  const isAuthed = cookies.split(';').some(c => c.trim() === 'site_auth=verified');

  if (isAuthed) {
    return;
  }

  // Serve password.html while keeping the original URL
  const url = new URL('/password.html', request.url);
  return fetch(url);
}
