(() => {
    const originalGetSystemResponse = window.getSystemResponse;

    function formatLocalTime() {
        return new Intl.DateTimeFormat('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date());
    }

    function formatLocalDate() {
        return new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        }).format(new Date());
    }

    function isTimeQuestion(command) {
        return /\bque horas\b|\bqual(?: e| seria)? a hora\b|\bhora agora\b|\bhorario agora\b|\bqual horario\b|\bme diga a hora\b|\bme fala a hora\b|\bsabe que horas\b/.test(command);
    }

    function isDateQuestion(command) {
        return /\bque dia\b|\bqual(?: e)? a data\b|\bdata de hoje\b|\bdia de hoje\b|\bhoje e que dia\b|\bqual dia e hoje\b/.test(command);
    }

    window.getSystemResponse = function enhancedSystemResponse(command) {
        const normalized = String(command || '').trim();

        if (isTimeQuestion(normalized)) {
            return { text: `Agora são ${formatLocalTime()}.` };
        }

        if (isDateQuestion(normalized)) {
            return { text: `Hoje é ${formatLocalDate()}.` };
        }

        return typeof originalGetSystemResponse === 'function'
            ? originalGetSystemResponse(normalized)
            : null;
    };
})();
