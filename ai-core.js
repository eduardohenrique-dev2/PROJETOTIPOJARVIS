const configuredModel = (process.env.GEMINI_MODEL || '').trim();
const LEGACY_MODELS = new Set(['gemini-2.5-flash', 'models/gemini-2.5-flash']);
export const JARVIS_MODEL = !configuredModel || LEGACY_MODELS.has(configuredModel)
    ? 'gemini-3.6-flash'
    : configuredModel.replace(/^models\//, '');

const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/interactions';

const ALLOWED_ACTIONS = {
    website: new Set(['youtube', 'google', 'github', 'gmail', 'whatsapp', 'spotify', 'maps']),
    'web-search': new Set(['google', 'youtube']),
    app: new Set(['calculator', 'notepad', 'explorer', 'vscode', 'paint', 'taskmanager'])
};

const JARVIS_INSTRUCTIONS = `Você é J.A.R.V.I.S., um assistente pessoal futurista.
Converse naturalmente em português do Brasil, como um assistente humano prestativo e inteligente.
Sua resposta será lida em voz alta, então prefira frases naturais, claras e concisas.
Use o contexto recente para entender referências como "abre ele", "pesquisa isso", "quero programar agora" ou "onde vejo meus arquivos".

Além de conversar, você pode sugerir UMA ação estruturada quando a intenção do usuário for realmente executar algo no computador ou abrir/pesquisar algo.
Capacidades disponíveis:
- website: youtube, google, github, gmail, whatsapp, spotify, maps
- web-search: google ou youtube, sempre com query
- app: calculator, notepad, explorer, vscode, paint, taskmanager

Entenda linguagem natural e sinônimos. Exemplos de intenção:
- "abre onde ficam meus arquivos" -> app explorer
- "quero programar agora, abre o editor" -> app vscode
- "coloca o youtube pra mim" -> website youtube
- "procura um vídeo de ESP32" -> web-search youtube com query "ESP32"
- "pesquisa sobre CLP" -> web-search google com query "CLP"
- "vamos conversar sobre ESP32" -> nenhuma ação, apenas conversa

Não execute uma ação só porque um programa/site foi mencionado. A intenção de abrir, pesquisar ou executar deve estar clara.
Se a ação pedida não estiver nas capacidades disponíveis, responda naturalmente que essa integração ainda não existe e use action null.
Nunca invente que uma ação já foi executada; você apenas solicita a ação e o sistema executará depois.

IMPORTANTE: sua saída deve ser SOMENTE um JSON válido, sem markdown e sem texto fora dele, exatamente neste formato:
{"text":"resposta natural para o usuário","action":null}
ou
{"text":"resposta natural curta adequada à ação","action":{"type":"app|website|web-search","target":"alvo permitido","query":"somente para web-search"}}

Para perguntas simples, prefira 1 a 4 frases.`;

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

    return `Conversa recente:\n${lines.join('\n')}\n\nInterprete a última mensagem do Usuário e responda no JSON solicitado.`;
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

function validateAction(action) {
    if (!action || typeof action !== 'object') return null;

    const type = typeof action.type === 'string' ? action.type : '';
    const target = typeof action.target === 'string' ? action.target : '';
    const allowedTargets = ALLOWED_ACTIONS[type];

    if (!allowedTargets || !allowedTargets.has(target)) return null;

    if (type === 'web-search') {
        const query = typeof action.query === 'string' ? action.query.trim().slice(0, 500) : '';
        if (!query) return null;
        return { type, target, query };
    }

    return { type, target };
}

function parseJarvisEnvelope(rawText) {
    const clean = String(rawText || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    try {
        const parsed = JSON.parse(clean);
        const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
        if (!text) return { text: clean, action: null };
        return { text, action: validateAction(parsed.action) };
    } catch {
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace > firstBrace) {
            try {
                const parsed = JSON.parse(clean.slice(firstBrace, lastBrace + 1));
                const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
                if (text) return { text, action: validateAction(parsed.action) };
            } catch {
                // Mantém fallback abaixo.
            }
        }

        return { text: clean || 'Estou pronto.', action: null };
    }
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
                max_output_tokens: 700,
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
            const rawText = extractOutputText(data);
            if (!rawText) {
                const error = new Error('A IA respondeu, mas não retornou texto.');
                error.code = 'EMPTY_RESPONSE';
                throw error;
            }

            const envelope = parseJarvisEnvelope(rawText);
            return {
                text: envelope.text,
                action: envelope.action,
                model: data.model || model,
                provider: 'gemini',
                interactionId: data.id || null
            };
        }

        lastFailure = { response, data, model };

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
