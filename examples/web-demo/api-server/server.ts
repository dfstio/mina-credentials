import http from 'http';
import { URL } from 'url';
import { requestLogin, verifyLogin } from './action-login.ts';
import { getVotes, requestVote, verifyVote } from './action-voting.ts';
import { issueCredential } from './issue-credential.ts';

// Helper to read request body
async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    // Add CORS headers to all responses
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.setHeader('Content-Type', 'application/json');

    // issue credential endpoint
    if (url.pathname === '/issue-credential' && req.method === 'POST') {
      let body = await readBody(req);
      console.log('/issue-credential', body);

      let credentialJson = issueCredential(body);

      res.writeHead(200);
      res.end(credentialJson);
      return;
    }

    // login endpoints
    if (url.pathname === '/login-request' && req.method === 'GET') {
      console.log('/login-request');

      let request = await requestLogin();

      res.writeHead(200);
      res.end(request);
      return;
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      let body = await readBody(req);
      console.log('/login', body.slice(0, 1000));

      await verifyLogin(body);

      res.writeHead(200);
      res.end('');
      return;
    }

    // polling endpoints
    if (url.pathname === '/poll-request' && req.method === 'GET') {
      let vote = url.searchParams.get('vote');
      console.log('/voting-request', vote);

      let request = await requestVote(vote);

      res.writeHead(200);
      res.end(request);
      return;
    }
    if (url.pathname === '/poll' && req.method === 'POST') {
      let body = await readBody(req);
      console.log('/poll', body.slice(0, 1000));

      let result = await verifyVote(body);
      let votes = getVotes();
      let response = JSON.stringify({ ...votes, ...result });

      res.writeHead(200);
      res.end(response);
      return;
    }

    // Handle 404
    res.writeHead(404);
    console.log('Not Found:', url.pathname);
    res.end(JSON.stringify({ error: `Not Found: ${url.pathname}` }));
  } catch (error) {
    console.error('Error:', error);
    res.writeHead(400);
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    );
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});