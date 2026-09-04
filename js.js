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

const stateConfig = {
    idle: { label: 'Jarvis em espera', hue: 0.53, saturation: 0.72 },
    listening: { label: 'Ouvindo...', hue: 0.36, saturation: 0.82 },
    thinking: { label: 'Processando...', hue: 0.75, saturation: 0.78 },
    speaking: { label: 'Respondendo...', hue: 0.56, saturation: 0.88 },
    error: { label: 'Não consegui acessar o microfone', hue: 0.0, saturation: 0.82 }
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

    typeBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (text) {
            morphToText(text);
        }
    });

    micBtn.addEventListener('click', toggleListening);

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const text = input.value.trim();
            if (text) {
                morphToText(text);
            }
        }
    });
}

function setAssistantState(state) {
    assistantState = state;
    const config = stateConfig[state] || stateConfig.idle;
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const micBtn = document.getElementById('micBtn');

    if (statusText) statusText.textContent = config.label;
    if (statusDot) statusDot.dataset.state = state;
    if (micBtn) {
        micBtn.classList.toggle('active', state === 'listening');
        micBtn.setAttribute('aria-pressed', state === 'listening' ? 'true' : 'false');
    }

    if (particles) applyStateColors(state);
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
    const safeText = text.slice(0, 28);

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

function morphToText(text, returnDelay = 4000) {
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
        document.getElementById('statusText').textContent = 'Use Chrome ou Edge para comandos por voz';
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

        if (restartAfterSpeech) return;
        if (assistantState === 'listening') setAssistantState('idle');
    };

    recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;

        console.warn('Erro no reconhecimento de voz:', event.error);
        isListening = false;

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setAssistantState('error');
        } else if (!restartAfterSpeech) {
            setAssistantState('idle');
        }
    };

    recognition.onresult = (event) => {
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript.trim();

            if (event.results[i].isFinal) {
                document.getElementById('morphText').value = transcript;
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

    if (isListening) {
        restartAfterSpeech = false;
        recognition.stop();
        setAssistantState('idle');
        return;
    }

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
    const wakeIndex = normalized.indexOf('jarvis');

    if (wakeIndex !== -1) {
        const command = normalized.slice(wakeIndex + 'jarvis'.length).trim();
        morphToText('JARVIS', 2600);

        if (!command) {
            awaitingCommand = true;
            clearTimeout(awaitingCommandTimer);
            awaitingCommandTimer = setTimeout(() => {
                awaitingCommand = false;
            }, 8000);
            speak('Sim, estou ouvindo.');
            return;
        }

        awaitingCommand = false;
        processCommand(command);
        return;
    }

    if (awaitingCommand && normalized) {
        awaitingCommand = false;
        clearTimeout(awaitingCommandTimer);
        processCommand(normalized);
    }
}

function processCommand(command) {
    setAssistantState('thinking');
    morphToText(command.toUpperCase().slice(0, 18), 3400);

    const now = new Date();
    let response = '';

    if (command.includes('que horas') || command === 'horas' || command.includes('hora agora')) {
        const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        response = `Agora são ${time}.`;
    } else if (command.includes('que dia') || command.includes('data de hoje') || command.includes('qual a data')) {
        const date = now.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        response = `Hoje é ${date}.`;
    } else if (command.includes('quem e voce') || command.includes('qual seu nome') || command.includes('se apresente')) {
        response = 'Eu sou Jarvis, seu assistente em desenvolvimento.';
    } else if (command.includes('bom dia')) {
        response = 'Bom dia. Sistemas online e prontos para trabalhar.';
    } else if (command.includes('boa tarde')) {
        response = 'Boa tarde. Estou à disposição.';
    } else if (command.includes('boa noite')) {
        response = 'Boa noite. Estou à disposição.';
    } else if (command === 'ola' || command.includes('tudo bem')) {
        response = 'Olá. Tudo funcionando por aqui.';
    } else if (command.includes('parar de ouvir') || command.includes('desligar microfone')) {
        restartAfterSpeech = false;
        response = 'Certo. Vou desligar o microfone.';
        speak(response, false);
        return;
    } else {
        response = `Eu ouvi: ${command}. Esse comando ainda não está conectado à minha inteligência.`;
    }

    speak(response, true);
}

function speak(text, resumeListening = true) {
    if (!('speechSynthesis' in window)) {
        setAssistantState(isListening ? 'listening' : 'idle');
        return;
    }

    restartAfterSpeech = resumeListening && isListening;

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

    utterance.onstart = () => {
        setAssistantState('speaking');
    };

    utterance.onend = () => {
        const shouldRestart = restartAfterSpeech;
        restartAfterSpeech = false;

        if (shouldRestart) {
            setAssistantState('listening');
            setTimeout(startListening, 250);
        } else {
            setAssistantState('idle');
        }
    };

    utterance.onerror = () => {
        const shouldRestart = restartAfterSpeech;
        restartAfterSpeech = false;

        if (shouldRestart) {
            setAssistantState('listening');
            setTimeout(startListening, 250);
        } else {
            setAssistantState('idle');
        }
    };

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
    } else if (assistantState === 'speaking') {
        const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.04;
        particles.scale.setScalar(pulse);
    } else {
        particles.scale.lerp(new THREE.Vector3(1, 1, 1), 0.08);
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