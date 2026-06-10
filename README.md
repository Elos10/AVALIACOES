# AVD Diagnostico Escolar

Plataforma JavaScript para GitHub Pages com banco Supabase, seguindo o mesmo metodo usado no aplicativo de inscricoes.

## Arquivos principais

- `index.html`: interface principal publicada no GitHub Pages.
- `supabase-config.js`: URL e chave publica do Supabase.
- `supabase-init.js`: camada REST de dados no Supabase.
- `public/app.js`: aplicacao AVD.
- `public/styles.css`: estilos.
- `supabase.sql`: criacao das tabelas no Supabase.

## Configuracao Supabase

O arquivo `supabase-config.js` esta configurado com:

```text
SUPABASE_URL=https://aluuqvuwfywijqnxjyos.supabase.co
SUPABASE_ANON_KEY=sb_publishable_oA4CsQXsV4aVL0wJT3gxlw_iUFcGMEY
```

No Supabase, execute `supabase.sql` no SQL Editor para criar as tabelas `avd_app_state` e `avd_records`, além das politicas RLS usadas pelo GitHub Pages.

A tabela `avd_records` guarda os registros importados em lotes. Ela evita erro de timeout ao importar planilhas grandes, pois os alunos deixam de ser gravados dentro de um unico campo JSON.

## GitHub Pages

O `index.html` carrega nesta ordem:

```html
<script type="module" src="./supabase-init.js"></script>
<script type="module" src="./public/app.js"></script>
```

O `supabase-init.js` expoe:

```js
window.AVD_DB_REQUEST
window.AVD_SUPABASE_CLIENT
```

O `public/app.js` usa `window.AVD_DB_REQUEST` para consultar e gravar os dados no Supabase.

## GitHub Actions

O workflow `.github/workflows/supabase-deploy.yml` valida a configuracao e aplica o schema.

Cadastre este secret no GitHub:

- `SUPABASE_DB_URL`

Use preferencialmente a string `Session pooler` do Supabase, porque o host direto `db.aluuqvuwfywijqnxjyos.supabase.co` pode usar IPv6 e falhar no GitHub Actions com `Network is unreachable`.

Formato recomendado:

```text
postgresql://postgres.aluuqvuwfywijqnxjyos:SUA-SENHA@HOST-POOLER-SUPABASE:5432/postgres?sslmode=require
```

Onde encontrar: Supabase > Project Settings > Database > Connection string > Session pooler.

Senha atual informada:

```text
DeticSemed2025
```

Se a senha tiver caracteres especiais, eles precisam estar codificados na URL. Exemplo: `@` deve virar `%40`.

## Verificacao

```powershell
npm run check
```

## Acessos iniciais

- ADMINISTRADOR: `admin@semed.local` / `Admin@123`
- GESTOR SEMED: `gestor.semed@semed.local` / `Semed@123`
