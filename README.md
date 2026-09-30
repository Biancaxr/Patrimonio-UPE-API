# Patrimônio UPE API

API compartilhada pelo portal web e pelo aplicativo mobile. Centraliza PostgreSQL, Prisma, autenticação, regras de perfil e auditoria.

## Configuração

Copie `.env.example` para `.env` e configure:

- `DATABASE_URL`: conexão usada pela aplicação.
- `DIRECT_URL`: conexão direta usada pelas migrations, especialmente em Neon/Supabase.
- `JWT_SECRET`: chave aleatória com pelo menos 32 caracteres.
- `WEB_ORIGIN`: endereços permitidos do portal web, separados por vírgula.
- `PORT`: porta HTTP, normalmente definida automaticamente pela hospedagem.

- `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`: credenciais usadas somente pela seed inicial.

## Banco de dados

```bash
npm install
npm run db:generate
npm run db:deploy
```

O comando `npm run db:seed` fica reservado à inicialização manual de um banco vazio e não faz parte do fluxo de implantação. Como a VPS usa o mesmo banco do desenvolvimento, não o execute novamente.

Use `npm run db:migrate` somente no desenvolvimento. Em produção, use `npm run db:deploy`.

## Desenvolvimento

```bash
npm run dev
```

A API ficará disponível em `http://localhost:3333/api`. O endpoint de saúde é `/api/health`.

## Hospedagem

Configuração genérica para Render, Railway, Fly.io ou serviço Node equivalente:

- Pasta raiz: `Patrimonio UPE API`
- Build: `npm ci && npm run build`
- Pre-deploy/release: `npm run db:deploy`
- Start: `npm start`
- Health check: `/api/health`

### Docker na VPS

Crie um arquivo `.env.production` fora do repositório com as variáveis documentadas em `.env.example`. Depois:

```bash
docker build --target migrate -t patrimonio-api-migrate .
docker run --rm --env-file .env.production patrimonio-api-migrate

docker build -t patrimonio-api .
docker run -d \
  --name patrimonio-api \
  --restart unless-stopped \
  --env-file .env.production \
  -p 3333:3333 \
  patrimonio-api
```

As migrations rodam em uma imagem separada para que o contêiner público não carregue o CLI do Prisma nem dependências de desenvolvimento. Como a VPS utiliza o mesmo banco do desenvolvimento, não execute `db:seed`: os patrimônios, usuários e demais registros existentes serão preservados.

O contêiner da API possui health check em `/api/health` e o processo Node roda como usuário não-root. Publique a porta `3333` somente atrás de um proxy reverso HTTPS ou restrinja-a no firewall da VPS. Repita apenas o comando da imagem de migração antes de iniciar uma nova versão que contenha alterações no banco.

## Perfis

- `CONVIDADO`: sem autenticação; consulta pública e abertura de chamado.
- `ALUNO`: consulta de itens sem edição, execução completa de vistorias e abertura de chamado.
- `TI`: consulta de patrimônios eletrônicos, inventário e atendimento de chamados do seu escopo.
- `ADMINISTRACAO`: gestão operacional, sem administrar contas.
- `ADMIN`: acesso integral e gerenciamento de usuários.

## Validação

```bash
npm run typecheck
npm run build
npx prisma validate
```
