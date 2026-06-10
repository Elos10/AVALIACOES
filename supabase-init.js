import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('PREENCHA')) {
  throw new Error('Configuração do Supabase ausente.');
}

const TABLE = 'avd_app_state';
const RECORDS_TABLE = 'avd_records';
const DB_ID = 'db';
const REST_URL = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
const importPreviewCache = new Map();
const roles = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  GESTOR_SEMED: 'GESTOR SEMED',
  GESTOR_UNIDADE: 'GESTOR UNIDADE',
};
const screens = ['dashboard', 'analise', 'bncc', 'habilidadesAplicadas', 'admin', 'importacoes', 'relatorios', 'qualidade', 'comparativo'];
const filterMap = {
  avaliacao: 'AVALIACAO',
  unidade: 'UNIDADE',
  ano: 'ANO',
  turma: 'TURMA',
  disciplina: 'DISCIPLINA',
  aluno: 'NOME',
  nivel: 'NIVEL',
  raca: 'RAÇA',
  inclusao: 'INCLUSÃO',
};
const filterOrder = ['avaliacao', 'unidade', 'ano', 'turma', 'disciplina', 'aluno', 'nivel', 'raca', 'inclusao'];

function seed() {
  const now = new Date().toISOString();
  const permissions = Object.fromEntries(Object.values(roles).map((role) => [role, Object.fromEntries(screens.map((screen) => [screen, true]))]));
  permissions[roles.GESTOR_SEMED].admin = false;
  permissions[roles.GESTOR_SEMED].importacoes = false;
  permissions[roles.GESTOR_UNIDADE].admin = false;
  permissions[roles.GESTOR_UNIDADE].importacoes = false;
  permissions[roles.GESTOR_UNIDADE].comparativo = false;
  permissions[roles.GESTOR_UNIDADE].analise = false;
  return {
    version: 2,
    users: [
      { id: id('usr_'), unidadeEscolar: 'SEMED', email: 'admin@semed.local', senha: 'admin123', perfil: roles.ADMINISTRADOR, ativo: true, criadoEm: now, atualizadoEm: now },
      { id: id('usr_'), unidadeEscolar: 'SEMED', email: 'gestor.semed@semed.local', senha: 'Semed@123', perfil: roles.GESTOR_SEMED, ativo: true, criadoEm: now, atualizadoEm: now },
    ],
    permissions,
    records: [],
    importPreviews: [],
    habilidadesAplicadas: [],
    imports: [],
    logs: [],
    refreshTokens: [],
  };
}

function id(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function ensureDb(value) {
  const base = seed();
  const db = value && typeof value === 'object' ? value : {};
  let changed = !value || typeof value !== 'object';
  for (const [key, val] of Object.entries(base)) {
    if (Array.isArray(val) && !Array.isArray(db[key])) {
      db[key] = val;
      changed = true;
    } else if (!Array.isArray(val) && (!db[key] || typeof db[key] !== 'object')) {
      db[key] = val;
      changed = true;
    }
  }
  db.permissions ||= base.permissions;
  for (const role of Object.values(roles)) {
    db.permissions[role] ||= {};
    for (const screen of screens) {
      if (!(screen in db.permissions[role])) {
        db.permissions[role][screen] = true;
        changed = true;
      }
    }
  }
  for (const admin of base.users) {
    const existing = db.users.find((user) => normalizeEmail(user.email) === admin.email);
    if (!existing) {
      db.users.push(admin);
      changed = true;
    } else if (!existing.senha && !existing.senhaHash) {
      existing.senha = admin.senha;
      changed = true;
    } else if (admin.email === 'admin@semed.local' && existing.senha === 'Admin@123') {
      existing.senha = 'admin123';
      existing.atualizadoEm = new Date().toISOString();
      changed = true;
    }
  }
  return { db, changed };
}

function supabaseError(error) {
  const message = error?.message || String(error || '');
  if (message.includes('Failed to fetch') || error instanceof TypeError) {
    return { status: 503, error: 'Não foi possível acessar o Supabase.', detail: `Falha de conexão com ${SUPABASE_URL}. Confira se o projeto está ativo e se o supabase.sql foi executado.` };
  }
  return { status: 500, error: 'Falha ao acessar Supabase.', detail: message };
}

async function supabaseRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${REST_URL}${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw supabaseError(error);
  }
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw {
      status: response.status,
      error: payload?.message || payload?.error || 'Falha ao acessar Supabase.',
      detail: payload?.details || payload?.hint || text,
    };
  }
  return payload;
}

async function readDb() {
  const rows = await supabaseRequest(`/${TABLE}?select=value&id=eq.${encodeURIComponent(DB_ID)}&limit=1`);
  const data = Array.isArray(rows) ? rows[0] : null;
  const normalized = ensureDb(data?.value || seed());
  if (!data || normalized.changed) await writeDb(normalized.db);
  try {
    normalized.db.records = await readRecords();
    normalized.db.recordsExternal = true;
    delete normalized.db.recordsSetupError;
  } catch (error) {
    if (!isMissingRecordsTable(error)) throw error;
    normalized.db.records = Array.isArray(normalized.db.records) ? normalized.db.records : [];
    normalized.db.recordsExternal = false;
    normalized.db.recordsSetupError = 'Execute o supabase.sql atualizado no Supabase para criar a tabela avd_records antes de importar planilhas.';
  }
  return normalized.db;
}

async function writeDb(db) {
  const normalized = ensureDb(db);
  const stateDb = { ...normalized.db, records: [], importPreviews: [] };
  await supabaseRequest(`/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: DB_ID, value: stateDb, updated_at: new Date().toISOString() }),
  });
  return { ...normalized.db, records: db.records || [] };
}

function isMissingRecordsTable(error) {
  const text = `${error?.error || ''} ${error?.detail || ''} ${error?.message || ''}`;
  return error?.status === 404 || text.includes(RECORDS_TABLE) || text.includes('schema cache');
}

async function readRecords() {
  const records = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let rows;
    try {
      rows = await supabaseRequest(`/${RECORDS_TABLE}?select=id,importacao_id,duplicate_key,data&order=id.asc&limit=${pageSize}&offset=${offset}`);
    } catch (error) {
      if (isMissingRecordsTable(error)) {
        throw { status: 500, error: 'Tabela de registros não encontrada.', detail: 'Execute o supabase.sql atualizado no Supabase para criar a tabela avd_records antes de importar planilhas.' };
      }
      throw error;
    }
    for (const row of rows || []) {
      records.push({ ...(row.data || {}), id: row.id, importacaoId: row.importacao_id });
    }
    if (!rows || rows.length < pageSize) break;
  }
  return records;
}

async function upsertRecords(rows) {
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize).map((row) => ({
      id: row.id,
      importacao_id: row.importacaoId,
      duplicate_key: duplicateKey(row),
      data: row,
      updated_at: new Date().toISOString(),
    }));
    try {
      await supabaseRequest(`/${RECORDS_TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      });
    } catch (error) {
      if (isMissingRecordsTable(error)) {
        throw { status: 500, error: 'Tabela de registros não encontrada.', detail: 'Execute o supabase.sql atualizado no Supabase para criar a tabela avd_records antes de importar planilhas.' };
      }
      throw error;
    }
  }
}

async function deleteRecordsByImport(importId) {
  try {
    await supabaseRequest(`/${RECORDS_TABLE}?importacao_id=eq.${encodeURIComponent(importId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  } catch (error) {
    if (isMissingRecordsTable(error)) return;
    throw error;
  }
}

function parseToken(token) {
  const value = String(token || '');
  if (value.startsWith('avd:')) return value.split(':')[1] || null;
  const legacy = value.match(/^avd-(.+)-\d+$/);
  return legacy?.[1] || null;
}

function currentUser(db, token) {
  const userId = parseToken(token);
  return db.users.find((user) => user.id === userId && user.ativo) || null;
}

function publicUser(user) {
  const { senha, senhaHash, password, ...safe } = user;
  return safe;
}

function log(db, user, acao, detalhes = {}) {
  db.logs.unshift({ id: id('log_'), usuarioId: user?.id || null, usuarioEmail: user?.email || null, acao, detalhes, criadoEm: new Date().toISOString() });
  db.logs = db.logs.slice(0, 5000);
}

function canSee(db, user, screen) {
  return Boolean(user?.ativo) && db.permissions?.[user.perfil]?.[screen] !== false;
}

function recordsForUser(db, user) {
  if (user.perfil === roles.GESTOR_UNIDADE) {
    const email = normalizeEmail(user.email);
    return db.records.filter((row) => normalizeEmail(row.EMAIL) === email);
  }
  return db.records || [];
}

function applyFilters(records, filters = {}) {
  return records.filter((row) => Object.entries(filterMap).every(([key, field]) => {
    const value = filters[key];
    if (!value || (Array.isArray(value) && !value.length)) return true;
    const values = Array.isArray(value) ? value.map(String) : [String(value)];
    return values.includes(String(row[field] ?? ''));
  }));
}

function filteredRecords(db, user, filters = {}) {
  return applyFilters(recordsForUser(db, user), filters);
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
}

function optionsFor(db, user, filters = {}) {
  const source = recordsForUser(db, user);
  const options = {};
  for (const key of filterOrder) {
    const scoped = applyFilters(source, parentFilters(filters, key));
    options[key] = unique(scoped.map((row) => row[filterMap[key]]));
  }
  return { options, total: applyFilters(source, filters).length };
}

function parentFilters(filters, key) {
  const result = {};
  for (const item of filterOrder) {
    if (item === key) break;
    if (filters[item]) result[item] = filters[item];
  }
  return result;
}

function dashboard(records) {
  const total = records.length;
  const pontos = sum(records, 'PONTOS');
  const possiveis = sum(records, 'PONTOS POSSIVEIS');
  const percentual = possiveis ? round((pontos / possiveis) * 100) : 0;
  return {
    kpis: { totalAlunos: total, pontosPossiveis: possiveis, acertos: pontos, percentualAcertos: percentual },
    alunosPorNivel: groupCount(records, 'NIVEL'),
    desempenhoPorQuestao: questionPerformance(records),
    distribuicaoPercentualNivel: groupCount(records, 'NIVEL').map((item) => ({ ...item, value: total ? round((item.value / total) * 100) : 0 })),
    rankingUnidades: ranking(records, 'UNIDADE'),
    rankingTurmas: ranking(records, 'TURMA'),
  };
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function round(value, digits = 1) {
  return Math.round(Number(value || 0) * 10 ** digits) / 10 ** digits;
}

function groupCount(rows, field) {
  const map = new Map();
  for (const row of rows) map.set(row[field] || 'Não informado', (map.get(row[field] || 'Não informado') || 0) + 1);
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

function ranking(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const key = row[field] || 'Não informado';
    const item = map.get(key) || { label: key, alunos: 0, pontos: 0, possiveis: 0 };
    item.alunos += 1;
    item.pontos += Number(row.PONTOS || 0);
    item.possiveis += Number(row['PONTOS POSSIVEIS'] || 0);
    map.set(key, item);
  }
  return [...map.values()].map((item) => ({ ...item, percentual: item.possiveis ? round((item.pontos / item.possiveis) * 100) : 0 })).sort((a, b) => b.percentual - a.percentual);
}

function questionPerformance(records) {
  return Array.from({ length: 20 }, (_, index) => {
    const q = `Q${index + 1}`;
    const pt = `PT_Q${index + 1}`;
    const avaliados = records.filter((row) => row[q] !== undefined && row[q] !== '').length;
    const acertos = sum(records, pt);
    return { label: q, questao: q, avaliados, acertos, percentual: avaliados ? round((acertos / avaliados) * 100) : 0 };
  });
}

function tableRows(records, limit = 500) {
  const groups = new Map();
  for (const row of records) {
    const key = [row.UNIDADE, row.TURMA, row.ANO, row.DISCIPLINA, row.NIVEL].join('|');
    const item = groups.get(key) || { unidade: row.UNIDADE, turma: row.TURMA, ano: row.ANO, disciplina: row.DISCIPLINA, nivel: row.NIVEL, alunos: 0, pontos: 0, pontosPossiveis: 0, percentual: 0 };
    item.alunos += 1;
    item.pontos += Number(row.PONTOS || 0);
    item.pontosPossiveis += Number(row['PONTOS POSSIVEIS'] || 0);
    item.percentual = item.pontosPossiveis ? round((item.pontos / item.pontosPossiveis) * 100) : 0;
    groups.set(key, item);
  }
  return [...groups.values()].slice(0, limit);
}

function diagnosticAnalysis(records) {
  const weak = questionPerformance(records).filter((item) => item.avaliados).sort((a, b) => a.percentual - b.percentual).slice(0, 5);
  return {
    resumo: dashboard(records).kpis,
    recomendacoes: weak.map((item) => ({ titulo: `${item.questao} - ${item.percentual}%`, texto: `Priorizar retomada pedagogica da ${item.questao}, analisando descritores, distratores e padroes de erro.` })),
    pontosAbordar: weak,
  };
}

function statisticalAnalysis(records) {
  const scores = records.map((row) => Number(row['% ACERTOS'] || 0) * 100).filter(Number.isFinite);
  const sorted = [...scores].sort((a, b) => a - b);
  const media = scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const mediana = sorted.length ? round(sorted[Math.floor(sorted.length / 2)]) : 0;
  const variance = scores.length ? scores.reduce((acc, value) => acc + (value - media) ** 2, 0) / scores.length : 0;
  return { resumo: { mediaPercentual: media, medianaPercentual: mediana, desvioPadraoPercentual: round(Math.sqrt(variance)) }, distribuicaoNivel: groupCount(records, 'NIVEL'), questoes: questionPerformance(records) };
}

function comparisonByEvaluation(records, evaluations = []) {
  const selected = evaluations.length ? evaluations : unique(records.map((row) => row.AVALIACAO));
  const units = unique(records.map((row) => row.UNIDADE));
  return {
    evaluations: selected,
    rows: units.map((unit) => {
      const row = { unidade: unit };
      for (const evaluation of selected) {
        const scoped = records.filter((item) => item.UNIDADE === unit && item.AVALIACAO === evaluation);
        const possiveis = sum(scoped, 'PONTOS POSSIVEIS');
        row[evaluation] = { percentual: possiveis ? round((sum(scoped, 'PONTOS') / possiveis) * 100) : 0, alunos: scoped.length };
      }
      return row;
    }),
  };
}

function quality(records) {
  const fields = ['ANO', 'DISCIPLINA', 'UNIDADE', 'TURMA', 'NOME', 'PONTOS', 'PONTOS POSSIVEIS', '% ACERTOS', 'NIVEL', 'AVALIACAO', 'EMAIL'];
  return { total: records.length, duplicates: 0, emptyByField: Object.fromEntries(fields.map((field) => [field, records.filter((row) => !row[field]).length])) };
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function canonicalHeader(header) {
  const normalized = normalizeHeader(header);
  const aliases = {
    AVALIACAO: 'AVALIACAO',
    'AVALIACAO DIAGNOSTICA': 'AVALIACAO',
    UNIDADE: 'UNIDADE',
    'UNIDADE ESCOLAR': 'UNIDADE',
    ESCOLA: 'UNIDADE',
    ANO: 'ANO',
    TURMA: 'TURMA',
    DISCIPLINA: 'DISCIPLINA',
    ALUNO: 'NOME',
    NOME: 'NOME',
    'NOME DO ALUNO': 'NOME',
    NIVEL: 'NIVEL',
    RACA: 'RAÇA',
    EMAIL: 'EMAIL',
    INCLUSAO: 'INCLUSÃO',
    PONTOS: 'PONTOS',
    'PONTOS POSSIVEIS': 'PONTOS POSSIVEIS',
    '% ACERTOS': '% ACERTOS',
    PERCENTUAL: '% ACERTOS',
    'PERCENTUAL DE ACERTOS': '% ACERTOS',
  };
  if (/^Q\d{1,2}$/.test(normalized)) return normalized;
  if (/^PT[_ ]?Q\d{1,2}$/.test(normalized)) return normalized.replace(' ', '_').replace(/^PTQ/, 'PT_Q');
  return aliases[normalized] || normalized;
}

function trimAfterRaca(headers) {
  const index = headers.findIndex((header) => normalizeHeader(header) === 'RACA');
  if (index < 0) return { kept: headers, ignored: [] };
  return { kept: headers.slice(0, index + 1), ignored: headers.slice(index + 1) };
}

async function readExcelFile(file) {
  if (!file) throw { status: 400, error: 'Selecione uma planilha Excel.' };
  let XLSX;
  try {
    XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  } catch {
    throw { status: 503, error: 'Não foi possível carregar o leitor de Excel. Verifique a conexão com a internet e tente novamente.' };
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw { status: 400, error: 'A planilha não possui abas para leitura.' };
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const originalHeaders = (matrix[0] || []).map((header) => String(header || '').trim());
  const { kept, ignored } = trimAfterRaca(originalHeaders);
  const headers = kept.map(canonicalHeader);
  const rows = matrix.slice(1)
    .map((line) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell(line[index])])))
    .filter((row) => Object.values(row).some((value) => String(value || '').trim() !== ''))
    .map(normalizeRecord);
  return { originalHeaders: kept, headers, rows, ignoredColumnsAfterRaca: ignored };
}

function normalizeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? value : Number(value.toFixed(4));
  return String(value).trim();
}

function normalizeRecord(row) {
  const record = { ...row };
  for (const key of Object.keys(record)) {
    if (/^Q\d{1,2}$/.test(key)) record[key] = String(record[key] || '').trim().toUpperCase();
    if (/^PT_Q\d{1,2}$/.test(key)) record[key] = Number(String(record[key] || '0').replace(',', '.')) || 0;
  }
  if (!record.PONTOS) record.PONTOS = Array.from({ length: 20 }, (_, index) => Number(record[`PT_Q${index + 1}`] || 0)).reduce((a, b) => a + b, 0);
  record.PONTOS = Number(String(record.PONTOS || '0').replace(',', '.')) || 0;
  record['PONTOS POSSIVEIS'] = Number(String(record['PONTOS POSSIVEIS'] || '0').replace(',', '.')) || Math.max(...Array.from({ length: 20 }, (_, index) => record[`Q${index + 1}`] ? index + 1 : 0), 0);
  const possible = Number(record['PONTOS POSSIVEIS'] || 0);
  if (!record['% ACERTOS']) record['% ACERTOS'] = possible ? record.PONTOS / possible : 0;
  return record;
}

function validateImportRows(rows, headers) {
  const required = ['AVALIACAO', 'UNIDADE', 'ANO', 'TURMA', 'DISCIPLINA', 'NOME', 'EMAIL'];
  const schemaWarnings = [];
  const validationErrors = [];
  for (const field of required) {
    if (!headers.includes(field)) {
      schemaWarnings.push({ severity: 'erro', category: 'Coluna obrigatória', row: '-', column: field, message: `Coluna obrigatória ausente: ${field}.` });
    }
  }
  const known = new Set([...required, 'NIVEL', 'RAÇA', 'INCLUSÃO', 'PONTOS', 'PONTOS POSSIVEIS', '% ACERTOS', ...Array.from({ length: 20 }, (_, index) => `Q${index + 1}`), ...Array.from({ length: 20 }, (_, index) => `PT_Q${index + 1}`)]);
  for (const header of headers) {
    if (!known.has(header)) schemaWarnings.push({ severity: 'alerta', category: 'Configuração diferente', row: '-', column: header, message: `Campo fora do padrão reconhecido: ${header}. Ele será preservado no registro.` });
  }
  rows.slice(0, 200).forEach((row, index) => {
    for (const field of required) {
      if (!row[field]) validationErrors.push({ severity: 'erro', category: 'Campo vazio', row: index + 2, column: field, message: `Linha ${index + 2}: campo obrigatório vazio.` });
    }
  });
  return { schemaWarnings, validationErrors };
}

function duplicateKey(row) {
  return ['NOME', 'AVALIACAO', 'TURMA', 'UNIDADE', 'DISCIPLINA'].map((field) => normalizeEmail(row[field])).join('|');
}

async function previewImport(db, user, form) {
  const file = form?.get?.('file');
  const parsed = await readExcelFile(file);
  const checks = validateImportRows(parsed.rows, parsed.headers);
  const existing = new Set((db.records || []).map(duplicateKey));
  const seen = new Set();
  let duplicates = 0;
  for (const row of parsed.rows) {
    const key = duplicateKey(row);
    if (seen.has(key) || existing.has(key)) duplicates += 1;
    seen.add(key);
  }
  const previewId = id('prev_');
  for (const [key, preview] of importPreviewCache.entries()) {
    if (preview.usuarioEmail === user.email) importPreviewCache.delete(key);
  }
  importPreviewCache.set(previewId, {
    id: previewId,
    usuarioEmail: user.email,
    nomeArquivo: file?.name || 'planilha.xlsx',
    headers: parsed.headers,
    rows: parsed.rows,
    criadaEm: new Date().toISOString(),
  });
  return {
    previewId,
    fileName: file?.name || 'planilha.xlsx',
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    sample: parsed.rows.slice(0, 20),
    duplicates,
    ignoredColumnsAfterRaca: parsed.ignoredColumnsAfterRaca,
    schemaWarnings: checks.schemaWarnings,
    validationErrors: checks.validationErrors,
  };
}

async function commitImport(db, user, previewId) {
  if (db.recordsExternal !== true) {
    throw { status: 500, error: 'Tabela de registros não encontrada.', detail: db.recordsSetupError || 'Execute o supabase.sql atualizado no Supabase para criar a tabela avd_records antes de importar planilhas.' };
  }
  const preview = importPreviewCache.get(previewId) || (db.importPreviews || []).find((item) => item.id === previewId && item.usuarioEmail === user.email);
  if (!preview) throw { status: 404, error: 'Conferência não encontrada. Confira a planilha novamente.' };
  const importId = id('imp_');
  const existingByKey = new Map((db.records || []).map((row) => [duplicateKey(row), row]));
  const recordsToSave = [];
  let novosRegistros = 0;
  let registrosAtualizados = 0;
  for (const row of preview.rows) {
    const key = duplicateKey(row);
    const next = { ...row, importacaoId: importId, atualizadoEm: new Date().toISOString() };
    if (existingByKey.has(key)) {
      const existing = existingByKey.get(key);
      Object.assign(existing, next);
      recordsToSave.push(existing);
      registrosAtualizados += 1;
    } else {
      const created = { id: id('rec_'), ...next, criadoEm: new Date().toISOString() };
      db.records.push(created);
      existingByKey.set(key, created);
      recordsToSave.push(created);
      novosRegistros += 1;
    }
  }
  const importInfo = {
    id: importId,
    nomeArquivo: preview.nomeArquivo,
    quantidadeRegistros: preview.rows.length,
    novosRegistros,
    registrosAtualizados,
    usuarioEmail: user.email,
    criadaEm: new Date().toISOString(),
  };
  db.imports.unshift(importInfo);
  db.importPreviews = (db.importPreviews || []).filter((item) => item.id !== previewId);
  importPreviewCache.delete(previewId);
  log(db, user, 'IMPORTOU_PLANILHA', importInfo);
  await upsertRecords([...new Map(recordsToSave.map((row) => [row.id, row])).values()]);
  await writeDb(db);
  return { ok: true, importacao: importInfo, kpis: dashboard(recordsForUser(db, user)) };
}

function questionAnalysis(db, user, filters = {}) {
  const habilidades = db.habilidadesAplicadas || [];
  const filtered = habilidades.filter((item) => ['avaliacao', 'ano', 'disciplina', 'questao'].every((key) => !filters[key] || String(item[key]) === String(filters[key])));
  const rows = filtered.map((item) => {
    const q = `Q${item.questao}`;
    const records = filteredRecords(db, user, { avaliacao: item.avaliacao, ano: item.ano, disciplina: item.disciplina });
    const avaliados = records.filter((row) => row[q] !== undefined && row[q] !== '').length;
    const acertos = records.filter((row) => String(row[q] || '').trim().toUpperCase() === String(item.alternativaCorreta || '').toUpperCase()).length;
    const distribuicaoRespostas = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((alt) => [alt, records.filter((row) => String(row[q] || '').trim().toUpperCase() === alt).length]));
    return { ...item, questao: q, questaoNumero: item.questao, avaliados, acertos, erros: Math.max(avaliados - acertos, 0), percentual: avaliados ? round((acertos / avaliados) * 100) : 0, distribuicaoRespostas };
  });
  return { filters, options: questionOptions(habilidades, filters), rows, inconsistencias: [], kpis: { habilidadesCadastradas: habilidades.length, habilidadesComDados: rows.filter((row) => row.avaliados).length, totalAvaliacoesQuestao: rows.reduce((s, row) => s + row.avaliados, 0), percentualMedio: rows.length ? round(rows.reduce((s, row) => s + row.percentual, 0) / rows.length) : 0 } };
}

function questionOptions(items, filters) {
  const scoped = items.filter((item) => ['avaliacao', 'ano', 'disciplina'].every((key) => !filters[key] || String(item[key]) === String(filters[key])));
  return { avaliacao: unique(items.map((i) => i.avaliacao)), ano: unique(scoped.map((i) => i.ano)), disciplina: unique(scoped.map((i) => i.disciplina)), questao: unique(scoped.map((i) => `Q${i.questao}`)) };
}

function routeParts(path) {
  return path.split('?')[0].replace(/^\/api\/?/, '').replace(/^\//, '').split('/').filter(Boolean);
}

function filtersFrom(path) {
  const params = new URLSearchParams(path.split('?')[1] || '');
  const filters = {};
  for (const key of [...filterOrder, 'questao']) {
    const values = params.getAll(key).filter(Boolean);
    if (values.length > 1) filters[key] = values;
    else if (values.length === 1) filters[key] = values[0];
  }
  return filters;
}

async function request(method, path, data = undefined, options = {}) {
  const db = await readDb();
  const p = routeParts(path);
  const route = p.join('/');
  if (method === 'GET' && route === 'health') return { ok: true, database: 'Supabase' };
  if (method === 'POST' && route === 'auth/login') {
    const email = normalizeEmail(data?.email);
    const password = String(data?.password || '');
    const user = db.users.find((item) => normalizeEmail(item.email) === email && item.ativo && String(item.senha || item.password || '') === password);
    if (!user) throw { status: 401, error: 'E-mail ou senha inválidos.' };
    log(db, user, 'LOGIN');
    await writeDb(db);
    return { token: `avd:${user.id}:${Date.now()}`, refreshToken: `refresh:${user.id}:${Date.now()}`, user: publicUser(user), permissions: db.permissions[user.perfil] };
  }
  const user = currentUser(db, options.token);
  if (!user) throw { status: 401, error: 'Sessão inválida ou expirada.' };
  if (method === 'GET' && route === 'me') return { user: publicUser(user), permissions: db.permissions[user.perfil] };
  if (method === 'POST' && route === 'auth/logout') return { ok: true };
  if (method === 'POST' && route === 'auth/change-password') {
    user.senha = data?.newPassword;
    log(db, user, 'ALTEROU_SENHA');
    await writeDb(db);
    return { ok: true };
  }
  if (method === 'GET' && route === 'options') return optionsFor(db, user, filtersFrom(path));
  if (method === 'GET' && route === 'dashboard') return dashboard(filteredRecords(db, user, filtersFrom(path)));
  if (method === 'GET' && route === 'records') return { total: filteredRecords(db, user, filtersFrom(path)).length, rows: tableRows(filteredRecords(db, user, filtersFrom(path)), Number(new URLSearchParams(path.split('?')[1] || '').get('limit') || 500)) };
  if (method === 'GET' && route === 'quality') return quality(filteredRecords(db, user, filtersFrom(path)));
  if (method === 'GET' && route === 'analysis') return diagnosticAnalysis(filteredRecords(db, user, filtersFrom(path)));
  if (method === 'GET' && route === 'statistics') return statisticalAnalysis(filteredRecords(db, user, filtersFrom(path)));
  if (method === 'GET' && route === 'compare') {
    const filters = filtersFrom(path);
    return comparisonByEvaluation(filteredRecords(db, user, filters), Array.isArray(filters.avaliacao) ? filters.avaliacao : filters.avaliacao ? [filters.avaliacao] : []);
  }
  if (method === 'GET' && route === 'analysis/questions') return questionAnalysis(db, user, filtersFrom(path));
  if (method === 'GET' && route === 'habilidades-aplicadas/options') return { avaliacoes: unique(recordsForUser(db, user).map((row) => row.AVALIACAO)) };
  if (method === 'GET' && route === 'habilidades-aplicadas') return db.habilidadesAplicadas || [];
  if (method === 'POST' && route === 'habilidades-aplicadas') {
    const item = { id: id('hab_'), ...(data || {}), questao: Number(data?.questao || 0), criadoPor: user.email, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
    db.habilidadesAplicadas.unshift(item);
    log(db, user, 'CADASTROU_HABILIDADE_APLICADA', { id: item.id });
    await writeDb(db);
    return item;
  }
  if (method === 'GET' && route === 'admin/users') return db.users.map(publicUser);
  if (method === 'POST' && route === 'admin/users') {
    const item = { id: id('usr_'), unidadeEscolar: data.unidadeEscolar, email: normalizeEmail(data.email), senha: data.senha, perfil: data.perfil, ativo: data.ativo !== false, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
    db.users.push(item);
    log(db, user, 'CADASTROU_USUARIO', { email: item.email });
    await writeDb(db);
    return publicUser(item);
  }
  if (method === 'PUT' && p[0] === 'admin' && p[1] === 'users' && p[2]) {
    const item = db.users.find((entry) => entry.id === p[2]);
    if (!item) throw { status: 404, error: 'Usuário não encontrado.' };
    Object.assign(item, data || {});
    if (data?.email) item.email = normalizeEmail(data.email);
    if (data?.senha) item.senha = data.senha;
    item.atualizadoEm = new Date().toISOString();
    await writeDb(db);
    return publicUser(item);
  }
  if (method === 'GET' && route === 'admin/permissions') return { screens, permissions: db.permissions };
  if (method === 'PUT' && route === 'admin/permissions') {
    db.permissions = data.permissions;
    await writeDb(db);
    return { ok: true };
  }
  if (method === 'GET' && route === 'logs') return db.logs.slice(0, 500);
  if (method === 'GET' && route === 'imports') return db.imports || [];
  if (method === 'DELETE' && p[0] === 'imports' && p[1]) {
    const before = db.records.length;
    await deleteRecordsByImport(p[1]);
    db.records = db.records.filter((row) => row.importacaoId !== p[1]);
    db.imports = db.imports.filter((item) => item.id !== p[1]);
    await writeDb(db);
    return { ok: true, registrosRemovidos: before - db.records.length, totalImportacoes: db.imports.length, kpis: dashboard(filteredRecords(db, user, {})).kpis };
  }
  if (method === 'POST' && route === 'imports/preview') return previewImport(db, user, data);
  if (method === 'POST' && route === 'imports/commit') return commitImport(db, user, data?.previewId);
  if (method === 'GET' && (route === 'reports/pdf' || route === 'analysis/questions/pdf')) return new Blob(['Relatório disponível na visualização da tela.'], { type: 'application/pdf' });
  if (method === 'GET' && route === 'export/excel') return new Blob([csv(tableRows(filteredRecords(db, user, filtersFrom(path)), 100000))], { type: 'text/csv;charset=utf-8' });
  throw { status: 404, error: 'Rota não encontrada.' };
}

function csv(rows) {
  const headers = Object.keys(rows[0] || { vazio: '' });
  return `\uFEFF${[headers.join(';'), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n')}`;
}

window.AVD_DB_REQUEST = request;
window.AVD_SUPABASE_CLIENT = { url: SUPABASE_URL, table: TABLE };
