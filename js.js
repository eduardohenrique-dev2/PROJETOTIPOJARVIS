let scene, camera, renderer, particles;

const PARTICLE_COUNT = 12000;
const SPHERE_RADIUS = 8;
const clock = new THREE.Clock();

let currentShape = 'sphere';
let targetPositions = null;
let morphTimer = null;
let assistantState = 'idle';
let recognition = null;
let isListening = false;
let restartAfterSpeech = false;
let awaitingCommand = false;
let awaitingCommandTimer = null;
let activeRequest = null;

const conversationHistory = [];

const stateConfig = {
    idle: { label: 'Jarvis em espera', hue: 0.53, saturation: 0.72 },
    listening: { label: 'Ouvindo...', hue: 0.36, saturation: 0.82 },
    thinking: { label: 'Pensando...', hue: 0.75, saturation: 0.78 },
    speaking: { label: 'Respondendo...', hue: 0.56, saturation: 0.88 },
    error: { label: 'Atenção necessária', hue: 0.0, saturation: 0.82 }
};

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);
    document.getElementById('container').appendChild(renderer.domElement);

    camera.position.z = 25;

    createParticles();
    setupEventListeners();
    setupSpeechRecognition();
    setAssistantState('idle');
    animate();
}

function sphericalDistribution(i) {
    const phi = Math.acos(-1 + (2 * i) / PARTICLE_COUNT);
    const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi;

    return {
        x: SPHERE_RADIUS * Math.cos(theta) * Math.sin(phi),
        y: SPHERE_RADIUS * Math.sin(theta) * Math.sin(phi),
        z: SPHERE_RADIUS * Math.cos(phi)
    };
}

function buildSphereTargets(addNoise = true) {
    const targets = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const point = sphericalDistribution(i);
        const noise = addNoise ? 0.5 : 0;

        targets[i * 3] = point.x + (Math.random() - 0.5) * noise;
        targets[i * 3 + 1] = point.y + (Math.random() - 0.5) * noise;
        targets[i * 3 + 2] = point.z + (Math.random() - 0.5) * noise;
    }

    return targets;
}

function createParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = buildSphereTargets(true);
    const colors = new Float32Array(PARTICLE_COUNT * 3);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.08,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.88,
        sizeAttenuation: true
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    targetPositions = buildSphereTargets(false);
    applyStateColors('idle');
}

function setupEventListeners() {
    const typeBtn = document.getElementById('typeBtn');
    const micBtn = document.getElementById('micBtn');
    const input = document.getElementById('morphText');

    typeBtn.addEventListener('click', submitTypedCommand);
    micBtn.addEventListener('click', toggleListening);

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submitTypedCommand();
    });
}

function submitTypedCommand() {
    const input = document.getElementById('morphText');
    const text = input.value.trim();
    if (!text || assistantState === 'thinking') return;

    input.value = '';
    processCommand(text, false);
}

function setAssistantState(state) {
    assistantState = state;
    const config = stateConfig[state] || stateConfig.idle;
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const micBtn = document.getElementById('micBtn');
    const typeBtn = document.getElementById('typeBtn');

    if (statusText) statusText.textContent = config.label;
    if (statusDot) statusDot.dataset.state = state;
    if (micBtn) {
        micBtn.classList.toggle('active', state === 'listening');
        micBtn.setAttribute('aria-pressed', state === 'listening' ? 'true' : 'false');
    }
    if (typeBtn) typeBtn.disabled = state === 'thinking';

    if (particles) applyStateColors(state);
}

function showResponse(text, thinking = false) {
    const responseText = document.getElementById('responseText');
    if (!responseText) return;

    responseText.textContent = text;
    responseText.classList.toggle('thinking', thinking);
}

function applyStateColors(state) {
    if (!particles) return;

    const config = stateConfig[state] || stateConfig.idle;
    const colors = particles.geometry.attributes.color.array;
    const color = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const variation = (i % 17) / 17;
        const hue = (config.hue + variation * 0.08) % 1;
        const lightness = 0.48 + variation * 0.24;
        color.setHSL(hue, config.saturation, lightness);

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    particles.geometry.attributes.color.needsUpdate = true;
}

function createTextPoints(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const padding = 30;
    let fontSize = 100;
    const safeText = text.slice(0, 22);

    ctx.font = `bold ${fontSize}px Arial`;
    let textWidth = ctx.measureText(safeText).width;

    if (textWidth > 1400) {
        fontSize = Math.max(46, Math.floor(fontSize * (1400 / textWidth)));
        ctx.font = `bold ${fontSize}px Arial`;
        textWidth = ctx.measureText(safeText).width;
    }

    canvas.width = Math.ceil(textWidth + padding * 2);
    canvas.height = fontSize + padding * 2;

    ctx.fillStyle = 'white';
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(safeText, canvas.width / 2, canvas.height / 2);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const points = [];
    const step = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / PARTICLE_COUNT)));

    for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
            const index = (y * canvas.width + x) * 4;
            if (pixels[index + 3] > 128 && pixels[index] > 128) {
                points.push({
                    x: (x - canvas.width / 2) / (fontSize / 10),
                    y: -(y - canvas.height / 2) / (fontSize / 10)
                });
            }
        }
    }

    return points;
}

function morphToText(text, returnDelay = 2600) {
    if (!text) return;

    const textPoints = createTextPoints(text);
    const targets = new Float32Array(PARTICLE_COUNT * 3);
    currentShape = 'text';
    particles.rotation.set(0, 0, 0);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (i < textPoints.length) {
            targets[i * 3] = textPoints[i].x;
            targets[i * 3 + 1] = textPoints[i].y;
            targets[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 18 + 11;
            targets[i * 3] = Math.cos(angle) * radius;
            targets[i * 3 + 1] = Math.sin(angle) * radius;
            targets[i * 3 + 2] = (Math.random() - 0.5) * 9;
        }
    }

    targetPositions = targets;

    clearTimeout(morphTimer);
    morphTimer = setTimeout(morphToSphere, returnDelay);
}

function morphToSphere() {
    currentShape = 'sphere';
    targetPositions = buildSphereTargets(true);
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

        console.warn('Erro no reconhecimento de voz:', event.error);
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
                document.getElementById('morphText').value = '';
                handleVoiceTranscript(transcript);
            } else {
                interimText += transcript;
            }
        }

        if (interimText) {
            document.getElementById('morphText').value = interimText;
        }
    };
}

function toggleListening() {
    if (!recognition) return;

    if (assistantState === 'speaking') {
        window.speechSynthesis?.cancel();
    }

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
        morphToText('JARVIS', 2200);

        if (!command) {
            awaitingCommand = true;
            clearTimeout(awaitingCommandTimer);
            awaitingCommandTimer = setTimeout(() => {
                awaitingCommand = false;
            }, 9000);
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
        try {
            recognition.stop();
        } catch (error) {
            console.warn(error);
        }
    }

    setAssistantState('thinking');
    showResponse(`Processando: “${cleanCommand}”`, true);
    morphToText('PENSANDO', 2400);

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
        document.getElementById('aiMode').textContent = result.model || 'IA online';
        morphToText('JARVIS', 2000);
        speak(result.text, fromVoice);
    } catch (error) {
        console.error(error);
        setAssistantState('error');

        let message = 'Não consegui acessar meu módulo de inteligência agora.';
        if (error.code === 'MISSING_API_KEY') {
            message = 'Meu módulo de IA ainda não está configurado. Adicione sua OPENAI_API_KEY no arquivo .env do servidor.';
        } else if (location.protocol === 'file:') {
            message = 'Abra o Jarvis pelo servidor local usando npm start. Abrir o HTML diretamente não permite acessar a API.';
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
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        return { text: `Hoje é ${date}.` };
    }

    if (command.includes('quem e voce') || command.includes('qual seu nome') || command.includes('se apresente')) {
        return { text: 'Eu sou Jarvis, seu assistente pessoal em desenvolvimento, agora conectado a um módulo de inteligência artificial.' };
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
        if (error.name === 'AbortError') {
            throw new Error('a resposta demorou além do limite.');
        }
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
        try {
            recognition.stop();
        } catch (error) {
            console.warn(error);
        }
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.02;
    utterance.pitch = 0.92;

    const voices = window.speechSynthesis.getVoices();
    const brazilianVoice = voices.find((voice) => voice.lang?.toLowerCase() === 'pt-br');
    if (brazilianVoice) utterance.voice = brazilianVoice;

    utterance.onstart = () => setAssistantState('speaking');

    const finish = () => {
        const shouldRestart = restartAfterSpeech;
        restartAfterSpeech = false;

        if (shouldRestart) {
            setAssistantState('listening');
            setTimeout(startListening, 300);
        } else {
            setAssistantState('idle');
        }
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);

    if (targetPositions && particles) {
        const positions = particles.geometry.attributes.position.array;
        const smoothing = 1 - Math.pow(0.0008, delta);

        for (let i = 0; i < positions.length; i++) {
            positions[i] += (targetPositions[i] - positions[i]) * smoothing;
        }

        particles.geometry.attributes.position.needsUpdate = true;
    }

    if (currentShape === 'sphere') {
        particles.rotation.y += 0.22 * delta;
    }

    if (assistantState === 'listening') {
        const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.025;
        particles.scale.setScalar(pulse);
    } else if (assistantState === 'thinking') {
        const pulse = 1 + Math.sin(performance.now() * 0.009) * 0.018;
        particles.scale.setScalar(pulse);
    } else if (assistantState === 'speaking') {
        const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.04;
        particles.scale.setScalar(pulse);
    } else {
        const scale = particles.scale.x + (1 - particles.scale.x) * 0.08;
        particles.scale.setScalar(scale);
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
