import { spawn } from 'node:child_process';

const WEBSITE_TARGETS = {
    youtube: { label: 'YouTube', url: 'https://www.youtube.com/' },
    google: { label: 'Google', url: 'https://www.google.com/' },
    github: { label: 'GitHub', url: 'https://github.com/' },
    gmail: { label: 'Gmail', url: 'https://mail.google.com/' },
    whatsapp: { label: 'WhatsApp Web', url: 'https://web.whatsapp.com/' },
    spotify: { label: 'Spotify', url: 'https://open.spotify.com/' },
    maps: { label: 'Google Maps', url: 'https://maps.google.com/' }
};

const WINDOWS_APPS = {
    calculator: { label: 'Calculadora', command: 'calc.exe', args: [] },
    notepad: { label: 'Bloco de Notas', command: 'notepad.exe', args: [] },
    explorer: { label: 'Explorador de Arquivos', command: 'explorer.exe', args: [] },
    paint: { label: 'Paint', command: 'mspaint.exe', args: [] },
    taskmanager: { label: 'Gerenciador de Tarefas', command: 'taskmgr.exe', args: [] },
    vscode: {
        label: 'Visual Studio Code',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'start', '', 'code']
    }
};

export function sanitizeAction(input) {
    const type = typeof input?.type === 'string' ? input.type.trim() : '';
    const target = typeof input?.target === 'string' ? input.target.trim() : '';
    const query = typeof input?.query === 'string' ? input.query.trim().slice(0, 500) : '';

    if (!['website', 'web-search', 'app'].includes(type)) {
        throw actionError('Ação não reconhecida.', 'INVALID_ACTION', 400);
    }

    if (type === 'website' && !WEBSITE_TARGETS[target]) {
        throw actionError('Site não permitido.', 'TARGET_NOT_ALLOWED', 400);
    }

    if (type === 'web-search') {
        if (!['youtube', 'google'].includes(target)) {
            throw actionError('Mecanismo de pesquisa não permitido.', 'TARGET_NOT_ALLOWED', 400);
        }
        if (!query) {
            throw actionError('Informe o que deseja pesquisar.', 'INVALID_ACTION', 400);
        }
    }

    if (type === 'app' && !WINDOWS_APPS[target]) {
        throw actionError('Aplicativo não permitido.', 'TARGET_NOT_ALLOWED', 400);
    }

    return { type, target, query };
}

export async function executeSafeAction(input) {
    const action = sanitizeAction(input);

    if (action.type === 'website') {
        const site = WEBSITE_TARGETS[action.target];
        await openExternal(site.url);
        return { ok: true, action: 'website', target: action.target, message: `${site.label} aberto.` };
    }

    if (action.type === 'web-search') {
        const isYouTube = action.target === 'youtube';
        const url = isYouTube
            ? `https://www.youtube.com/results?search_query=${encodeURIComponent(action.query)}`
            : `https://www.google.com/search?q=${encodeURIComponent(action.query)}`;
        const label = isYouTube ? 'YouTube' : 'Google';

        await openExternal(url);
        return { ok: true, action: 'web-search', target: action.target, message: `Pesquisa aberta no ${label}.` };
    }

    if (process.platform !== 'win32') {
        throw actionError('A abertura de aplicativos desta versão está configurada para Windows.', 'UNSUPPORTED_PLATFORM', 501);
    }

    const app = WINDOWS_APPS[action.target];
    await launchDetached(app.command, app.args);
    return { ok: true, action: 'app', target: action.target, message: `${app.label} aberto.` };
}

function openExternal(url) {
    if (process.platform === 'win32') {
        return launchDetached('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
    }

    if (process.platform === 'darwin') {
        return launchDetached('open', [url]);
    }

    return launchDetached('xdg-open', [url]);
}

function launchDetached(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });

        child.once('error', reject);
        child.once('spawn', () => {
            child.unref();
            resolve();
        });
    });
}

function actionError(message, code, status) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}
