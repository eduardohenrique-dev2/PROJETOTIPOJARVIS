import { getRemoteAgentStatus } from '../remote-agent-client.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    const status = await getRemoteAgentStatus();
    return res.status(200).json(status);
}
