export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/number') {
      try {
        const currentUsers = await env.active_users?.get('CURRENT_USERS')
        return json({ users: currentUsers || null }, 'public, max-age=120, s-maxage=120')
      } catch (error) {
        console.error('Unable to read active user count:', error)
        return json({ users: null }, 'no-store')
      }
    }

    return env.ASSETS.fetch(request)
  },
}

function json(payload, cacheControl) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
  })
}
