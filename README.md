# 🐷 FinançasBot — Organizador Financeiro para WhatsApp

Registre gastos e receitas pelo WhatsApp usando linguagem natural, com IA.

---

## 🚀 Como usar (exemplos)

| O que dizer | O que acontece |
|---|---|
| _"gastei 45 reais no mercado"_ | Registra despesa de R$45 em Alimentação |
| _"paguei 120 de luz"_ | Registra despesa de R$120 em Moradia |
| _"recebi 3000 de salário"_ | Registra receita de R$3.000 |
| _"quanto gastei esse mês?"_ | Mostra resumo completo do mês |
| _"ajuda"_ | Mostra todos os comandos |

---

## 🛠️ Configuração (passo a passo)

### 1. Clone e instale dependências
```bash
git clone <seu-repo>
cd financas-whatsapp
npm install
```

### 2. Configure as variáveis de ambiente
```bash
cp .env.example .env
# Edite o arquivo .env com suas credenciais
```

### 3. Configure o banco de dados (Railway recomendado)
1. Crie conta em [railway.app](https://railway.app)
2. Novo projeto → Add PostgreSQL
3. Copie a `DATABASE_URL` para o `.env`
```bash
npm run db:push  # Cria as tabelas
```

### 4. Configure a Evolution API (WhatsApp)
1. Acesse [evolution-api.com](https://evolution-api.com) ou self-host via Docker:
```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=minha-chave-secreta \
  atendai/evolution-api:latest
```
2. Acesse `http://localhost:8080` e crie uma instância
3. Escaneie o QR Code com seu WhatsApp
4. Configure o webhook apontando para sua URL:
   - `POST http://seu-servidor.com/webhook`

### 5. Obtenha a chave da API do Claude
1. Acesse [console.anthropic.com](https://console.anthropic.com)
2. Crie uma API Key
3. Adicione no `.env` como `ANTHROPIC_API_KEY`

### 6. Rode o servidor
```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

---

## ☁️ Deploy no Railway (recomendado)

1. Faça push do projeto para o GitHub
2. Acesse [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Adicione as variáveis de ambiente no painel do Railway
4. Railway gera uma URL pública automaticamente (use como webhook)

---

## 🗂️ Estrutura do Projeto

```
financas-whatsapp/
├── src/
│   ├── server.js      # Servidor Express
│   ├── webhook.js     # Recebe mensagens do WhatsApp
│   ├── ai.js          # Integração com Claude (interpreta mensagens)
│   ├── finance.js     # Salva transações e gera resumos
│   ├── whatsapp.js    # Envia mensagens via Evolution API
│   └── db.js          # Conexão com banco de dados
├── prisma/
│   └── schema.prisma  # Modelo do banco de dados
├── .env.example       # Template de variáveis de ambiente
└── package.json
```

---

## 💰 Custos estimados/mês

| Serviço | Custo |
|---|---|
| Railway (backend + DB) | ~$5 |
| Claude API | ~$1–5 |
| Evolution API (self-hosted) | Grátis |
| **Total** | **~$6–10/mês** |

---

## 🔮 Próximos passos (melhorias)

- [ ] Suporte a áudios (Whisper API)
- [ ] Relatório mensal em PDF
- [ ] Metas de gastos por categoria
- [ ] Multi-usuário com convite por link
- [ ] Dashboard web para visualizar gráficos
