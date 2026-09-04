let assistantState = 'idle';
let recognition = null;
let isListening = false;
let voiceModeEnabled = false;
let restartAfterSpeech = false;
let recognitionRestartTimer = null;
let awaitingCommand = false;
let awaitingCommandTimer = null;
let activeRequest = null;
let pendingVoiceText = '';
let pendingVoiceTimer = null;
let lastCommittedVoiceText = '';
let lastCommittedVoiceAt = 0;

const conversationHistory = [];
const RECOGNITION_RESTART_DELAY = 90;
const VOICE_COMMIT_DELAY = 700;
const VOICE_SPEECH_END_DELAY = 120;

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
    clearPendingVoice();
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
        micBtn.classList.toggle('active', voiceModeEnabled);
        micBtn.setAttribute('aria-pressed', voiceModeEnabled ? 'true' : 'false');
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
        if (voiceModeEnabled && assistantState !== 'thinking' && assistantState !== 'speaking') {
            setAssistantState('listening');
        }
    };

    recognition.onspeechend = () => {
        if (pendingVoiceText && shouldAutoCommitVoice(pendingVoiceText)) {
            schedulePendingVoiceCommit(VOICE_SPEECH_END_DELAY);
        }
    };

    recognition.onend = () => {
        isListening = false;

        if (pendingVoiceText && shouldAutoCommitVoice(pendingVoiceText)
            && assistantState !== 'thinking' && assistantState !== 'speaking') {
            commitPendingVoice();
        }

        if (!voiceModeEnabled) {
            if (assistantState === 'listening') setAssistantState('idle');
            return;
        }

        if (restartAfterSpeech || assistantState === 'thinking' || assistantState === 'speaking' || window.speechSynthesis?.speaking) {
            return;
        }

        scheduleRecognitionRestart(RECOGNITION_RESTART_DELAY);
    };

    recognition.onerror = (event) => {
        isListening = false;

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            voiceModeEnabled = false;
            clearPendingVoice();
            clearRecognitionRestart();
            setAssistantState('error');
            showResponse('Permita o acesso ao microfone no navegador para usar comandos de voz.');
            return;
        }

        if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') {
            if (pendingVoiceText && shouldAutoCommitVoice(pendingVoiceText)
                && assistantState !== 'thinking' && assistantState !== 'speaking') {
                commitPendingVoice();
                return;
            }

            if (voiceModeEnabled && assistantState !== 'thinking' && assistantState !== 'speaking') {
                scheduleRecognitionRestart(event.error === 'network' ? 450 : 120);
            }
            return;
        }

        if (voiceModeEnabled) {
            scheduleRecognitionRestart(250);
        } else {
            setAssistantState('idle');
        }
    };

    recognition.onresult = (event) => {
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript.trim();

            if (event.results[i].isFinal) {
                commitVoiceTranscript(transcript);
            } else if (transcript) {
                interimText += `${transcript} `;
            }
        }

        interimText = interimText.trim();
        if (interimText) {
            queueInterimVoice(interimText);
        }
    };
}

function queueInterimVoice(text) {
    const clean = String(text || '').trim();
    if (!clean || assistantState === 'thinking' || assistantState === 'speaking') return;

    pendingVoiceText = clean;

    const input = document.getElementById('morphText');
    if (input) input.value = clean;

    if (shouldAutoCommitVoice(clean)) {
        schedulePendingVoiceCommit(VOICE_COMMIT_DELAY);
    } else {
        clearTimeout(pendingVoiceTimer);
        pendingVoiceTimer = null;
    }
}

function shouldAutoCommitVoice(text) {
    if (!voiceModeEnabled) return false;
    if (awaitingCommand) return Boolean(String(text || '').trim());
    return normalizeText(text).includes('jarvis');
}

function schedulePendingVoiceCommit(delay = VOICE_COMMIT_DELAY) {
    clearTimeout(pendingVoiceTimer);
    pendingVoiceTimer = setTimeout(() => {
        pendingVoiceTimer = null;
        commitPendingVoice();
    }, delay);
}

function commitPendingVoice() {
    const text = pendingVoiceText.trim();
    if (!text) return;

    clearPendingVoice(false);
    const input = document.getElementById('morphText');
    if (input) input.value = '';
    commitVoiceTranscript(text);
}

function commitVoiceTranscript(transcript) {
    const clean = String(transcript || '').trim();
    if (!clean || assistantState === 'thinking' || assistantState === 'speaking') return;

    const normalized = normalizeText(clean);
    const now = Date.now();

    // Alguns navegadores entregam o mesmo trecho primeiro como interim e logo depois como final.
    // Evita processar a mesma fala duas vezes.
    if (normalized && normalized === lastCommittedVoiceText && now - lastCommittedVoiceAt < 2200) {
        clearPendingVoice();
        return;
    }

    lastCommittedVoiceText = normalized;
    lastCommittedVoiceAt = now;
    clearPendingVoice();

    const input = document.getElementById('morphText');
    if (input) input.value = '';

    handleVoiceTranscript(clean);
}

function clearPendingVoice(clearText = true) {
    clearTimeout(pendingVoiceTimer);
    pendingVoiceTimer = null;
    pendingVoiceText = '';

    if (clearText) {
        const input = document.getElementById('morphText');
        if (input && document.activeElement !== input) input.value = '';
    }
}

function toggleListening() {
    if (!recognition) return;

    if (voiceModeEnabled) {
        voiceModeEnabled = false;
        restartAfterSpeech = false;
        awaitingCommand = false;
        clearTimeout(awaitingCommandTimer);
        clearPendingVoice();
        clearRecognitionRestart();

        if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();

        if (isListening) {
            try { recognition.abort(); } catch (error) { console.warn(error); }
        }

        setAssistantState('idle');
        showResponse('Microfone pausado. Clique nele para voltar a ouvir.');
        return;
    }

    voiceModeEnabled = true;
    restartAfterSpeech = false;
    clearPendingVoice();
    setAssistantState('listening');
    startListening();
}

function clearRecognitionRestart() {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
}

function scheduleRecognitionRestart(delay = RECOGNITION_RESTART_DELAY) {
    if (!voiceModeEnabled || !recognition) return;

    clearRecognitionRestart();
    recognitionRestartTimer = setTimeout(() => {
        recognitionRestartTimer = null;

        if (!voiceModeEnabled || assistantState === 'thinking' || assistantState === 'speaking' || window.speechSynthesis?.speaking) {
            return;
        }

        startListening();
    }, delay);
}

function startListening() {
    if (!recognition || !voiceModeEnabled || isListening) return;

    try {
        recognition.start();
    } catch (error) {
        if (voiceModeEnabled) {
            scheduleRecognitionRestart(140);
        } else {
            console.warn('Não foi possível iniciar o reconhecimento:', error);
        }
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
            awaitingCommandTimer = setTimeout(() => {
                awaitingCommand = false;
                clearPendingVoice();
                if (voiceModeEnabled && !isListening) scheduleRecognitionRestart(80);
            }, 6500);
            setAssistantState('listening');
            showResponse('Sim. Estou ouvindo...');
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

    clearPendingVoice();
    const resumeVoice = Boolean(fromVoice && voiceModeEnabled);

    if (fromVoice && isListening && recognition) {
        restartAfterSpeech = voiceModeEnabled;
        try { recognition.stop(); } catch (error) { console.warn(error); }
    }

    setAssistantState('thinking');
    showResponse(`Pensando sobre: “${cleanCommand}”`, true);
    morphToText('PENSANDO');

    const normalized = normalizeText(cleanCommand);
    const systemResponse = typeof window.getJarvisSystemResponse === 'function'
        ? window.getJarvisSystemResponse(normalized)
        : getSystemResponse(normalized);

    if (systemResponse) {
        if (systemResponse.action === 'clear') conversationHistory.length = 0;
        showResponse(systemResponse.text);
        speak(systemResponse.text, resumeVoice && voiceModeEnabled);
        return;
    }

    try {
        const result = await askJarvisAI(cleanCommand);
        const aiMode = document.getElementById('aiMode');
        if (aiMode) aiMode.textContent = result.model || 'Gemini online';

        let responseText = result.text;
        showResponse(responseText);

        if (result.action && typeof window.executeJarvisAction === 'function') {
            const actionResult = await window.executeJarvisAction(result.action);

            if (!actionResult?.ok) {
                responseText = actionResult?.message || 'Entendi o que você queria fazer, mas não consegui executar essa ação.';
                showResponse(responseText);
                morphToText('ATENCAO');
            } else {
                morphToText('PRONTO');
            }
        } else {
            morphToText('JARVIS');
        }

        speak(responseText, resumeVoice && voiceModeEnabled);
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
        speak(message, resumeVoice && voiceModeEnabled);
    }
}

function getSystemResponse(command) {
    if (command.includes('limpar conversa') || command.includes('esquecer conversa') || command.includes('zerar memoria')) {
        return { text: 'Certo. Limpei o contexto desta conversa.', action: 'clear' };
    }

    if (command.includes('parar de ouvir') || command.includes('desligar microfone')) {
        voiceModeEnabled = false;
        restartAfterSpeech = false;
        clearPendingVoice();
        clearRecognitionRestart();
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
    const shouldResume = Boolean(resumeListening && voiceModeEnabled);

    if (!('speechSynthesis' in window)) {
        restartAfterSpeech = false;
        if (shouldResume) {
            setAssistantState('listening');
            scheduleRecognitionRestart(60);
        } else {
            setAssistantState('idle');
        }
        return;
    }

    restartAfterSpeech = shouldResume;
    clearPendingVoice();
    clearRecognitionRestart();

    if (isListening && recognition) {
        try { recognition.stop(); } catch (error) { console.warn(error); }
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.08;
    utterance.pitch = 0.92;

    utterance.onstart = () => setAssistantState('speaking');
    utterance.onend = finishSpeech;
    utterance.onerror = finishSpeech;

    function finishSpeech() {
        const resume = restartAfterSpeech && voiceModeEnabled;
        restartAfterSpeech = false;

        if (resume) {
            setAssistantState('listening');
            scheduleRecognitionRestart(60);
        } else {
            setAssistantState('idle');
        }
    }

    window.speechSynthesis.speak(utterance);
}

initAssistant();
