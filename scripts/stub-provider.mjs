/** Stub OpenAI-compatible /models endpoint for the Slice A curl check. No real provider. */
import { createServer } from 'node:http';

const MODELS = ['stub-model-1', 'stub-model-2'];

createServer((req, res) => {
  if (req.url?.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: MODELS.map((id) => ({ id })), models: MODELS.map((name) => ({ name })) }));
    return;
  }
  res.writeHead(404).end();
}).listen(4599, '127.0.0.1', () => console.log('stub provider on 4599'));
