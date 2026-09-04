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

let lastAgentStatus = { online: false, configured: false };
let agentStatusTimer = null;

function getActionLabel(action) {
    if (action?.type === 'app') return JARVIS_APP_LABELS[action.target] || action.target;
    return JARVIS_WEB_TARGETS[action?.target]?.label || action?.target || 'destino';
}

window.executeJarvisAction = async function executeJarvisAction(action) {
    if (!action || typeof action !== 'object') {
        return { ok: false, message: 'Não recebi uma ação válida para executar.' };
    }

    const label = getActionLabel(action);
    morphToText(action.type === 'app' ? 'ABRINDO' : action.type === 'web-search' ? 'BUSCANDO' : 'ACESSANDO');

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
            // Se a aplicação estiver sendo servida sem o backend de ações, sites ainda podem abrir no próprio navegador.
            if ((response.status === 404 || response.status === 405) && action.type !== 'app') {
                return openWebActionInBrowser(action);
            }

            const error = new Error(data.error || `Não consegui executar a ação (${response.status}).`);
            error.code = data.code || 'ACTION_FAILED';
            error.status = response.status;
            throw error;
        }

        morphToText('PRONTO');
        refreshAgentStatus();
        return {
            ok: true,
            message: data.message || `${label} aberto.`
        };
    } catch (error) {
        console.error('Falha ao executar ação:', error);
        refreshAgentStatus();

        if (['AGENT_OFFLINE', 'AGENT_TIMEOUT', 'AGENT_NOT_CONFIGURED'].includes(error.code)) {
            return {
                ok: false,
                message: error.code === 'AGENT_NOT_CONFIGURED'
                    ? 'Entendi a ação, mas o acesso remoto ao seu computador ainda não foi configurado na hospedagem.'
                    : 'Entendi a ação, mas seu computador está offline ou o Jarvis Agent não está conectado.'
            };
        }

        return {
            ok: false,
            message: `Entendi o que você quis fazer, mas não consegui executar ${label} no computador.`
        };
    }
};

function openWebActionInBrowser(action) {
    const url = buildWebActionUrl(action);
    if (!url) {
        return { ok: false, message: 'Entendi a intenção, mas esse destino ainda não está disponível.' };
    }

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    const label = getActionLabel(action);

    morphToText(opened ? 'PRONTO' : 'ATENCAO');

    return opened
        ? { ok: true, message: action.type === 'web-search' ? `Pesquisa aberta no ${label}.` : `${label} aberto.` }
        : { ok: false, message: `O navegador bloqueou a nova aba. Permita pop-ups para eu abrir ${label}.` };
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

        if (action.target === 'google') {
            return `https://www.google.com/search?q=${query}`;
        }
    }

    return null;
}

async function refreshAgentStatus() {
    const element = document.getElementById('agentStatusText');
    if (!element) return;

    try {
        const response = await fetch('/api/agent-status', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));

        lastAgentStatus = data;

        if (data.online) {
            element.textContent = data.mode === 'local' ? 'PC LOCAL' : 'PC ONLINE';
            element.style.color = '#72ffd2';
            element.title = data.message || 'Computador conectado';
            return;
        }

        element.textContent = data.configured === false ? 'PC NÃO CONFIG.' : 'PC OFFLINE';
        element.style.color = data.configured === false ? '#ffd17a' : '#ff7b91';
        element.title = data.message || 'Computador indisponível';
    } catch (error) {
        lastAgentStatus = { online: false, configured: false };
        element.textContent = 'PC OFFLINE';
        element.style.color = '#ff7b91';
        element.title = 'Não foi possível consultar o status do computador';
    }
}

function startAgentStatusMonitor() {
    refreshAgentStatus();
    clearInterval(agentStatusTimer);
    agentStatusTimer = setInterval(refreshAgentStatus, 12_000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshAgentStatus();
    });
}

startAgentStatusMonitor();
