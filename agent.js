import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyAgentAuth } from './agent-protocol.js';
import { executeSafeAction } from './local-actions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await loadEnv();

const HOST = '127.0.0.1';
const PORT = Number(process.env.AGENT_PORT || 8787);
const SECRET = (process.env.JARVIS_AGENT_SECRET || '').trim();
const VERSION = '1.0.0';

if (!SECRET || SECRET.length < 24) {
    console.error('JARVIS_AGENT_SECRET ausente ou muito curto. Use pelo menos 24 caracteres aleatórios no arquivo .env.');
    process.exit(1);
}

let actionWindowStartedAt = Date.now();
let actionCount = 0;

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${HOST}:${PORT}`);

        if (url.pathname === '/status' && req.method === 'GET') {
            if (!verifyAgentAuth(SECRET, req.headers, 'GET', '/status', '')) {
                return json(res, 401, { error: 'Assinatura inválida.', code: 'UNAUTHORIZED' });
            }

            return json(res, 200, {
                ok: true,
                online: true,
                version: VERSION,
                platform: process.platform,
                hostname: os.hostname(),
                message: 'Jarvis Agent conectado.'
            });
        }

        if (url.pathname === '/action' && req.method === 'POST') {
            if (!allowActionRequest()) {
                return json(res, 429, { error: 'Muitas ações em pouco tempo.', code: 'RATE_LIMIT' });
            }

            const rawBody = await readRawBody(req, 32_000);
            if (!verifyAgentAuth(SECRET, req.headers, 'POST', '/action', rawBody)) {
                return json(res, 401, { error: 'Assinatura inválida.', code: 'UNAUTHORIZED' });
            }

            let body;
            try {
                body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
                return json(res, 400, { error: 'JSON inválido.', code: 'INVALID_JSON' });
            }

            const result = await executeSafeAction(body);
            return json(res, 200, result);
        }

        if (req.method === 'OPTIONS') {
            return json(res, 405, { error: 'Acesso direto pelo navegador não é permitido.' });
        }

        return json(res, 404, { error: 'Rota não encontrada.' });
    } catch (error) {
        console.error('Jarvis Agent:', error);
        return json(res, error.status || 500, {
            error: error.message || 'Falha ao executar ação.',
            code: error.code || 'AGENT_ERROR'
        });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Jarvis Agent online em http://${HOST}:${PORT}`);
    console.log('Aguardando conexão segura da interface hospedada...');
});

function allowActionRequest() {
    const now = Date.now();
    if (now - actionWindowStartedAt > 60_000) {
        actionWindowStartedAt = now;
        actionCount = 0;
    }

    actionCount += 1;
    return actionCount <= 30;
}

function readRawBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
            if (Buffer.byteLength(body, 'utf8') > maxBytes) {
                const error = new Error('Corpo da requisição muito grande.');
                error.code = 'PAYLOAD_TOO_LARGE';
                error.status = 413;
                reject(error);
                req.destroy();
            }
        });

        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function json(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
    });
    res.end(JSON.stringify(payload));
}

async function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    const content = await readFile(envPath, 'utf8').catch(() => '');

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const equals = line.indexOf('=');
        if (equals === -1) continue;

        const key = line.slice(0, equals).trim();
        let value = line.slice(equals + 1).trim();
        value = value.replace(/^['"]|['"]$/g, '');

        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}
