import { createAgentAuthHeaders } from './agent-protocol.js';

const REQUEST_TIMEOUT_MS = 5_000;
const FORBIDDEN_SECRETS = new Set([
    'troque_por_um_segredo_forte_e_unico',
    'sua_chave_aqui',
    'changeme',
    'change-me'
]);

export async function getRemoteAgentStatus() {
    const config = getAgentConfig();
    if (!config.ok) {
        return {
            online: false,
            configured: false,
            code: config.code,
            message: config.message
        };
    }

    try {
        const data = await signedAgentRequest(config, 'GET', '/status');
        return {
            online: Boolean(data?.online || data?.ok),
            configured: true,
            mode: 'remote',
            version: data?.version || null,
            platform: data?.platform || null,
            message: data?.message || 'PC conectado.'
        };
    } catch (error) {
        return {
            online: false,
            configured: true,
            code: error.code || 'AGENT_OFFLINE',
            message: error.message || 'Jarvis Agent indisponível.'
        };
    }
}

export async function executeRemoteAction(action) {
    const config = getAgentConfig();
    if (!config.ok) {
        const error = new Error(config.message);
        error.code = config.code;
        error.status = 503;
        throw error;
    }

    return signedAgentRequest(config, 'POST', '/action', action);
}

function getAgentConfig() {
    const rawUrl = (process.env.JARVIS_AGENT_URL || '').trim();
    const secret = (process.env.JARVIS_AGENT_SECRET || '').trim();

    if (!rawUrl || !secret) {
        return {
            ok: false,
            code: 'AGENT_NOT_CONFIGURED',
            message: 'O acesso remoto ao computador ainda não foi configurado.'
        };
    }

    if (secret.length < 24 || FORBIDDEN_SECRETS.has(secret.toLowerCase())) {
        return {
            ok: false,
            code: 'INSECURE_AGENT_SECRET',
            message: 'O segredo do Jarvis Agent está inseguro ou ainda usa o valor de exemplo.'
        };
    }

    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return { ok: false, code: 'INVALID_AGENT_URL', message: 'JARVIS_AGENT_URL é inválida.' };
    }

    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
        return {
            ok: false,
            code: 'INSECURE_AGENT_URL',
            message: 'O Jarvis Agent remoto precisa usar HTTPS.'
        };
    }

    url.pathname = url.pathname.replace(/\/$/, '');
    return { ok: true, baseUrl: url.toString().replace(/\/$/, ''), secret };
}

async function signedAgentRequest(config, method, pathname, payload = null) {
    const body = payload ? JSON.stringify(payload) : '';
    const headers = {
        ...createAgentAuthHeaders(config.secret, method, pathname, body)
    };

    if (body) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${config.baseUrl}${pathname}`, {
            method,
            headers,
            body: body || undefined,
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || `Jarvis Agent respondeu ${response.status}.`);
            error.code = data.code || 'AGENT_REQUEST_FAILED';
            error.status = response.status;
            throw error;
        }

        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('O computador não respondeu a tempo.');
            timeoutError.code = 'AGENT_TIMEOUT';
            timeoutError.status = 504;
            throw timeoutError;
        }

        if (!error.status) {
            error.code = error.code || 'AGENT_OFFLINE';
            error.status = 503;
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
