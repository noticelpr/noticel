// When this copy of the site was built. Fast publishing (functions/_lib/live.js) compares it with each story's
// publish time: stories saved after the build are shown from the database until the next build includes them.
export const GET = () => new Response(JSON.stringify({ t: Date.now() }), { headers: { 'Content-Type': 'application/json' } });
