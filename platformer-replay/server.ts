// Serveur de dev minimal — sert les fichiers statiques + compile TS à la volée
// Lance avec : deno run --allow-net --allow-read --allow-env server.ts

const PORT = 3001;

async function serveFile(path: string): Promise<Response> {
  try {
    const file = await Deno.readFile(path);
    const ext = path.split('.').pop() ?? '';
    const types: Record<string, string> = {
      html: 'text/html',
      js:   'application/javascript',
      ts:   'application/javascript',
      css:  'text/css',
      json: 'application/json',
    };
    return new Response(file, {
      headers: { 'Content-Type': types[ext] ?? 'text/plain' },
    });
  } catch {
    return new Response('404 Not Found', { status: 404 });
  }
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  let path = '.' + url.pathname;
  if (path === './') path = './index.html';
  console.log(`GET ${url.pathname}`);
  return serveFile(path);
});

console.log(`\n🎮 Platformer Replay — serveur de dev`);
console.log(`   http://localhost:${PORT}\n`);
