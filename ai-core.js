const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

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

function extractOutputText(data) {
    if (typeof data?.output_text === 'string' && data.output_text.trim()) {
        return data.output_text.trim();
    }

    const parts = [];
    for (const item of data?.output || []) {
        if (item?.type !== 'message') continue;
        for (const content of item.content || []) {
            if (content?.type === 'output_text' && typeof content.text === 'string') {
                parts.push(content.text);
            }
        }
    }

    return parts.join('\n').trim();
}

export async function createJarvisReply(messages) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        const error = new Error('OPENAI_API_KEY não configurada no servidor.');
        error.code = 'MISSING_API_KEY';
        throw error;
    }

    const cleanMessages = sanitizeMessages(messages);
    if (!cleanMessages.length) {
        const error = new Error('Nenhuma mensagem válida foi enviada.');
        error.code = 'INVALID_INPUT';
        throw error;
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            instructions: JARVIS_INSTRUCTIONS,
            input: cleanMessages,
            max_output_tokens: 320,
            reasoning: { effort: 'low' }
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data?.error?.message || `Erro da OpenAI (${response.status}).`;
        const error = new Error(message);
        error.code = 'OPENAI_ERROR';
        error.status = response.status;
        throw error;
    }

    const text = extractOutputText(data);
    if (!text) {
        const error = new Error('A IA não retornou texto.');
        error.code = 'EMPTY_RESPONSE';
        throw error;
    }

    return {
        text,
        model: data.model || DEFAULT_MODEL,
        responseId: data.id || null
    };
}
