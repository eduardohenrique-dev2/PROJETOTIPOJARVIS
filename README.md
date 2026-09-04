# PROJETOTIPOJARVIS

Assistente J.A.R.V.I.S. com interface 3D, voz contínua, Gemini, interpretação natural de intenções e ações locais/remotas seguras no Windows.

## O que já funciona

- Interface principal com Black Hole em Three.js, bloom, lensing e campo estelar.
- Reconhecimento de voz em português do Brasil com modo persistente.
- Resposta falada usando Speech Synthesis.
- Conversa natural com Gemini 3.6 Flash.
- A IA pode identificar quando a fala é apenas conversa ou quando existe uma ação a executar.
- Ações estruturadas para sites, pesquisas e aplicativos permitidos.
- Histórico curto da conversa no navegador.
- Backend que mantém chaves e segredos fora do frontend.
- Servidor local limitado a `127.0.0.1`.
- Jarvis Agent para controle remoto seguro do PC através da versão hospedada.
- Indicador `PC LOCAL`, `PC ONLINE`, `PC OFFLINE` ou `PC NÃO CONFIG.` na interface.

## Uso local

Atualize o projeto:

```powershell
git pull origin main
```

Se ainda não existir `.env`:

```powershell
Copy-Item .env.example .env
```

Configure pelo menos:

```env
GEMINI_API_KEY=coloque_sua_chave_aqui
GEMINI_MODEL=gemini-3.6-flash
PORT=3000
```

Rode:

```powershell
npm start
```

Abra:

```text
http://localhost:3000
```

## Conversa natural

Não é necessário decorar comandos exatos. Exemplos:

```text
Jarvis, quero começar a programar.
Jarvis, abre onde eu vejo meus arquivos.
Jarvis, tô afim de ver uns vídeos sobre robótica.
Jarvis, pesquisa pra mim sobre ESP32.
Jarvis, o que você acha de usar um ESP32 nesse projeto?
```

A Gemini interpreta a intenção. Quando existir uma ação, ela retorna uma estrutura controlada; nenhum texto da IA é executado diretamente no terminal.

## Acesso remoto ao computador

Para controlar o PC pela interface hospedada, existe agora o `Jarvis Agent`.

O fluxo é:

```text
Celular → Vercel → HTTPS assinado → Tunnel → Jarvis Agent → Windows
```

No PC:

```powershell
npm run agent
```

O Agent usa uma lista fechada de capacidades e autenticação HMAC-SHA256. Ele não aceita shell arbitrário.

O passo a passo completo para configurar o segredo, Cloudflare Tunnel e variáveis da Vercel está em:

```text
REMOTE_AGENT.md
```

## Estrutura principal

```text
index.html              Interface do Jarvis
style.css               HUD e layout
script.js               Black Hole / Three.js
assistant-core.js       Voz, conversa e fluxo principal
actions.js              Execução de ações no frontend + status do PC
ai-core.js               Gemini e interpretação natural de ações
local-actions.js         Lista central de ações permitidas
agent.js                 Jarvis Agent que roda no computador
agent-protocol.js        Assinatura e validação HMAC
remote-agent-client.js   Cliente usado pela Vercel para acessar o Agent
api/chat.js              Endpoint Gemini na Vercel
api/action.js            Proxy seguro de ações remotas
api/agent-status.js      Status remoto do computador
server.js                Servidor local
REMOTE_AGENT.md          Guia de configuração do acesso remoto
.env.example             Modelo de variáveis de ambiente
```

## Segurança

- `.env` continua ignorado pelo Git.
- Chaves Gemini e segredo do Agent nunca devem ir para o frontend ou GitHub.
- O servidor local e o Agent escutam somente em localhost.
- Para acesso remoto, use um tunnel HTTPS; não faça port forwarding da porta do Agent.
- O Agent aceita apenas ações pré-definidas em `local-actions.js`.
- As chamadas remotas são assinadas e possuem timestamp curto para reduzir replay.

## Vercel

Configure na Vercel:

```env
GEMINI_API_KEY=SUA_CHAVE
GEMINI_MODEL=gemini-3.6-flash
JARVIS_AGENT_URL=https://SEU-TUNNEL-HTTPS
JARVIS_AGENT_SECRET=O_MESMO_SEGREDO_DO_PC
```

Se `JARVIS_AGENT_URL` e `JARVIS_AGENT_SECRET` não estiverem configurados, a conversa com a IA continua funcionando e a interface exibirá que o PC remoto ainda não está configurado.
