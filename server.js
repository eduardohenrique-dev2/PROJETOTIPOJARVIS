import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJarvisReply } from './ai-core.js';
import { executeSafeAction } from './local-actions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await loadEnv();
const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';

const publicFiles = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/style.css', 'style.css'],
    ['/script.js', 'script.js'],
    ['/assistant-core.js', 'assistant-core.js'],
    ['/actions.js', 'actions.js']
]);

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        if (url.pathname === '/api/chat') {
            return handleChat(req, res);
        }

        if (url.pathname === '/api/action') {
            return handleAction(req, res);
        }

        if (url.pathname === '/api/agent-status') {
            return handleAgentStatus(req, res);
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return json(res, 405, { error: 'Método não permitido.' });
        }

        const publicFile = publicFiles.get(url.pathname);
        if (!publicFile) {
            return json(res, 404, { error: 'Arquivo não encontrado.' });
        }

        const filePath = path.join(__dirname, publicFile);
        const ext = path.extname(filePath).toLowerCase();
        const content = await readFile(filePath);

        res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        });

        if (req.method === 'HEAD') return res.end();
        res.end(content);
    } catch (error) {
        console.error(error);
        json(res, 500, { error: 'Erro interno do servidor.' });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`JARVIS online em http://localhost:${PORT}`);
    const configured = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    console.log(configured ? 'IA Gemini: configurada' : 'IA Gemini: falta GEMINI_API_KEY no arquivo .env');
    console.log('Ações locais: habilitadas somente neste computador');
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
        const status = error.code === 'INVALID_INPUT'
            ? 400
            : error.code === 'MISSING_API_KEY'
                ? 503
                : error.status || 500;

        return json(res, status, {
            error: error.message || 'Falha ao consultar a IA.',
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
}

async function handleAction(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { error: 'Método não permitido.' });
    }

    try {
        const body = await readJsonBody(req);
        const result = await executeSafeAction(body);
        return json(res, 200, result);
    } catch (error) {
        console.error('Erro ao executar ação local:', error);
        return json(res, error.status || 500, {
            error: error.message || 'Não consegui executar essa ação no computador.',
            code: error.code || 'ACTION_FAILED'
        });
    }
}

function handleAgentStatus(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return json(res, 405, { error: 'Método não permitido.' });
    }

    return json(res, 200, {
        online: true,
        configured: true,
        mode: 'local',
        platform: process.platform,
        message: 'Este navegador está conectado diretamente ao PC.'
    });
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let settled = false;

        const fail = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        req.on('data', (chunk) => {
            if (settled) return;
            body += chunk;
            if (body.length > 1_000_000) {
                const error = new Error('Corpo da requisição muito grande.');
                error.code = 'INVALID_INPUT';
                error.status = 413;
                fail(error);
                req.destroy();
            }
        });

        req.on('end', () => {
            if (settled) return;
            try {
                settled = true;
                resolve(body ? JSON.parse(body) : {});
            } catch {
                const error = new Error('JSON inválido.');
                error.code = 'INVALID_INPUT';
                error.status = 400;
                fail(error);
            }
        });

        req.on('error', fail);
    });
}

function json(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
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
