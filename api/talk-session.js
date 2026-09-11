/* ═══════════════════════════════════════════════════════
   TALK SESSION — Vercel serverless function
   Hands the browser what it needs to start an ElevenLabs Agents
   call without exposing the API key.
   Env: ELEVENLABS_AGENT_ID (required to enable voice)
        ELEVENLABS_API_KEY  (needed only if the agent is private)
   404 when nothing is configured, so the panel falls back to demo mode.
   ═══════════════════════════════════════════════════════ */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId) {
    return res.status(404).json({ error: 'Voice agent not configured' });
  }

  // Public agent: the id alone is enough for the client SDK.
  if (!apiKey) {
    return res.status(200).json({ agentId });
  }

  try {
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
    const response = await fetch(url, { headers: { 'xi-api-key': apiKey } });
    if (!response.ok) {
      console.error('ElevenLabs signed URL error', response.status, await response.text());
      return res.status(502).json({ error: 'Could not start voice session' });
    }
    const data = await response.json();
    if (!data.signed_url) {
      return res.status(502).json({ error: 'Could not start voice session' });
    }
    return res.status(200).json({ signedUrl: data.signed_url });
  } catch (e) {
    console.error('Talk session failure', e);
    return res.status(500).json({ error: 'Could not start voice session' });
  }
}
