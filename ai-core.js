const configuredModel = (process.env.GEMINI_MODEL || '').trim();
const LEGACY_MODELS = new Set(['gemini-2.5-flash', 'models/gemini-2.5-flash']);
export const JARVIS_MODEL = !configuredModel || LEGACY_MODELS.has(configuredModel)
    ? 'gemini-3.6-flash'
    : configuredModel.replace(/^models\//, '');

const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/interactions';

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

function buildConversationInput(messages) {
    const lines = messages.map((message) => {
        const speaker = message.role === 'assistant' ? 'JARVIS' : 'Usuário';
        return `${speaker}: ${message.content}`;
    });

    return `Conversa recente:\n${lines.join('\n')}\n\nResponda à última mensagem do Usuário levando em conta o contexto acima.`;
}

function extractOutputText(data) {
    const chunks = [];

    for (const step of data?.steps || []) {
        if (step?.type !== 'model_output') continue;

        for (const content of step.content || []) {
            if (content?.type === 'text' && typeof content.text === 'string') {
                chunks.push(content.text);
            }
        }
    }

    return chunks.join('\n').trim();
}

function normalizeGeminiError(data, status, model) {
    const rawMessage = data?.error?.message || data?.message || `Erro da API Gemini (${status}).`;

    if (status === 429) {
        return `O limite gratuito do modelo ${model} foi atingido por enquanto. Aguarde um pouco e tente novamente.`;
    }

    if (status === 403) {
        return 'A chave Gemini não tem permissão para essa solicitação. Confira a chave e o projeto no Google AI Studio.';
    }

    if ((status === 400 || status === 401) && /API key|api_key|key/i.test(rawMessage)) {
        return 'A chave Gemini parece inválida. Confira GEMINI_API_KEY no arquivo .env.';
    }

    if (status === 404 && /model|not found|available/i.test(rawMessage)) {
        return `O modelo ${model} não está disponível para esta chave.`;
    }

    return rawMessage;
}

async function requestGemini(apiKey, model, input) {
    const response = await fetch(INTERACTIONS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
            model,
            system_instruction: JARVIS_INSTRUCTIONS,
            input,
            store: false,
            generation_config: {
                max_output_tokens: 640,
                thinking_level: 'low'
            }
        })
    });

    const data = await response.json().catch(() => ({}));
    return { response, data };
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

    const input = buildConversationInput(cleanMessages);
    const modelsToTry = [...new Set([JARVIS_MODEL, FALLBACK_MODEL])];
    let lastFailure = null;

    for (const model of modelsToTry) {
        const { response, data } = await requestGemini(apiKey, model, input);

        if (response.ok) {
            const text = extractOutputText(data);
            if (!text) {
                const error = new Error('A IA respondeu, mas não retornou texto.');
                error.code = 'EMPTY_RESPONSE';
                throw error;
            }

            return {
                text,
                model: data.model || model,
                provider: 'gemini',
                interactionId: data.id || null
            };
        }

        lastFailure = { response, data, model };

        // Em caso de modelo indisponível ou cota temporária, tenta o Flash-Lite.
        if (![404, 429].includes(response.status) || model === FALLBACK_MODEL) {
            break;
        }
    }

    const status = lastFailure?.response?.status || 500;
    const model = lastFailure?.model || JARVIS_MODEL;
    const data = lastFailure?.data || {};
    const error = new Error(normalizeGeminiError(data, status, model));
    error.code = status === 429 ? 'RATE_LIMIT' : 'GEMINI_ERROR';
    error.status = status;
    throw error;
}
