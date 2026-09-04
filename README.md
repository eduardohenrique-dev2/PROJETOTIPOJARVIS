# PROJETOTIPOJARVIS

Protótipo de assistente J.A.R.V.I.S. com partículas 3D, comandos por voz, resposta falada e integração com a OpenAI Responses API.

## O que já funciona

- Interface 3D com 12 mil partículas.
- Estados visuais: espera, ouvindo, pensando e respondendo.
- Reconhecimento de voz em português do Brasil no Chrome/Edge compatível.
- Resposta por voz usando Speech Synthesis do navegador.
- Comandos locais de hora, data e controle básico.
- Conversa com IA para perguntas que não são comandos locais.
- Histórico curto da conversa no navegador.
- Backend que mantém a chave da OpenAI fora do frontend.
- Endpoint `/api/chat` compatível com execução local e deploy serverless na Vercel.

## 1. Atualizar seu projeto local

No terminal do VS Code, dentro da pasta do projeto:

```bash
git pull origin main
```

## 2. Configurar a chave da IA

Copie o arquivo `.env.example` para um novo arquivo chamado `.env`.

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Depois edite `.env`:

```env
OPENAI_API_KEY=coloque_sua_chave_aqui
OPENAI_MODEL=gpt-5.6-luna
PORT=3000
```

> Nunca envie o arquivo `.env` para o GitHub. Ele já está incluído no `.gitignore`.

## 3. Rodar localmente

É necessário Node.js 20 ou superior.

```bash
npm start
```

Abra no navegador:

```text
http://localhost:3000
```

Não abra o `index.html` diretamente pelo explorador de arquivos, porque a chamada para `/api/chat` precisa do servidor.

## 4. Testar

Clique no microfone, permita o acesso e experimente:

- `Jarvis`
- `Jarvis, que horas são?`
- `Jarvis, me explique o que é um CLP.`
- `Jarvis, crie uma ideia de projeto com ESP32.`

Também é possível digitar a pergunta na caixa inferior e pressionar Enter.

## Estrutura

```text
index.html       Interface
Style.css        Estilo visual
js.js            Partículas, voz e lógica do frontend
ai-core.js       Integração segura com a OpenAI
api/chat.js      Endpoint serverless para a Vercel
server.js        Servidor para teste local
.env.example     Modelo das variáveis de ambiente
.gitignore       Proteção de arquivos locais/segredos
package.json     Scripts do projeto
```

## Deploy na Vercel

Ao importar o repositório na Vercel, configure `OPENAI_API_KEY` como variável de ambiente do projeto. Opcionalmente configure `OPENAI_MODEL`.

A chave deve existir somente como variável de ambiente no servidor e nunca dentro de `index.html` ou `js.js`.
