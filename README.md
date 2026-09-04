# PROJETOTIPOJARVIS

Protótipo de assistente J.A.R.V.I.S. com partículas 3D, comandos por voz, resposta falada, integração com Gemini e ações locais no Windows.

## O que já funciona

- Interface 3D com 12 mil partículas.
- Estados visuais: espera, ouvindo, pensando e respondendo.
- Reconhecimento de voz em português do Brasil no Chrome/Edge compatível.
- Resposta por voz usando Speech Synthesis do navegador.
- Comandos locais de hora e data.
- Conversa com IA para perguntas gerais.
- Histórico curto da conversa no navegador.
- Backend que mantém a chave do Gemini fora do frontend.
- Gemini Interactions API com `gemini-3.6-flash` e fallback configurado.
- Abertura de sites e pesquisas na web.
- Abertura de aplicativos permitidos no Windows quando executado localmente.
- Servidor local limitado a `127.0.0.1` para proteger os comandos do computador.

## 1. Atualizar seu projeto local

No terminal do VS Code, dentro da pasta do projeto:

```bash
git pull origin main
```

## 2. Configurar a chave do Gemini

Se ainda não existir um arquivo `.env`, copie `.env.example`.

No Prompt de Comando do Windows (CMD):

```cmd
copy .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Depois edite `.env`:

```env
GEMINI_API_KEY=coloque_sua_chave_aqui
GEMINI_MODEL=gemini-3.6-flash
PORT=3000
```

> Nunca envie o arquivo `.env` para o GitHub. Ele já está incluído no `.gitignore`.

## 3. Rodar localmente

É necessário Node.js 20 ou superior.

```bash
npm start
```

O terminal deve mostrar:

```text
JARVIS online em http://localhost:3000
IA Gemini: configurada
Ações locais: habilitadas somente neste computador
```

Abra no navegador:

```text
http://localhost:3000
```

## 4. Comandos para testar

### Conversa e comandos básicos

- `Jarvis, que horas são?`
- `Jarvis, qual a data de hoje?`
- `Jarvis, me explique o que é um CLP.`
- `Jarvis, crie uma ideia de projeto com ESP32.`

### Abrir sites

- `Jarvis, abra o YouTube.`
- `Jarvis, abra o Google.`
- `Jarvis, abra o GitHub.`
- `Jarvis, abra o Gmail.`
- `Jarvis, abra o WhatsApp.`
- `Jarvis, abra o Spotify.`
- `Jarvis, abra o Google Maps.`

### Pesquisar

- `Jarvis, pesquise ESP32 no Google.`
- `Jarvis, procure automação industrial na internet.`
- `Jarvis, pesquise ESP32 no YouTube.`
- `Jarvis, abra o YouTube e pesquise Arduino.`

### Abrir programas no Windows

- `Jarvis, abra a calculadora.`
- `Jarvis, abra o bloco de notas.`
- `Jarvis, abra o explorador de arquivos.`
- `Jarvis, abra o VS Code.`
- `Jarvis, abra o Paint.`
- `Jarvis, abra o gerenciador de tarefas.`

Os programas são executados por uma lista fechada no servidor. O Jarvis não aceita comandos arbitrários do sistema operacional.

## Estrutura

```text
index.html       Interface
Style.css        Estilo visual
js.js            Partículas, voz e lógica principal
actions.js       Interpretação e execução de ações
ai-core.js       Integração segura com Gemini Interactions API
api/chat.js      Endpoint serverless para conversa na Vercel
server.js        Servidor local, IA e ações do Windows
.env.example     Modelo das variáveis de ambiente
.gitignore       Proteção de arquivos locais/segredos
package.json     Scripts do projeto
```

## Deploy na Vercel

Ao importar o repositório na Vercel, configure `GEMINI_API_KEY` como variável de ambiente do projeto. Opcionalmente configure `GEMINI_MODEL=gemini-3.6-flash`.

Na versão hospedada, conversa com IA e abertura de links continuam possíveis. A abertura de aplicativos do Windows funciona somente com o servidor rodando localmente no computador, pois um site hospedado não deve controlar programas da máquina diretamente.
