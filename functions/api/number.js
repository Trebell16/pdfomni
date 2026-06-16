export async function onRequest(context) {
  try {
    const currentUsers = await context.env.active_users?.get('CURRENT_USERS')

    return new Response(JSON.stringify({ users: currentUsers || null }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120, s-maxage=120',
      },
    })
  } catch (error) {
    console.error('Unable to read active user count:', error)

    return new Response(JSON.stringify({ users: null }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}
