export default async function handler(req, res) {
    console.log('Client ID:', process.env.VITE_STRAVA_CLIENT_ID)
    console.log('Secret length:', process.env.STRAVA_CLIENT_SECRET?.length)
  
    if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code } = req.body

  if (!code) {
    return res.status(400).json({ error: 'No code provided' })
  }

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 254701,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    const data = await response.json()
    console.log('Strava response:', JSON.stringify(data))

    if (data.access_token) {
      res.status(200).json({ access_token: data.access_token })
    } else {
      res.status(400).json({ error: 'Token exchange failed', detail: data })
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: err.message })
  }
}