export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  const sitePassword = process.env.SITE_PASSWORD;

  if (!sitePassword) {
    return res.status(500).json({ error: 'Password not configured' });
  }

  const valid = password && password.trim().toLowerCase() === sitePassword.trim().toLowerCase();

  if (valid) {
    // Set auth cookie — expires in 7 days, accessible across the site
    res.setHeader('Set-Cookie', 'site_auth=verified; Path=/; Max-Age=604800; SameSite=Lax; Secure');
  }

  return res.status(200).json({ valid });
}
