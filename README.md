# PROJETOTIPOJARVIS

Protótipo de assistente J.A.R.V.I.S. com partículas 3D, comandos por voz, resposta falada e integração com a API Gemini.

## O que já funciona

- Interface 3D com 12 mil partículas.
- Estados visuais: espera, ouvindo, pensando e respondendo.
- Reconhecimento de voz em português do Brasil no Chrome/Edge compatível.
- Resposta por voz usando Speech Synthesis do navegador.
- Comandos locais de hora, data e controle básico.
- Conversa com IA para perguntas que não são comandos locais.
- Histórico curto da conversa no navegador.
- Backend que mantém a chave do Gemini fora do frontend.
- Endpoint `/api/chat` compatível com execução local e deploy serverless na Vercel.
- Modelo padrão: `gemini-2.5-flash`.

## 1. Atualizar seu projeto local

No terminal do VS Code, dentro da pasta do projeto:

```bash
git pull origin main
```

## 2. Criar uma chave gratuita do Gemini

Crie uma chave no Google AI Studio e nunca coloque essa chave dentro do `index.html` ou `js.js`.

## 3. Configurar a chave da IA

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
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

Se você já tinha criado o `.env` para a OpenAI, não precisa apagar o arquivo: apenas substitua as variáveis antigas pelas variáveis `GEMINI_API_KEY` e `GEMINI_MODEL` acima.

> Nunca envie o arquivo `.env` para o GitHub. Ele já está incluído no `.gitignore`.

## 4. Rodar localmente

É necessário Node.js 20 ou superior.

```bash
npm start
```

O terminal deve mostrar:

```text
JARVIS online em http://localhost:3000
IA Gemini: configurada
```

Abra no navegador:

```text
http://localhost:3000
```

Não abra o `index.html` diretamente pelo explorador de arquivos, porque a chamada para `/api/chat` precisa do servidor.

## 5. Testar

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
ai-core.js       Integração segura com Gemini
api/chat.js      Endpoint serverless para a Vercel
server.js        Servidor para teste local
.env.example     Modelo das variáveis de ambiente
.gitignore       Proteção de arquivos locais/segredos
package.json     Scripts do projeto
```

## Deploy na Vercel

Ao importar o repositório na Vercel, configure `GEMINI_API_KEY` como variável de ambiente do projeto. Opcionalmente configure `GEMINI_MODEL`.

A chave deve existir somente como variável de ambiente no servidor e nunca dentro de `index.html` ou `js.js`.
