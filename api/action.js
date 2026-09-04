import { executeRemoteAction } from '../remote-agent-client.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const body = normalizeBody(req.body);
        const result = await executeRemoteAction(body);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(error.status || 500).json({
            error: error.message || 'Falha ao acessar o computador remoto.',
            code: error.code || 'REMOTE_ACTION_FAILED'
        });
    }
}

function normalizeBody(body) {
    if (body && typeof body === 'object') return body;
    if (typeof body === 'string' && body.trim()) {
        try {
            return JSON.parse(body);
        } catch {
            const error = new Error('JSON inválido.');
            error.status = 400;
            error.code = 'INVALID_JSON';
            throw error;
        }
    }
    return {};
}
