import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJarvisReply } from './ai-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await loadEnv();
const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';

const publicFiles = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/Style.css', 'Style.css'],
    ['/js.js', 'js.js'],
    ['/actions.js', 'actions.js'],
    ['/blackhole-ui.js', 'blackhole-ui.js']
]);

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
};

const websiteTargets = {
    youtube: { label: 'YouTube', url: 'https://www.youtube.com/' },
    google: { label: 'Google', url: 'https://www.google.com/' },
    github: { label: 'GitHub', url: 'https://github.com/' },
    gmail: { label: 'Gmail', url: 'https://mail.google.com/' },
    whatsapp: { label: 'WhatsApp Web', url: 'https://web.whatsapp.com/' },
    spotify: { label: 'Spotify', url: 'https://open.spotify.com/' },
    maps: { label: 'Google Maps', url: 'https://maps.google.com/' }
};

const windowsApps = {
    calculator: { label: 'Calculadora', command: 'calc.exe', args: [] },
    notepad: { label: 'Bloco de Notas', command: 'notepad.exe', args: [] },
    explorer: { label: 'Explorador de Arquivos', command: 'explorer.exe', args: [] },
    paint: { label: 'Paint', command: 'mspaint.exe', args: [] },
    taskmanager: { label: 'Gerenciador de Tarefas', command: 'taskmgr.exe', args: [] },
    vscode: {
        label: 'Visual Studio Code',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'start', '', 'code']
    }
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
        const type = typeof body.type === 'string' ? body.type : '';
        const target = typeof body.target === 'string' ? body.target : '';

        if (type === 'website') {
            const site = websiteTargets[target];
            if (!site) return json(res, 400, { error: 'Site não permitido.' });

            await openExternal(site.url);
            return json(res, 200, {
                ok: true,
                action: 'website',
                message: `${site.label} aberto.`
            });
        }

        if (type === 'web-search') {
            const query = typeof body.query === 'string' ? body.query.trim().slice(0, 500) : '';
            if (!query) return json(res, 400, { error: 'Informe o que deseja pesquisar.' });

            let url;
            let label;

            if (target === 'youtube') {
                url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                label = 'YouTube';
            } else if (target === 'google') {
                url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                label = 'Google';
            } else {
                return json(res, 400, { error: 'Mecanismo de pesquisa não permitido.' });
            }

            await openExternal(url);
            return json(res, 200, {
                ok: true,
                action: 'web-search',
                message: `Pesquisa aberta no ${label}.`
            });
        }

        if (type === 'app') {
            if (process.platform !== 'win32') {
                return json(res, 501, { error: 'A abertura de aplicativos desta versão está configurada para Windows.' });
            }

            const app = windowsApps[target];
            if (!app) return json(res, 400, { error: 'Aplicativo não permitido.' });

            await launchDetached(app.command, app.args);
            return json(res, 200, {
                ok: true,
                action: 'app',
                message: `${app.label} aberto.`
            });
        }

        return json(res, 400, { error: 'Ação não reconhecida.' });
    } catch (error) {
        console.error('Erro ao executar ação local:', error);
        return json(res, 500, {
            error: 'Não consegui executar essa ação no computador.',
            code: 'ACTION_FAILED'
        });
    }
}

function openExternal(url) {
    if (process.platform === 'win32') {
        return launchDetached('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
    }

    if (process.platform === 'darwin') {
        return launchDetached('open', [url]);
    }

    return launchDetached('xdg-open', [url]);
}

function launchDetached(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });

        child.once('error', reject);
        child.once('spawn', () => {
            child.unref();
            resolve();
        });
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
