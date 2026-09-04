import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJarvisReply } from './ai-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

await loadEnv();

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        if (url.pathname === '/api/chat') {
            return handleChat(req, res);
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return json(res, 405, { error: 'Método não permitido.' });
        }

        let requestedPath = decodeURIComponent(url.pathname);
        if (requestedPath === '/') requestedPath = '/index.html';

        const safePath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(__dirname, safePath);

        if (!filePath.startsWith(__dirname)) {
            return json(res, 403, { error: 'Acesso negado.' });
        }

        const info = await stat(filePath).catch(() => null);
        if (!info || !info.isFile()) {
            return json(res, 404, { error: 'Arquivo não encontrado.' });
        }

        const ext = path.extname(filePath).toLowerCase();
        const content = await readFile(filePath);
        res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        if (req.method === 'HEAD') return res.end();
        res.end(content);
    } catch (error) {
        console.error(error);
        json(res, 500, { error: 'Erro interno do servidor.' });
    }
});

server.listen(PORT, () => {
    console.log(`JARVIS online em http://localhost:${PORT}`);
    console.log(process.env.OPENAI_API_KEY ? 'IA: configurada' : 'IA: falta OPENAI_API_KEY no arquivo .env');
});

async function handleChat(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { error: 'Método não permitido.' });
    }

    try {
        const body = await readJsonBody(req);
        const result = await createJarvisReply(body.messages);
        return json(res, 200, result);
    } catch (error) {
        const status = error.code === 'INVALID_INPUT' ? 400 : error.code === 'MISSING_API_KEY' ? 503 : 500;
        return json(res, status, {
            error: error.message || 'Falha ao consultar a IA.',
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1_000_000) {
                reject(new Error('Corpo da requisição muito grande.'));
                req.destroy();
            }
        });

        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                const error = new Error('JSON inválido.');
                error.code = 'INVALID_INPUT';
                reject(error);
            }
        });

        req.on('error', reject);
    });
}

function json(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
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
