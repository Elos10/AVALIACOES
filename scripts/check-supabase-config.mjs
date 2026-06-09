import fs from 'node:fs';

for (const file of ['index.html', 'public/app.js', 'supabase-init.js', 'supabase-config.js', 'supabase.sql']) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatorio ausente: ${file}`);
}

const index = fs.readFileSync('index.html', 'utf8');
const init = fs.readFileSync('supabase-init.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const sql = fs.readFileSync('supabase.sql', 'utf8');

if (!index.includes('./supabase-init.js') || !index.includes('./public/app.js')) {
  throw new Error('index.html deve carregar supabase-init.js antes de public/app.js');
}
if (!init.includes('createClient') || !init.includes('avd_app_state') || !init.includes('AVD_DB_REQUEST')) {
  throw new Error('supabase-init.js deve conectar ao Supabase e expor AVD_DB_REQUEST');
}
if (!app.includes('AVD_DB_REQUEST')) {
  throw new Error('public/app.js deve consumir AVD_DB_REQUEST');
}
if (!sql.includes('create table if not exists public.avd_app_state')) {
  throw new Error('supabase.sql deve criar public.avd_app_state');
}

console.log('GitHub Pages + Supabase config OK');
