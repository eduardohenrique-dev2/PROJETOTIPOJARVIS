import { createJarvisReply } from '../ai-core.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const result = await createJarvisReply(body.messages);
        return res.status(200).json(result);
    } catch (error) {
        const status = error.code === 'INVALID_INPUT'
            ? 400
            : error.code === 'MISSING_API_KEY'
                ? 503
                : error.status || 500;

        return res.status(status).json({
            error: error.message || 'Falha ao consultar a IA.',
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
}
