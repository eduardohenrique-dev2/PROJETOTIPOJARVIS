# Jarvis Agent — acesso remoto seguro ao PC

Esta arquitetura permite usar a interface hospedada na Vercel e executar ações permitidas no seu computador quando ele estiver ligado e com o Jarvis Agent rodando.

Fluxo:

```text
Celular / navegador
        ↓ HTTPS
      Vercel
        ↓ HTTPS + assinatura HMAC
  Cloudflare Tunnel
        ↓ localhost
   Jarvis Agent
        ↓
  ações permitidas no Windows
```

O Agent não aceita shell arbitrário. Ele executa somente as ações definidas em `local-actions.js`.

## 1. Atualizar o projeto

```powershell
git pull origin main
```

## 2. Criar um segredo forte

No PowerShell, dentro da pasta do projeto:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o valor gerado e coloque no `.env`:

```env
JARVIS_AGENT_SECRET=COLE_AQUI_O_SEGREDO_GERADO
AGENT_PORT=8787
```

Esse mesmo segredo será configurado depois na Vercel. Nunca coloque esse valor no GitHub.

## 3. Iniciar o Agent no PC

Abra um segundo terminal e execute:

```powershell
npm run agent
```

Saída esperada:

```text
Jarvis Agent online em http://127.0.0.1:8787
Aguardando conexão segura da interface hospedada...
```

O Agent escuta somente em `127.0.0.1`. Não abra a porta 8787 no roteador.

## 4. Criar um tunnel HTTPS

Para o primeiro teste, instale o `cloudflared` e execute:

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

O Cloudflare mostrará uma URL semelhante a:

```text
https://algum-nome.trycloudflare.com
```

Copie essa URL. Um Quick Tunnel muda de endereço quando é reiniciado, por isso ele é indicado somente para validação. Depois podemos configurar um Named Tunnel com endereço fixo.

## 5. Configurar a Vercel

Nas variáveis de ambiente do projeto na Vercel, adicione:

```env
GEMINI_API_KEY=SUA_CHAVE_GEMINI
GEMINI_MODEL=gemini-3.6-flash
JARVIS_AGENT_URL=https://algum-nome.trycloudflare.com
JARVIS_AGENT_SECRET=O_MESMO_SEGREDO_DO_PC
```

Depois faça um novo deploy.

## 6. Validar pelo celular

Abra a versão hospedada. No topo da interface deve aparecer:

```text
PC ONLINE
```

Se o Agent ou o tunnel estiver desligado, aparecerá:

```text
PC OFFLINE
```

Se as variáveis remotas ainda não estiverem configuradas:

```text
PC NÃO CONFIG.
```

Com o PC online, experimente frases naturais como:

```text
Jarvis, quero começar a programar.
Jarvis, abre onde eu vejo meus arquivos.
Jarvis, quero ver uns vídeos sobre ESP32.
```

A Gemini interpreta a intenção e envia somente uma ação estruturada para o Agent.

## Segurança

- O Agent fica ligado apenas no localhost.
- A Vercel e o Agent compartilham um segredo que nunca vai para o frontend.
- Cada requisição é assinada com HMAC-SHA256 e timestamp.
- Assinaturas antigas expiram em aproximadamente 30 segundos, reduzindo risco de replay.
- Existe limite simples de ações por minuto no Agent.
- O Agent possui lista fechada de aplicativos, sites e mecanismos de busca.
- Nenhum texto retornado pela IA é executado diretamente como comando de terminal.

Para uso permanente, prefira um Cloudflare Named Tunnel com hostname fixo e mantenha `JARVIS_AGENT_SECRET` longo e exclusivo.
