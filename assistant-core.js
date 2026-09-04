let assistantState = 'idle';
let recognition = null;
let isListening = false;
let restartAfterSpeech = false;
let awaitingCommand = false;
let awaitingCommandTimer = null;
let activeRequest = null;

const conversationHistory = [];

const stateConfig = {
    idle: 'Jarvis em espera',
    listening: 'Ouvindo...',
    thinking: 'Pensando...',
    speaking: 'Respondendo...',
    error: 'Atenção necessária'
};

function initAssistant() {
    const typeBtn = document.getElementById('typeBtn');
    const micBtn = document.getElementById('micBtn');
    const input = document.getElementById('morphText');

    typeBtn?.addEventListener('click', submitTypedCommand);
    micBtn?.addEventListener('click', toggleListening);
    input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submitTypedCommand();
    });

    document.querySelectorAll('[data-command]').forEach((button) => {
        button.addEventListener('click', () => processCommand(button.dataset.command || '', false));
    });

    setupSpeechRecognition();
    setAssistantState('idle');
}

function submitTypedCommand() {
    const input = document.getElementById('morphText');
    const text = input?.value.trim() || '';
    if (!text || assistantState === 'thinking') return;
    input.value = '';
    processCommand(text, false);
}

function setAssistantState(state) {
    assistantState = state;
    document.body.dataset.state = state;

    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const micBtn = document.getElementById('micBtn');
    const typeBtn = document.getElementById('typeBtn');

    if (statusText) statusText.textContent = stateConfig[state] || stateConfig.idle;
    if (statusDot) statusDot.dataset.state = state;
    if (micBtn) {
        micBtn.classList.toggle('active', state === 'listening');
        micBtn.setAttribute('aria-pressed', state === 'listening' ? 'true' : 'false');
    }
    if (typeBtn) typeBtn.disabled = state === 'thinking';
}

function showResponse(text, thinking = false) {
    const responseText = document.getElementById('responseText');
    if (!responseText) return;
    responseText.textContent = text;
    responseText.classList.toggle('thinking', thinking);
}

function morphToText(text) {
    const label = document.getElementById('coreActionLabel');
    if (!label) return;
    label.textContent = String(text || 'JARVIS').slice(0, 18).toUpperCase();
    label.classList.remove('flash');
    void label.offsetWidth;
    label.classList.add('flash');
}

function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('micBtn');

    if (!SpeechRecognition) {
        if (micBtn) {
            micBtn.disabled = true;
            micBtn.title = 'Reconhecimento de voz não suportado neste navegador';
        }
        showResponse('O reconhecimento de voz deste navegador não é compatível. Você ainda pode conversar digitando.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        isListening = true;
        setAssistantState('listening');
    };

    recognition.onend = () => {
        isListening = false;
        if (restartAfterSpeech || assistantState === 'thinking' || assistantState === 'speaking') return;
        if (assistantState === 'listening') setAssistantState('idle');
    };

    recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        isListening = false;

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setAssistantState('error');
            showResponse('Permita o acesso ao microfone no navegador para usar comandos de voz.');
        } else if (!restartAfterSpeech) {
            setAssistantState('idle');
        }
    };

    recognition.onresult = (event) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript.trim();
            if (event.results[i].isFinal) {
                const input = document.getElementById('morphText');
                if (input) input.value = '';
                handleVoiceTranscript(transcript);
            } else {
                interimText += transcript;
            }
        }
        if (interimText) {
            const input = document.getElementById('morphText');
            if (input) input.value = interimText;
        }
    };
}

function toggleListening() {
    if (!recognition) return;

    if (assistantState === 'speaking') window.speechSynthesis?.cancel();

    if (isListening) {
        restartAfterSpeech = false;
        recognition.stop();
        setAssistantState('idle');
        showResponse('Microfone pausado. Clique nele para voltar a ouvir.');
        return;
    }

    restartAfterSpeech = false;
    startListening();
}

function startListening() {
    if (!recognition || isListening) return;
    try {
        recognition.start();
    } catch (error) {
        console.warn('Reconhecimento já iniciado:', error);
    }
}

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,!?;:]/g, '')
        .trim();
}

function handleVoiceTranscript(transcript) {
    const normalized = normalizeText(transcript);

    if (normalized.includes('jarvis')) {
        const command = transcript.replace(/^.*?jarvis[\s,.:;!?-]*/i, '').trim();
        morphToText('JARVIS');

        if (!command) {
            awaitingCommand = true;
            clearTimeout(awaitingCommandTimer);
            awaitingCommandTimer = setTimeout(() => { awaitingCommand = false; }, 9000);
            speak('Sim, estou ouvindo.', true);
            return;
        }

        awaitingCommand = false;
        clearTimeout(awaitingCommandTimer);
        processCommand(command, true);
        return;
    }

    if (awaitingCommand && transcript.trim()) {
        awaitingCommand = false;
        clearTimeout(awaitingCommandTimer);
        processCommand(transcript.trim(), true);
    }
}

async function processCommand(command, fromVoice = false) {
    const cleanCommand = command.trim();
    if (!cleanCommand) return;

    if (fromVoice && isListening && recognition) {
        restartAfterSpeech = true;
        try { recognition.stop(); } catch (error) { console.warn(error); }
    }

    setAssistantState('thinking');
    showResponse(`Processando: “${cleanCommand}”`, true);
    morphToText('PENSANDO');

    const normalized = normalizeText(cleanCommand);
    const localResponse = getLocalResponse(normalized);

    if (localResponse) {
        if (localResponse.action === 'clear') conversationHistory.length = 0;
        showResponse(localResponse.text);
        speak(localResponse.text, fromVoice);
        return;
    }

    try {
        const result = await askJarvisAI(cleanCommand);
        showResponse(result.text);
        const aiMode = document.getElementById('aiMode');
        if (aiMode) aiMode.textContent = result.model || 'Gemini online';
        morphToText('JARVIS');
        speak(result.text, fromVoice);
    } catch (error) {
        console.error(error);
        setAssistantState('error');

        let message = 'Não consegui acessar meu módulo de inteligência agora.';
        if (error.code === 'MISSING_API_KEY') {
            message = 'Meu módulo de IA ainda não está configurado. Adicione GEMINI_API_KEY no arquivo .env do servidor.';
        } else if (location.protocol === 'file:') {
            message = 'Abra o Jarvis pelo servidor local usando npm start.';
        } else if (error.message) {
            message = `Não consegui consultar a IA: ${error.message}`;
        }

        showResponse(message);
        speak(message, fromVoice);
    }
}

function getLocalResponse(command) {
    const now = new Date();

    if (command.includes('que horas') || command === 'horas' || command.includes('hora agora')) {
        const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return { text: `Agora são ${time}.` };
    }

    if (command.includes('que dia') || command.includes('data de hoje') || command.includes('qual a data')) {
        const date = now.toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
        return { text: `Hoje é ${date}.` };
    }

    if (command.includes('quem e voce') || command.includes('qual seu nome') || command.includes('se apresente')) {
        return { text: 'Eu sou Jarvis, seu assistente pessoal conectado à inteligência artificial e aos comandos locais deste computador.' };
    }

    if (command.includes('bom dia')) return { text: 'Bom dia. Sistemas online e prontos para trabalhar.' };
    if (command.includes('boa tarde')) return { text: 'Boa tarde. Estou à disposição.' };
    if (command.includes('boa noite')) return { text: 'Boa noite. Estou à disposição.' };

    if (command.includes('limpar conversa') || command.includes('esquecer conversa') || command.includes('zerar memoria')) {
        return { text: 'Certo. Limpei o contexto desta conversa.', action: 'clear' };
    }

    if (command.includes('parar de ouvir') || command.includes('desligar microfone')) {
        restartAfterSpeech = false;
        return { text: 'Certo. Vou desligar o microfone.' };
    }

    return null;
}

async function askJarvisAI(message) {
    conversationHistory.push({ role: 'user', content: message });
    while (conversationHistory.length > 12) conversationHistory.shift();

    if (activeRequest) activeRequest.abort();
    activeRequest = new AbortController();
    const timeout = setTimeout(() => activeRequest.abort(), 45000);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory }),
            signal: activeRequest.signal
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || `Servidor respondeu ${response.status}.`);
            error.code = data.code || 'API_ERROR';
            throw error;
        }

        if (!data.text) throw new Error('A IA não retornou uma resposta de texto.');
        conversationHistory.push({ role: 'assistant', content: data.text });
        while (conversationHistory.length > 12) conversationHistory.shift();
        return data;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('a resposta demorou além do limite.');
        throw error;
    } finally {
        clearTimeout(timeout);
        activeRequest = null;
    }
}

function speak(text, resumeListening = false) {
    if (!('speechSynthesis' in window)) {
        restartAfterSpeech = false;
        setAssistantState(resumeListening ? 'listening' : 'idle');
        if (resumeListening) setTimeout(startListening, 250);
        return;
    }

    restartAfterSpeech = resumeListening;
    if (isListening && recognition) {
        try { recognition.stop(); } catch (error) { console.warn(error); }
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.02;
    utterance.pitch = 0.92;

    utterance.onstart = () => setAssistantState('speaking');
    utterance.onend = finishSpeech;
    utterance.onerror = finishSpeech;

    function finishSpeech() {
        const shouldRestart = restartAfterSpeech;
        restartAfterSpeech = false;
        if (shouldRestart) {
            setAssistantState('listening');
            setTimeout(startListening, 250);
        } else {
            setAssistantState('idle');
        }
    }

    window.speechSynthesis.speak(utterance);
}

initAssistant();