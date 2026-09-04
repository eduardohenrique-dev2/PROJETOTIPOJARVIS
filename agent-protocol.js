import crypto from 'node:crypto';

const MAX_CLOCK_SKEW_MS = 30_000;

export function createAgentAuthHeaders(secret, method, pathname, body = '') {
    if (!secret) throw new Error('JARVIS_AGENT_SECRET não configurado.');

    const timestamp = Date.now().toString();
    const payload = buildSignaturePayload(timestamp, method, pathname, body);
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    return {
        'x-jarvis-timestamp': timestamp,
        'x-jarvis-signature': signature
    };
}

export function verifyAgentAuth(secret, headers, method, pathname, body = '') {
    if (!secret) return false;

    const timestamp = getHeader(headers, 'x-jarvis-timestamp');
    const receivedSignature = getHeader(headers, 'x-jarvis-signature');
    if (!timestamp || !receivedSignature) return false;

    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > MAX_CLOCK_SKEW_MS) {
        return false;
    }

    const payload = buildSignaturePayload(timestamp, method, pathname, body);
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const expected = Buffer.from(expectedSignature, 'utf8');
    const received = Buffer.from(receivedSignature, 'utf8');
    if (expected.length !== received.length) return false;

    return crypto.timingSafeEqual(expected, received);
}

function buildSignaturePayload(timestamp, method, pathname, body) {
    return `${timestamp}.${String(method || 'GET').toUpperCase()}.${pathname}.${body}`;
}

function getHeader(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';

    const direct = headers[name];
    if (Array.isArray(direct)) return direct[0] || '';
    return direct || headers[name.toLowerCase()] || '';
}
