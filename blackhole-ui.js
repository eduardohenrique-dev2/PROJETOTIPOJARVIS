(() => {
    if (typeof THREE === 'undefined') return;

    let blackHoleGroup;
    let accretionDisk;
    let photonRing;
    let secondaryRing;
    let glowSprite;
    let stars;
    let animationFrame;

    const mouse = { x: 0, y: 0 };
    const targetMouse = { x: 0, y: 0 };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function initBlackHoleInterface() {
        if (typeof scene === 'undefined' || !scene) {
            setTimeout(initBlackHoleInterface, 80);
            return;
        }

        createStarField();
        createBlackHole();
        setupHud();
        setupQuickCommands();
        setupParallax();
        animateBlackHole();
    }

    function createBlackHole() {
        blackHoleGroup = new THREE.Group();
        blackHoleGroup.position.set(0, 0.25, -3.2);
        blackHoleGroup.rotation.x = 0.34;
        blackHoleGroup.rotation.z = -0.08;
        scene.add(blackHoleGroup);

        const coreGeometry = new THREE.SphereGeometry(4.25, 64, 64);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: false,
            depthWrite: true
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.renderOrder = 3;
        blackHoleGroup.add(core);

        const shadowGeometry = new THREE.SphereGeometry(4.62, 64, 64);
        const shadowMaterial = new THREE.MeshBasicMaterial({
            color: 0x020308,
            transparent: true,
            opacity: 0.74,
            blending: THREE.NormalBlending,
            side: THREE.BackSide
        });
        const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
        shadow.renderOrder = 2;
        blackHoleGroup.add(shadow);

        photonRing = new THREE.Mesh(
            new THREE.TorusGeometry(4.72, 0.085, 12, 256),
            new THREE.MeshBasicMaterial({
                color: 0xffd39a,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        photonRing.renderOrder = 4;
        blackHoleGroup.add(photonRing);

        secondaryRing = new THREE.Mesh(
            new THREE.TorusGeometry(5.02, 0.035, 8, 256),
            new THREE.MeshBasicMaterial({
                color: 0x63e8ff,
                transparent: true,
                opacity: 0.42,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        secondaryRing.renderOrder = 4;
        blackHoleGroup.add(secondaryRing);

        accretionDisk = createAccretionDisk();
        blackHoleGroup.add(accretionDisk);

        glowSprite = createGlowSprite();
        glowSprite.scale.set(21, 21, 1);
        glowSprite.position.z = -1.2;
        glowSprite.renderOrder = 0;
        blackHoleGroup.add(glowSprite);

        const halo = new THREE.Mesh(
            new THREE.RingGeometry(5.1, 8.8, 160),
            new THREE.MeshBasicMaterial({
                color: 0x2a65ff,
                transparent: true,
                opacity: 0.055,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        halo.scale.y = 0.42;
        halo.renderOrder = 0;
        blackHoleGroup.add(halo);
    }

    function createAccretionDisk() {
        const count = window.innerWidth < 720 ? 3600 : 6800;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const color = new THREE.Color();

        for (let i = 0; i < count; i++) {
            const t = Math.pow(Math.random(), 0.62);
            const radius = 5.05 + t * 9.5;
            const angle = Math.random() * Math.PI * 2;
            const turbulence = (Math.random() - 0.5) * (0.12 + t * 0.55);

            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = Math.sin(angle) * radius * 0.24 + turbulence;
            positions[i * 3 + 2] = (Math.random() - 0.5) * (0.18 + t * 0.48);

            const hotSide = (Math.cos(angle) + 1) * 0.5;
            if (t < 0.24) {
                color.setRGB(1.0, 0.78 + hotSide * 0.16, 0.52 + hotSide * 0.28);
            } else if (hotSide > 0.54) {
                color.setRGB(0.95, 0.34 + (1 - t) * 0.28, 0.13 + (1 - t) * 0.22);
            } else {
                color.setRGB(0.18 + (1 - t) * 0.28, 0.44 + (1 - t) * 0.34, 0.95);
            }

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            sizes[i] = 0.035 + Math.random() * 0.075;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.075,
            vertexColors: true,
            transparent: true,
            opacity: 0.84,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        const disk = new THREE.Points(geometry, material);
        disk.renderOrder = 1;
        return disk;
    }

    function createStarField() {
        const count = window.innerWidth < 720 ? 1100 : 2600;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color();

        for (let i = 0; i < count; i++) {
            const radius = 38 + Math.random() * 86;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = -18 - Math.abs(radius * Math.cos(phi));

            const cool = Math.random() > 0.74;
            if (cool) color.setRGB(0.46, 0.78, 1.0);
            else color.setRGB(0.72 + Math.random() * 0.28, 0.72 + Math.random() * 0.2, 0.74 + Math.random() * 0.26);

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.115,
            vertexColors: true,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        stars = new THREE.Points(geometry, material);
        stars.renderOrder = -2;
        scene.add(stars);
    }

    function createGlowSprite() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(256, 256, 48, 256, 256, 256);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.22, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.33, 'rgba(255,190,115,0.25)');
        gradient.addColorStop(0.48, 'rgba(91,171,255,0.13)');
        gradient.addColorStop(0.72, 'rgba(70,86,255,0.055)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        return new THREE.Sprite(material);
    }

    function setupHud() {
        const clock = document.getElementById('hudClock');
        const hudState = document.getElementById('hudState');
        const hudAi = document.getElementById('hudAi');
        const coreReadout = document.getElementById('coreReadout');

        function sync() {
            const now = new Date();
            if (clock) {
                clock.textContent = now.toLocaleTimeString('pt-BR', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
            }

            const statusText = document.getElementById('statusText');
            const aiMode = document.getElementById('aiMode');
            if (hudState && statusText) hudState.textContent = statusText.textContent;
            if (hudAi && aiMode) hudAi.textContent = aiMode.textContent;

            const state = document.getElementById('statusDot')?.dataset.state || 'idle';
            document.body.dataset.jarvisState = state;
            if (coreReadout) coreReadout.textContent = stateLabel(state);
        }

        sync();
        setInterval(sync, 500);
    }

    function stateLabel(state) {
        const labels = {
            idle: 'CORE STABLE',
            listening: 'AUDIO LINK',
            thinking: 'NEURAL COMPUTE',
            speaking: 'VOICE OUTPUT',
            error: 'CORE ALERT'
        };
        return labels[state] || 'CORE STABLE';
    }

    function setupQuickCommands() {
        document.querySelectorAll('[data-jarvis-command]').forEach((button) => {
            button.addEventListener('click', () => {
                const command = button.dataset.jarvisCommand;
                const input = document.getElementById('morphText');
                if (!command || !input) return;

                input.value = command;
                input.focus();

                if (typeof window.processCommand === 'function') {
                    input.value = '';
                    window.processCommand(command, false);
                } else {
                    document.getElementById('typeBtn')?.click();
                }
            });
        });
    }

    function setupParallax() {
        window.addEventListener('pointermove', (event) => {
            targetMouse.x = (event.clientX / window.innerWidth - 0.5) * 2;
            targetMouse.y = (event.clientY / window.innerHeight - 0.5) * 2;
            document.documentElement.style.setProperty('--pointer-x', `${targetMouse.x * 10}px`);
            document.documentElement.style.setProperty('--pointer-y', `${targetMouse.y * 8}px`);
        }, { passive: true });
    }

    function animateBlackHole() {
        animationFrame = requestAnimationFrame(animateBlackHole);
        if (!blackHoleGroup) return;

        mouse.x += (targetMouse.x - mouse.x) * 0.025;
        mouse.y += (targetMouse.y - mouse.y) * 0.025;

        const time = performance.now() * 0.001;
        const state = document.getElementById('statusDot')?.dataset.state || 'idle';
        const activity = state === 'thinking' ? 1.7 : state === 'speaking' ? 1.45 : state === 'listening' ? 1.25 : 1;

        if (!reducedMotion) {
            accretionDisk.rotation.z -= 0.0019 * activity;
            photonRing.rotation.z += 0.0012 * activity;
            secondaryRing.rotation.z -= 0.0008 * activity;
            stars.rotation.y += 0.000025;

            blackHoleGroup.rotation.y = mouse.x * 0.055;
            blackHoleGroup.rotation.x = 0.34 + mouse.y * 0.038;
            blackHoleGroup.position.x = mouse.x * 0.22;
            blackHoleGroup.position.y = 0.25 - mouse.y * 0.14;

            const pulse = 1 + Math.sin(time * (state === 'speaking' ? 6.8 : 2.4)) * 0.012 * activity;
            photonRing.scale.setScalar(pulse);
            secondaryRing.scale.setScalar(1 + (pulse - 1) * 1.8);
            glowSprite.material.opacity = 0.68 + Math.sin(time * 1.7) * 0.08 + (activity - 1) * 0.1;
        }
    }

    window.addEventListener('beforeunload', () => cancelAnimationFrame(animationFrame));

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBlackHoleInterface, { once: true });
    } else {
        initBlackHoleInterface();
    }
})();