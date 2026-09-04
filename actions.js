const JARVIS_WEB_TARGETS = {
    youtube: { label: 'YouTube', url: 'https://www.youtube.com/' },
    google: { label: 'Google', url: 'https://www.google.com/' },
    github: { label: 'GitHub', url: 'https://github.com/' },
    gmail: { label: 'Gmail', url: 'https://mail.google.com/' },
    whatsapp: { label: 'WhatsApp Web', url: 'https://web.whatsapp.com/' },
    spotify: { label: 'Spotify', url: 'https://open.spotify.com/' },
    maps: { label: 'Google Maps', url: 'https://maps.google.com/' }
};

const JARVIS_APP_LABELS = {
    calculator: 'Calculadora',
    notepad: 'Bloco de Notas',
    explorer: 'Explorador de Arquivos',
    vscode: 'Visual Studio Code',
    paint: 'Paint',
    taskmanager: 'Gerenciador de Tarefas'
};

const originalProcessCommand = window.processCommand;

window.processCommand = async function enhancedProcessCommand(command, fromVoice = false) {
    const action = parseJarvisAction(command);

    if (!action) {
        return originalProcessCommand(command, fromVoice);
    }

    return executeJarvisAction(action, fromVoice);
};

function normalizeActionText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^\s*jarvis[\s,.:;!?-]*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseJarvisAction(rawCommand) {
    const normalized = normalizeActionText(rawCommand);
    if (!normalized) return null;

    const youtubeSearch = normalized.match(/^(?:abra\s+(?:o\s+)?youtube\s+e\s+)?(?:pesquise|pesquisar|procure|procurar|busque|buscar)(?:\s+(?:por|no|na))?\s+(.+?)\s+(?:no|na)\s+youtube$/)
        || normalized.match(/^(?:pesquise|pesquisar|procure|procurar|busque|buscar)\s+(?:no|na)\s+youtube\s+(?:por\s+)?(.+)$/)
        || normalized.match(/^abra\s+(?:o\s+)?youtube\s+e\s+(?:pesquise|procure|busque)(?:\s+por)?\s+(.+)$/);

    if (youtubeSearch?.[1]) {
        return {
            type: 'web-search',
            target: 'youtube',
            query: youtubeSearch[1].trim(),
            label: 'YouTube'
        };
    }

    const googleSearch = normalized.match(/^(?:pesquise|pesquisar|procure|procurar|busque|buscar)\s+(?:por\s+)?(.+?)\s+(?:no google|na internet)$/)
        || normalized.match(/^(?:pesquise|pesquisar|procure|procurar|busque|buscar)\s+(?:no google|na internet)\s+(?:por\s+)?(.+)$/)
        || normalized.match(/^(?:pesquise|pesquisar|procure|procurar|busque|buscar)(?:\s+por)?\s+(.+)$/);

    if (googleSearch?.[1]) {
        return {
            type: 'web-search',
            target: 'google',
            query: googleSearch[1].trim(),
            label: 'Google'
        };
    }

    const openPrefix = /^(?:abra|abrir|abre|inicie|iniciar|execute|executar)\s+(?:o|a|os|as)?\s*/;
    if (!openPrefix.test(normalized)) return null;

    const targetText = normalized.replace(openPrefix, '').trim();

    const webAliases = [
        ['youtube', ['youtube']],
        ['google', ['google', 'navegador google']],
        ['github', ['github', 'git hub']],
        ['gmail', ['gmail', 'email', 'e-mail']],
        ['whatsapp', ['whatsapp', 'whatsapp web']],
        ['spotify', ['spotify']],
        ['maps', ['maps', 'google maps', 'mapas']]
    ];

    for (const [target, aliases] of webAliases) {
        if (aliases.some((alias) => targetText === alias || targetText.startsWith(`${alias} `))) {
            return {
                type: 'website',
                target,
                label: JARVIS_WEB_TARGETS[target].label
            };
        }
    }

    const appAliases = [
        ['calculator', ['calculadora', 'calc']],
        ['notepad', ['bloco de notas', 'notepad']],
        ['explorer', ['explorador de arquivos', 'explorador', 'meus arquivos', 'arquivos']],
        ['vscode', ['vs code', 'vscode', 'visual studio code']],
        ['paint', ['paint']],
        ['taskmanager', ['gerenciador de tarefas', 'task manager']]
    ];

    for (const [target, aliases] of appAliases) {
        if (aliases.some((alias) => targetText === alias)) {
            return {
                type: 'app',
                target,
                label: JARVIS_APP_LABELS[target]
            };
        }
    }

    return null;
}

async function executeJarvisAction(action, fromVoice) {
    if (fromVoice && isListening && recognition) {
        restartAfterSpeech = true;
        try {
            recognition.stop();
        } catch (error) {
            console.warn(error);
        }
    }

    setAssistantState('thinking');
    morphToText(action.type === 'app' ? 'ABRINDO' : 'ACESSANDO', 2200);

    const pendingMessage = action.type === 'web-search'
        ? `Pesquisando “${action.query}” no ${action.label}...`
        : `Abrindo ${action.label}...`;
    showResponse(pendingMessage, true);

    try {
        const response = await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: action.type,
                target: action.target,
                query: action.query || ''
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            if ((response.status === 404 || response.status === 405) && action.type !== 'app') {
                return openWebActionInBrowser(action, fromVoice);
            }

            throw new Error(data.error || `Não consegui executar a ação (${response.status}).`);
        }

        const message = data.message || `${action.label} aberto.`;
        showResponse(message);
        morphToText('PRONTO', 1700);
        speak(message, fromVoice);
    } catch (error) {
        console.error('Falha ao executar ação:', error);

        if (action.type !== 'app') {
            return openWebActionInBrowser(action, fromVoice);
        }

        setAssistantState('error');
        const message = `Não consegui abrir ${action.label}. Para controlar programas, execute o Jarvis localmente com npm start.`;
        showResponse(message);
        speak(message, fromVoice);
    }
}

function openWebActionInBrowser(action, fromVoice) {
    const url = buildWebActionUrl(action);
    if (!url) {
        const message = 'Não reconheci esse destino.';
        showResponse(message);
        speak(message, fromVoice);
        return;
    }

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    const message = opened
        ? (action.type === 'web-search' ? `Pesquisa aberta no ${action.label}.` : `${action.label} aberto.`)
        : `O navegador bloqueou a nova aba. Permita pop-ups para abrir ${action.label}.`;

    showResponse(message);
    morphToText(opened ? 'PRONTO' : 'ATENCAO', 1700);
    speak(message, fromVoice);
}

function buildWebActionUrl(action) {
    if (action.type === 'website') {
        return JARVIS_WEB_TARGETS[action.target]?.url || null;
    }

    if (action.type === 'web-search') {
        const query = encodeURIComponent(action.query || '');
        if (!query) return null;

        if (action.target === 'youtube') {
            return `https://www.youtube.com/results?search_query=${query}`;
        }

        return `https://www.google.com/search?q=${query}`;
    }

    return null;
}
