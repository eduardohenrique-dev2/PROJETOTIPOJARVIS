const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const JARVIS_INSTRUCTIONS = `Você é J.A.R.V.I.S., um assistente pessoal futurista em desenvolvimento.
Responda sempre em português do Brasil, a menos que o usuário peça outro idioma.
Sua resposta será lida em voz alta, então seja natural, clara e concisa.
Prefira respostas de 1 a 4 frases para perguntas simples.
Não diga que executou ações no computador, abriu programas, enviou mensagens ou controlou dispositivos se isso não tiver realmente acontecido.
Quando não tiver uma integração necessária, explique de forma curta o que falta.
Você pode ajudar com estudos, programação, projetos, ideias, explicações e conversas gerais.`;

function sanitizeMessages(messages) {
    if (!Array.isArray(messages)) return [];

    return messages
        .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
        .map((message) => ({
            role: message.role,
            content: message.content.trim().slice(0, 8000)
        }))
        .filter((message) => message.content)
        .slice(-12);
}

function toGeminiContents(messages) {
    return messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
    }));
}

function extractOutputText(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts
        .filter((part) => typeof part?.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim();
}

function normalizeGeminiError(data, status) {
    const rawMessage = data?.error?.message || `Erro da API Gemini (${status}).`;

    if (status === 429) {
        return 'O limite gratuito do Gemini foi atingido por enquanto. Aguarde um pouco e tente novamente.';
    }

    if (status === 403) {
        return 'A chave Gemini não tem permissão para essa solicitação. Confira a chave e o projeto no Google AI Studio.';
    }

    if (status === 400 && /API key/i.test(rawMessage)) {
        return 'A chave Gemini parece inválida. Confira GEMINI_API_KEY no arquivo .env.';
    }

    return rawMessage;
}

export async function createJarvisReply(messages) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        const error = new Error('GEMINI_API_KEY não configurada no servidor.');
        error.code = 'MISSING_API_KEY';
        throw error;
    }

    const cleanMessages = sanitizeMessages(messages);
    if (!cleanMessages.length) {
        const error = new Error('Nenhuma mensagem válida foi enviada.');
        error.code = 'INVALID_INPUT';
        throw error;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
            system_instruction: {
                parts: [{ text: JARVIS_INSTRUCTIONS }]
            },
            contents: toGeminiContents(cleanMessages),
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 640,
                thinkingConfig: {
                    thinkingBudget: 256
                }
            }
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(normalizeGeminiError(data, response.status));
        error.code = response.status === 429 ? 'RATE_LIMIT' : 'GEMINI_ERROR';
        error.status = response.status;
        throw error;
    }

    const text = extractOutputText(data);
    if (!text) {
        const blockReason = data?.promptFeedback?.blockReason;
        const error = new Error(blockReason
            ? `O Gemini não gerou resposta (${blockReason}).`
            : 'A IA não retornou texto.');
        error.code = 'EMPTY_RESPONSE';
        throw error;
    }

    return {
        text,
        model: DEFAULT_MODEL,
        provider: 'gemini'
    };
}
