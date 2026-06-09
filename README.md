<<<<<<< HEAD
# AVD Diagnostico Escolar

Plataforma JavaScript para GitHub Pages com banco Supabase, seguindo o mesmo metodo usado no aplicativo de inscricoes.

## Arquivos principais

- `index.html`: interface principal publicada no GitHub Pages.
- `supabase-config.js`: URL e chave publica do Supabase.
- `supabase-init.js`: camada de dados no Supabase.
- `public/app.js`: aplicacao AVD.
- `public/styles.css`: estilos.
- `supabase.sql`: criacao da tabela no Supabase.

## Configuracao Supabase

O arquivo `supabase-config.js` esta configurado com:

```text
SUPABASE_URL=https://aluuqvuwfywijqnxjyos.supabase.co
SUPABASE_ANON_KEY=sb_publishable_oA4CsQXsV4aVL0wJT3gxlw_iUFcGMEY
```

No Supabase, execute `supabase.sql` no SQL Editor para criar a tabela `avd_app_state` e liberar as politicas RLS usadas pelo GitHub Pages.

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

Exemplo:

```text
postgresql://postgres:SUA-SENHA@db.aluuqvuwfywijqnxjyos.supabase.co:5432/postgres
```

## Verificacao

```powershell
npm run check
```

## Acessos iniciais

- ADMINISTRADOR: `admin@semed.local` / `Admin@123`
- GESTOR SEMED: `gestor.semed@semed.local` / `Semed@123`
=======
# AVD Diagnostico Escolar

Plataforma JavaScript para GitHub Pages com banco Supabase, seguindo o mesmo metodo usado no aplicativo de inscricoes.

## Arquivos principais

- `index.html`: interface principal publicada no GitHub Pages.
- `supabase-config.js`: URL e chave publica do Supabase.
- `supabase-init.js`: camada de dados no Supabase.
- `public/app.js`: aplicacao AVD.
- `public/styles.css`: estilos.
- `supabase.sql`: criacao da tabela no Supabase.

## Configuracao Supabase

O arquivo `supabase-config.js` esta configurado com:

```text
SUPABASE_URL=https://itenlnlbiefrxteggjsh.supabase.co
SUPABASE_ANON_KEY=sb_publishable_CfQZEfvPeTARVyQvJ5Cd1g_wLbqc8lV
```

No Supabase, execute `supabase.sql` no SQL Editor para criar a tabela `avd_app_state` e liberar as politicas RLS usadas pelo GitHub Pages.

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

Exemplo:

```text
postgresql://postgres:SUA-SENHA@db.itenlnlbiefrxteggjsh.supabase.co:5432/postgres
```

## Verificacao

```powershell
npm run check
```

## Acessos iniciais

- ADMINISTRADOR: `admin@semed.local` / `Admin@123`
- GESTOR SEMED: `gestor.semed@semed.local` / `Semed@123`
>>>>>>> bf3b26d80e10ac2f39b07c883f4f0cce3ff87f54
