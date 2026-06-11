const APP_ASSET_BASE = new URL(".", import.meta.url);

const state = {
  token: localStorage.getItem("token"),
  refreshToken: localStorage.getItem("refreshToken"),
  user: null,
  permissions: {},
  view: "dashboard",
  viewHistory: [],
  options: {},
  filters: {},
  dashboard: null,
  rows: [],
  users: [],
  editingUserId: "",
  imports: [],
  importStats: null,
  logs: [],
  quality: null,
  analysis: null,
  questionAnalysis: null,
  questionAnswerSelection: {},
  showQuestionImmersion: false,
  statistics: null,
  comparison: null,
  habilidadesAplicadas: [],
  habilidadeOptions: { avaliacoes: [] },
  habilidadeDraft: {},
  habilidadeErrors: {},
  curriculoMunicipalData: null,
  curriculoMunicipalDoc: "",
  reportMode: "padrao",
  activeDiagnosticIndex: 0,
  optionTotal: 0,
  loading: false,
  message: "",
  error: "",
};

const app = document.querySelector("#app");
const apiCache = new Map();
let currentLoadId = 0;
let pendingLoadTimer = null;
const filterOrder = ["avaliacao", "unidade", "ano", "turma", "disciplina", "aluno", "nivel", "raca", "inclusao"];
const questionAnalysisFilterOrder = ["avaliacao", "ano", "disciplina", "questao"];
const questionAnalysisFilterLabels = {
  avaliacao: "Avaliação",
  ano: "Ano",
  disciplina: "Disciplina",
  questao: "Questão",
};
const habilidadeYears = ["1º ANO", "2º ANO", "3º ANO", "4º ANO", "5º ANO", "6º ANO", "7º ANO", "8º ANO", "9º ANO"];
const habilidadeDisciplines = ["Portugu\u00eas", "Matém\u00e1tica"];
const habilidadeAlternatives = ["A", "B", "C", "D", "E"];
const habilidadeQuestionLimits = {
  "1º ANO": 10,
  "2º ANO": 10,
  "3º ANO": 10,
  "4º ANO": 15,
  "5º ANO": 15,
  "6º ANO": 20,
  "7º ANO": 20,
  "8º ANO": 20,
  "9º ANO": 20,
};
const filterLabels = {
  avaliacao: "Avaliação",
  unidade: "Unidade",
  ano: "Ano",
  turma: "Turma",
  disciplina: "Disciplina",
  aluno: "Aluno",
  nivel: "Nível",
  raca: "Raça",
  inclusao: "Inclusão",
};
const levelColors = {
  "MUITO CRITICO": "#F97316",
  "MUITO CRÍTICO": "#F97316",
  "CRITICO": "#2563EB",
  "CRÍTICO": "#2563EB",
  "SATISFATORIO": "#16A34A",
  "SATISFATÓRIO": "#16A34A",
};
const chartRegistry = new Map();

boot();

async function boot() {
  if (state.token) {
    try {
      const me = await api("/me");
      state.user = me.user;
      state.permissions = me.permissions;
      await loadDashboard();
    } catch {
      logoutLocal();
    }
  }
  render();
}

function render() {
  app.dataset.loaded = "true";
  app.innerHTML = state.user ? shell() : loginView();
  bind();
  drawCharts();
}

function loginView() {
  return `
    <section class="login">
      <div class="login-panel">
        <img class="login-logo" src="${assetPath("logo-semed.png")}" alt="Secretaria de Educação de Uberaba" onerror="this.style.display='none'">
        <h1>AVD Diagnóstico Escolar</h1>
        <p>Consulta, análise e relatórios diagnósticos por perfil de acesso.</p>
        ${alertHtml()}
        <form id="loginForm">
          <label>E-mail <input name="email" type="email" required autocomplete="username" placeholder="Digite seu e-mail"></label>
          <label>Senha <input name="password" type="password" required autocomplete="current-password" placeholder="Digite sua senha"></label>
          <button class="primary" type="submit">Entrar</button>
        </form>
      </div>
    </section>`;
}

function shell() {
  const nav = [
    ["dashboard", "Dashboard", "dashboard"],
    ["bncc", "Habilidades BNCC", "bncc"],
    ["curriculoMunicipal", "Currículo Municipal", "bncc"],
    ["habilidadesAplicadas", "Cadastro de Habilidades Aplicadas", "habilidadesAplicadas"],
    ["relatorios", "Relatórios", "relatorios"],
    ["qualidade", "Qualidade dos dados", "qualidade"],
    ["comparativo", "Comparativo", "comparativo"],
    ["importacoes", "Importações", "importacoes"],
    ["admin", "Administração", "admin"],
  ].filter(([, , permissionKey]) => state.permissions[permissionKey] !== false);
  return `
    <section class="shell">
      <aside class="sidebar">
        <div class="brand">AVD</div>
        <div class="user-box">
          <strong>${state.user.perfil}</strong><br>
          ${state.user.email}<br>
          <span>${state.user.unidadeEscolar || ""}</span>
        </div>
        <nav class="nav">
          ${nav.map(([key, label, , child]) => `<button data-view="${key}" class="${state.view === key ? "active" : ""} ${child ? "nav-child" : ""}">${label}</button>`).join("")}
          <button id="logout">Sair</button>
        </nav>
        <div class="sidebar-logo"><img src="${assetPath("logo-detic.png")}" alt="DETIC"></div>
      </aside>
      <section class="content">
        <div class="page">
          ${pageActionsHtml()}
          ${alertHtml()}
          ${viewHtml()}
        </div>
      </section>
    </section>`;
}

function viewHtml() {
  if (state.view === "admin") return adminView();
  if (state.view === "importacoes") return importView();
  if (state.view === "analise") return analysisView();
  if (state.view === "analiseQuestoes") return questionAnalysisView();
  if (state.view === "bncc") return bnccView();
  if (state.view === "curriculoMunicipal") return curriculoMunicipalView();
  if (state.view === "habilidadesAplicadas") return habilidadesAplicadasView();
  if (state.view === "relatorios") return reportsView();
  if (state.view === "qualidade") return qualityView();
  if (state.view === "comparativo") return compareView();
  return dashboardView();
}

function pageActionsHtml() {
  return `<section class="page-actions">
    <button id="backPage" class="back-button" type="button">Voltar</button>
  </section>`;
}

function filtersHtml() {
  return `<section class="filters ${state.loading ? "is-loading" : ""}">
    <div class="filter-status">${state.loading ? "Atualizando filtros..." : "Filtros inteligentes em tempo real"}</div>
    ${filterOrder.map((key) => `
      <label>${filterLabels[key]}
        <select data-filter="${key}" ${key === "avaliacao" ? "multiple size=\"4\"" : ""} ${state.loading ? "disabled" : ""}>
          <option value="">Todos</option>
          ${(state.options[key] || []).map((v) => `<option ${isSelectedFilter(key, v) ? "selected" : ""}>${esc(v)}</option>`).join("")}
        </select>
      </label>`).join("")}
    <div class="toolbar filter-actions"><button id="clearFilters" ${state.loading ? "disabled" : ""}>Limpar filtros</button></div>
  </section>`;
}

function dashboardView() {
  const k = state.dashboard?.kpis || {};
  const hasFilters = Object.keys(state.filters).length > 0;
  return `
    ${filtersHtml()}
    ${!hasFilters ? dashboardStartState() : `
      <section class="kpis">
      ${kpi("Alunos avaliados", k.totalAlunos || 0)}
      ${kpi("Pontos possíveis", k.pontosPossiveis || 0)}
      ${kpi("Acertos", k.acertos || 0)}
      ${kpi("% de acertos", `${k.percentualAcertos || 0}%`)}
      </section>
      <section class="charts">
      ${chartCard("Alunos por nivel", "levelChart")}
      ${chartCard("Desempenho por unidade", "unitChart")}
      ${chartCard("Desempenho por questao", "questionChart")}
      ${chartCard("Distribuição percentual por nível", "donutChart")}
      </section>`}`;
}

function dashboardStartState() {
  return `<section class="card dashboard-start">
    <h3>Selecione os filtros para visualizar os resultados</h3>
    <p class="muted">As informações do dashboard serão carregadas somente após você indicar quais dados deseja consultar nos filtros acima.</p>
  </section>`;
}

function analysisView(showFilters = true, requireFilters = false) {
  const a = state.analysis;
  const hasFilters = hasReportFilters();
  return `
    ${showFilters ? filtersHtml() : ""}
    ${requireFilters && !hasFilters ? reportStartState() : `
    <section class="card">
      <h3>Relatorio de analise diagnostica</h3>
      <p class="muted">Leitura pedagogica dos resultados filtrados, com indicacoes de prioridades para recomposicao e melhoria das notas.</p>
      ${a ? `
        <section class="kpis">
          ${kpi("Alunos analisados", a.resumo.totalAlunos)}
          ${kpi("% geral", `${a.resumo.percentualGeral}%`)}
          ${kpi("% critico", `${a.resumo.percentualCritico}%`)}
          ${kpi("Acertos", a.resumo.acertos)}
        </section>
        <div class="analysis-grid">
          <div>
            <h3>Pontos a abordar</h3>
            ${diagnosticCards(a.pontosDeAtencao)}
          </div>
          <div>
            <h3>Recomendacoes</h3>
            <ul class="clean-list">${a.recomendacoes.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
            <h3>Perguntas norteadoras</h3>
            <ul class="clean-list">${a.perguntasNorteadoras.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
          </div>
        </div>
        <section class="charts">
          ${miniTable("Questoes prioritarias", a.questoesPrioritarias, ["label", "percentual", "avaliados"])}
          ${miniTable("Turmas prioritarias", a.turmasPrioritarias, ["label", "percentual", "alunos"])}
        </section>
      ` : "<p>Carregando...</p>"}
    </section>`}`;
}

function questionAnalysisView(showFilters = true, useReportFilters = false) {
  const data = state.questionAnalysis;
  const k = data?.kpis || {};
  const consolidatedRows = consolidatedQuestionRows(data?.rows || []);
  const hasFilters = useReportFilters ? hasReportFilters() : hasQuestionAnalysisFilters();
  return `
    ${showFilters ? questionAnalysisFiltersHtml() : ""}
    ${!hasFilters ? `<section class="card dashboard-start">
      <h3>Selecione os filtros para gerar a analise</h3>
      <p class="muted">Os resultados da Analise Diagnostica das Questoes serao exibidos somente conforme a solicitacao feita nos filtros acima.</p>
    </section>` : `
    <section class="card">
      <div class="toolbar">
        <h3>Relatorio analitico</h3>
        <button class="primary" id="questionAnalysisPdf">Criar Relatorio em PDF</button>
        <button id="questionImmersion" class="${state.showQuestionImmersion ? "active" : ""}">Imersao</button>
      </div>
      <p class="muted">O PDF sera gerado em A4 paisagem, com fonte Arial tamanho 11, respeitando os filtros aplicados. A Imersao consolida acoes pedagogicas do Currículo Municipal a partir das questoes filtradas.</p>
    </section>
    ${state.showQuestionImmersion ? questionImmersionView(data) : ""}
    <section class="kpis">
      ${kpi("Habilidades cadastradas", k.habilidadesCadastradas || 0)}
      ${kpi("Com dados correlatos", k.habilidadesComDados || 0)}
      ${kpi("Avaliações por questão", k.totalAvaliacoesQuestao || 0)}
      ${kpi("% medio", `${k.percentualMedio || 0}%`)}
    </section>
    <section class="charts">
      ${chartCard("Desempenho das questoes cadastradas", "questionDiagnosticChart")}
      <section class="card">
        <h3>Consistencia dos cadastros</h3>
        <p class="muted">A correlacao considera Avaliacao, Ano e Disciplina iguais entre o cadastro da habilidade aplicada e a base importada.</p>
        ${data?.inconsistencias?.length ? `<div class="table-wrap"><table><thead><tr><th>Questao</th><th>Avaliacao</th><th>Ano</th><th>Disciplina</th><th>Mensagem</th></tr></thead><tbody>
          ${data.inconsistencias.map((item) => `<tr><td>${esc(item.questao)}</td><td>${esc(item.avaliacao)}</td><td>${esc(item.ano)}</td><td>${esc(item.disciplina)}</td><td>${esc(item.mensagem)}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="notice">Todos os cadastros filtrados possuem correlacao com resultados importados.</div>`}
      </section>
    </section>
    <section class="card">
      <h3>Análise diagnóstica por habilidade e questão</h3>
      ${consolidatedRows.length ? `<div class="question-analysis-list">
        ${consolidatedRows.map((row) => questionAnalysisCard(row)).join("")}
      </div>` : `<div class="empty-box">Nenhum cadastro de habilidade aplicada encontrado para os filtros selecionados.</div>`}
    </section>`}`;
}

function hasQuestionAnalysisFilters() {
  return questionAnalysisFilterOrder.some((key) => {
    const value = state.filters[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

function hasReportFilters() {
  return filterOrder.some((key) => {
    const value = state.filters[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

function questionAnalysisFiltersHtml() {
  const options = state.questionAnalysis?.options || {};
  return `<section class="filters ${state.loading ? "is-loading" : ""}">
    <div class="filter-status">${state.loading ? "Atualizando analise..." : "Filtros da analise diagnostica das questoes"}</div>
    ${questionAnalysisFilterOrder.map((key) => `
      <label>${questionAnalysisFilterLabels[key]}
        <select data-question-filter="${key}" ${key === "avaliacao" ? "multiple size=\"4\"" : ""} ${state.loading ? "disabled" : ""}>
          <option value="">Todos</option>
          ${(options[key] || []).map((value) => `<option value="${esc(value)}" ${isSelectedFilter(key, value) ? "selected" : ""}>${esc(value)}</option>`).join("")}
        </select>
      </label>`).join("")}
    <div class="toolbar filter-actions"><button id="clearQuestionFilters" ${state.loading ? "disabled" : ""}>Limpar filtros</button></div>
  </section>`;
}

function consolidatedQuestionRows(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = row.questao || `Q${row.questaoNumero || ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ...row,
        ids: [row.id],
        descritores: new Set([row.descritorUsado].filter(Boolean)),
        objetos: new Set([row.objetoConhecimento].filter(Boolean)),
        distribuicaoRespostas: { ...(row.distribuicaoRespostas || {}) },
      });
      continue;
    }
    const current = groups.get(key);
    current.ids.push(row.id);
    if (row.descritorUsado) current.descritores.add(row.descritorUsado);
    if (row.objetoConhecimento) current.objetos.add(row.objetoConhecimento);
    current.avaliados += Number(row.avaliados || 0);
    current.acertos += Number(row.acertos || 0);
    current.erros += Number(row.erros || 0);
    for (const [alternative, value] of Object.entries(row.distribuicaoRespostas || {})) {
      current.distribuicaoRespostas[alternative] = Number(current.distribuicaoRespostas[alternative] || 0) + Number(value || 0);
    }
    if (!current.correlato && row.correlato) current.correlato = true;
    if (Number(row.percentual || 0) < Number(current.percentual || 0)) {
      current.diagnostico = row.diagnostico;
      current.intervencao = row.intervencao;
      current.analiseDistratores = row.analiseDistratores || current.analiseDistratores;
      current.alternativaCorreta = row.alternativaCorreta || current.alternativaCorreta;
    }
  }
  return [...groups.values()]
    .map((row) => {
      const percentual = row.avaliados ? Math.round((Number(row.acertos || 0) / Number(row.avaliados || 0)) * 1000) / 10 : 0;
      const descritores = [...(row.descritores || [])];
      const objetos = [...(row.objetos || [])];
      return {
        ...row,
        id: row.questao,
        percentual,
        prioridade: percentual < 50 ? "Alta" : percentual < 70 ? "Media" : "Monitoramento",
        descritorUsado: descritores.length > 1 ? descritores.join(" | ") : (descritores[0] || row.descritorUsado),
        objetoConhecimento: objetos.length > 1 ? objetos.join(" | ") : (objetos[0] || row.objetoConhecimento),
        diagnostico: row.ids.length > 1
          ? `Questão consolidada a partir de ${row.ids.length} cadastros correlatos. ${row.diagnostico || ""}`
          : row.diagnostico,
      };
    })
    .sort((a, b) => Number(a.questaoNumero || 0) - Number(b.questaoNumero || 0));
}

function questionImmersionView(data) {
  const plan = buildQuestionImmersionPlan(data);
  if (!plan.rows.length) {
    return `<section class="card immersion-panel">
      <h3>Imersao pedagogica do Currículo Municipal</h3>
      <div class="empty-box">Nenhum resultado encontrado para consolidar a imersao. Ajuste os filtros da analise diagnostica das questoes.</div>
    </section>`;
  }
  const focusItems = plan.priorityRows.slice(0, 5).map((row) => `${row.questao} - ${row.descritorUsado} (${row.percentual}%)`);
  const curriculumAnchors = plan.priorityRows.slice(0, 4).map((row) => row.objetoConhecimento).filter(Boolean);
  const distractorItems = plan.dominantDistractors.slice(0, 5).map((item) => `${item.questao}: alternativa ${item.alternative} com ${item.count} marcacoes`);
  return `<section class="card immersion-panel">
    <div class="immersion-header">
      <div>
        <span class="badge">Plano de imersao</span>
        <h3>Consolidado de acoes imersivas para elevar o aproveitamento</h3>
        <p class="muted">Gerado a partir das questoes cadastradas, respostas importadas e correlacao com Avaliacao, Ano e Disciplina.</p>
      </div>
      <div class="immersion-score">
        <strong>${esc(plan.average)}%</strong>
        <span>Aproveitamento medio</span>
      </div>
    </div>
    <div class="toolbar immersion-actions no-print">
      <button class="primary" id="printImmersion">Imprimir Imersao</button>
    </div>
    <div class="immersion-summary">
      ${immersionMetric("Prioridade alta", plan.high.length, "#dc2626")}
      ${immersionMetric("Prioridade media", plan.medium.length, "#f97316")}
      ${immersionMetric("Monitoramento", plan.monitoring.length, "#16a34a")}
    </div>
    <div class="immersion-visual-grid">
      <div class="immersion-chart-card">
        <h3>Distribuicao de prioridades</h3>
        ${immersionBars([
          ["Alta", plan.high.length, "#dc2626"],
          ["Media", plan.medium.length, "#f97316"],
          ["Monitorar", plan.monitoring.length, "#16a34a"],
        ])}
      </div>
      <div class="immersion-chart-card">
        <h3>Questões de menor aproveitamento</h3>
        ${immersionBars(plan.priorityRows.slice(0, 6).map((row) => [row.questao, row.percentual, "#0057d9"]), "%")}
      </div>
    </div>
    <div class="immersion-grid">
      ${immersionQuadrant("1. Reensino focal do Currículo Municipal", "CURR", "Retomar objetos do conhecimento com menor dominio.", [
        `Habilidades foco: ${focusItems.length ? focusItems.join("; ") : "manter acompanhamento das questoes filtradas"}.`,
        `Ancoragem curricular: ${curriculumAnchors.length ? curriculumAnchors.join("; ") : "usar os objetos do conhecimento cadastrados no planejamento"}.`,
        "Planejar miniaulas de 20 a 30 minutos com modelagem, exemplos guiados e checagem rapida de compreensao.",
      ])}
      ${immersionQuadrant("2. Laboratorio de distratores", "ERRO", "Transformar respostas incorretas em evidencias de aprendizagem.", [
        `Distratores prioritarios: ${distractorItems.length ? distractorItems.join("; ") : "sem distrator dominante identificado"}.`,
        "Organizar discussoes por alternativa escolhida, comparando o raciocinio do estudante com a alternativa correta cadastrada.",
        "Criar devolutivas curtas por questao, distinguindo erro conceitual, erro de leitura, procedimento incompleto e calculo.",
      ])}
      ${immersionQuadrant("3. Rotacao imersiva por estacoes", "ACAO", "Atender grupos com necessidades diferentes sem perder o foco da turma.", [
        "Estacao 1: retomada orientada pelo professor nas questoes de prioridade alta.",
        "Estacao 2: pratica colaborativa com itens semelhantes e justificativa de alternativas.",
        "Estacao 3: desafio do Currículo Municipal com situacoes-problema conectadas ao objeto do conhecimento.",
      ])}
      ${immersionQuadrant("4. Monitoramento de impacto", "META", "Medir se a intervencao elevou o aproveitamento.", [
        "Aplicar sondagem curta apos a imersao com itens equivalentes aos descritores trabalhados.",
        "Comparar acertos antes e depois por questao, turma e disciplina, mantendo os mesmos filtros do painel.",
        "Registrar evidencias e replanejar somente as habilidades que permanecerem abaixo de 70%.",
      ])}
    </div>
    <img class="print-logo" src="${assetPath("logo-detic.png")}" alt="DETIC">
  </section>`;
}

function buildQuestionImmersionPlan(data) {
  const rows = consolidatedQuestionRows(data?.rows || [])
    .filter((row) => row && row.correlato !== false)
    .sort((a, b) => Number(a.percentual || 0) - Number(b.percentual || 0) || Number(a.questaoNumero || 0) - Number(b.questaoNumero || 0));
  const high = rows.filter((row) => Number(row.percentual || 0) < 50);
  const medium = rows.filter((row) => Number(row.percentual || 0) >= 50 && Number(row.percentual || 0) < 70);
  const monitoring = rows.filter((row) => Number(row.percentual || 0) >= 70);
  const dominantDistractors = rows.map((row) => {
    const entries = Object.entries(row.distribuicaoRespostas || {})
      .filter(([alternative]) => ["A", "B", "C", "D", "E"].includes(alternative) && alternative !== row.alternativaCorreta)
      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
    const [alternative, count] = entries[0] || ["-", 0];
    return { ...row, alternative, count: Number(count || 0) };
  }).filter((row) => row.count > 0);
  const totalPercent = rows.reduce((sum, row) => sum + Number(row.percentual || 0), 0);
  return {
    rows,
    high,
    medium,
    monitoring,
    dominantDistractors,
    priorityRows: rows,
    average: rows.length ? Math.round((totalPercent / rows.length) * 10) / 10 : 0,
  };
}

function immersionMetric(label, value, color) {
  return `<div class="immersion-metric" style="--metric-color:${color}">
    <strong>${esc(value)}</strong>
    <span>${esc(label)}</span>
  </div>`;
}

function immersionBars(items, suffix = "") {
  const max = Math.max(...items.map(([, value]) => Number(value || 0)), 1);
  return `<div class="immersion-bars">
    ${items.map(([label, value, color]) => {
      const numeric = Number(value || 0);
      const width = Math.max(4, Math.round((numeric / max) * 100));
      return `<div class="immersion-bar-row">
        <span>${esc(label)}</span>
        <div class="immersion-bar-track"><i style="width:${width}%;background:${color}"></i></div>
        <strong>${esc(numeric)}${suffix}</strong>
      </div>`;
    }).join("")}
  </div>`;
}

function immersionQuadrant(title, icon, focus, actions) {
  return `<article class="immersion-card">
    <div class="immersion-illustration" aria-hidden="true">${esc(icon)}</div>
    <div>
      <h3>${esc(title)}</h3>
      <p>${esc(focus)}</p>
      <ul class="clean-list">${actions.map((action) => `<li>${esc(action)}</li>`).join("")}</ul>
    </div>
  </article>`;
}

function questionAnalysisCard(row) {
  const priorityClass = row.prioridade === "Alta" ? "danger" : row.prioridade === "Media" ? "warn" : "ok";
  return `<article class="question-analysis-card">
    <header>
      <div>
        <span class="badge">${esc(row.questao)}</span>
        <strong>${esc(row.descritorUsado)}</strong>
        <p>${esc(row.objetoConhecimento)}</p>
      </div>
      <div class="question-score ${priorityClass}">
        <strong>${esc(row.percentual)}%</strong>
        <span>${esc(row.prioridade)}</span>
      </div>
    </header>
    <div class="question-meta">
      <span>${esc(row.avaliacao)}</span>
      <span>${esc(row.ano)}</span>
      <span>${esc(row.disciplina)}</span>
      <span>${esc(row.avaliados)} avaliados</span>
      <span>${esc(row.acertos)} acertos</span>
      <span>${esc(row.erros)} erros</span>
      <span>Alternativa correta: ${esc(row.alternativaCorreta)}</span>
      <span>Campo analisado: ${esc(row.questao)}</span>
    </div>
    ${answerDistributionHtml(row)}
    <div class="analysis-grid compact-analysis">
      <div>
        <h3>Diagnostico</h3>
        <p>${esc(row.diagnostico)}</p>
      </div>
      <div>
        <h3>Encaminhamento pedagogico</h3>
        <p>${esc(row.intervencao)}</p>
      </div>
    </div>
  </article>`;
}

function answerDistributionHtml(row) {
  const distribution = row.distribuicaoRespostas || {};
  const total = Math.max(row.avaliados || 0, 1);
  const keys = ["A", "B", "C", "D", "E"];
  const selected = state.questionAnswerSelection?.[row.id] || "";
  return `<div class="answer-distribution">
    ${keys.map((key) => {
      const value = Number(distribution[key] || 0);
      const width = Math.round((value / total) * 100);
      const isCorrect = key === row.alternativaCorreta;
      const active = selected === key;
      return `<button type="button" data-answer-info="${row.id}" data-answer-alternative="${key}" class="answer-pill ${isCorrect ? "correct" : ""} ${active ? "active" : ""}" aria-expanded="${active ? "true" : "false"}">
        <span>${esc(key)}</span>
        <strong>${value}</strong>
        <i style="width:${width}%"></i>
      </button>`;
    }).join("")}
  </div>
  ${selected ? answerDetailHtml(row, selected) : `<div class="answer-detail muted">Clique em uma alternativa para visualizar a informacao cadastrada para a resposta.</div>`}`;
}

function answerDetailHtml(row, alternative) {
  const isCorrect = alternative === row.alternativaCorreta;
  const text = isCorrect
    ? `Alternativa correta cadastrada para ${row.questao}. Esta resposta indica dominio esperado da habilidade: ${row.descritorUsado}.`
    : (row.analiseDistratores?.[alternative] || "Nao ha analise cadastrada para esta alternativa.");
  return `<article class="answer-detail ${isCorrect ? "correct" : ""}">
    <span class="badge">${isCorrect ? "Alternativa correta" : `Distrator ${esc(alternative)}`}</span>
    <strong>Alternativa ${esc(alternative)}</strong>
    <p>${esc(text)}</p>
  </article>`;
}

function reportsView() {
  const stats = state.statistics;
  const hasFilters = hasReportFilters();
  if (state.reportMode === "diagnostica") return `${filtersHtml()}${reportsSubnav()}${analysisView(false, true)}`;
  if (state.reportMode === "questoes") return `${filtersHtml()}${reportsSubnav()}${questionAnalysisView(false, true)}`;
  return `
    ${filtersHtml()}
    ${reportsSubnav()}
    ${!hasFilters ? reportStartState() : state.reportMode === "estatistica" ? `
      <section class="kpis">
        ${kpi("Media %", `${stats?.resumo.mediaPercentual || 0}%`)}
        ${kpi("Mediana %", `${stats?.resumo.medianaPercentual || 0}%`)}
        ${kpi("Desvio padrao", `${stats?.resumo.desvioPadraoPercentual || 0}`)}
        ${kpi("Amplitude", `${stats?.resumo.minimoPercentual || 0}% - ${stats?.resumo.maximoPercentual || 0}%`)}
      </section>
      <section class="charts">
        ${chartCard("Distribuicao por nivel", "statsLevelChart")}
        ${chartCard("Desempenho por questao", "statsQuestionChart")}
      </section>
      <section class="card">
        <h3>Análise estatística por unidade</h3>
        ${stats ? miniTable("Unidades", stats.unidades.slice(0, 20), ["label", "percentual", "alunos"]) : ""}
      </section>
    ` : `
    <section class="card">
      <h3>Relatórios</h3>
      <p class="muted">Os arquivos respeitam os filtros aplicados e as permissoes do perfil logado.</p>
      <div class="toolbar">
        <button class="primary" id="pdfReport">Baixar PDF</button>
        <button id="printPage">Imprimir tela</button>
        <button id="exportCsv">Exportar Excel/CSV</button>
      </div>
    </section>
    <section class="card">${emptyState()}${tableHtml(state.rows)}</section>`}`;
}

function reportsSubnav() {
  return `<section class="subnav">
    <button data-report-mode="padrao" class="${state.reportMode === "padrao" ? "active" : ""}">Relatorios</button>
    <button data-report-mode="estatistica" class="${state.reportMode === "estatistica" ? "active" : ""}">Analise Estatistica</button>
    <button data-report-mode="diagnostica" class="${state.reportMode === "diagnostica" ? "active" : ""}">Analise Diagnostica</button>
    <button data-report-mode="questoes" class="${state.reportMode === "questoes" ? "active" : ""}">Analise Diagnostica das Questoes</button>
  </section>`;
}

function reportStartState() {
  return `<section class="card dashboard-start">
    <h3>Selecione os filtros para visualizar o relatorio</h3>
    <p class="muted">As informações dos relatorios serao apresentadas somente depois da escolha dos filtros acima, mantendo o mesmo contexto para todas as abas.</p>
  </section>`;
}

function bnccView() {
  const shortcuts = [
    ["Educação Infantil", "Direitos de aprendizagem e campos de experiências"],
    ["Ensino Fundamental", "Habilidades por área, componente, ano e objeto de conhecimento"],
    ["Linguagens", "Língua Portuguesa, Arte, Educação Física e Língua Inglesa"],
    ["Matémática", "Unidades temáticas, objetos de conhecimento e habilidades"],
    ["Ciências da Natureza", "Ciências e habilidades por ano"],
    ["Ciências Humanas", "Geografia e História"],
    ["Ensino Religioso", "Habilidades do Ensino Fundamental"],
    ["Ensino Médio", "Competências e habilidades por área"],
  ];
  return `
    <section class="card bncc-header">
      <div>
        <h3>Habilidades BNCC</h3>
        <p class="muted">Consulta somente leitura da Base Nacional Comum Curricular, a partir das fontes oficiais do Ministério da Educação.</p>
      </div>
      <div class="toolbar">
        <a class="button-link primary" href="https://basenacionalcomum.mec.gov.br/abase/" target="_blank" rel="noopener">Abrir BNCC navegável</a>
        <a class="button-link" href="https://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf" target="_blank" rel="noopener">PDF oficial EI/EF</a>
      </div>
    </section>
    <section class="bncc-grid">
      <div class="card">
        <h3>Atalhos de consulta</h3>
        <div class="bncc-shortcuts">
          ${shortcuts.map(([title, text]) => `<article><strong>${esc(title)}</strong><span>${esc(text)}</span></article>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3>Fonte oficial</h3>
        <p class="muted">A BNCC define aprendizagens essenciais, competências e habilidades para a Educação Básica. A consulta abaixo carrega o documento navegável oficial do MEC.</p>
        <p class="muted">Caso o navegador bloqueie a visualização incorporada, use o botão “Abrir BNCC navegável”.</p>
      </div>
    </section>
    <section class="card bncc-frame-card">
      <iframe class="bncc-frame" title="BNCC navegável - Ministério da Educação" src="https://basenacionalcomum.mec.gov.br/abase/"></iframe>
    </section>`;
}

function curriculoMunicipalView() {
  const docs = [
    {
      id: "lingua-portuguesa",
      title: "Lingua Portuguesa - 1o ao 9o ano",
      area: "Linguagens",
      estrutura: "Campos de atuacao, praticas de linguagem, objetos de conhecimento e habilidades",
      text: "Currículo Municipal de Lingua Portuguesa, organizado para consulta por ano, campos de atuacao, praticas de linguagem, objetos de conhecimento e habilidades.",
      href: assetPath("curriculo-municipal-lingua-portuguesa.pdf"),
    },
    {
      id: "matématica",
      title: "Matématica - 1o ao 9o ano",
      area: "Matématica",
      estrutura: "Unidades tematicas, objetos de conhecimento, habilidades e sugestoes didaticas",
      text: "Currículo Municipal de Matématica, com unidades tematicas, objetos de conhecimento e habilidades para apoiar a analise pedagogica dos resultados.",
      href: assetPath("curriculo-municipal-matématica.pdf"),
    },
  ];
  const selected = docs.find((doc) => doc.id === state.curriculoMunicipalDoc);
  const selectedData = (state.curriculoMunicipalData || []).find((doc) => doc.id === selected?.id);
  return `
    <section class="card bncc-header">
      <div>
        <h3>Currículo Municipal</h3>
        <p class="muted">Consulta somente leitura dos documentos curriculares municipais carregados no sistema, seguindo a mesma organizacao visual da tela Habilidades BNCC.</p>
      </div>
      <div class="toolbar">
        <a class="button-link primary" href="${assetPath("curriculo-municipal-lingua-portuguesa.pdf")}" target="_blank" rel="noopener">Lingua Portuguesa</a>
        <a class="button-link" href="${assetPath("curriculo-municipal-matématica.pdf")}" target="_blank" rel="noopener">Matématica</a>
      </div>
    </section>
    <section class="bncc-grid">
      <div class="card">
        <h3>Atalhos de consulta</h3>
        <div class="bncc-shortcuts">
          ${docs.map((doc) => `<article>
            <strong>${esc(doc.title)}</strong>
            <span><b>Area:</b> ${esc(doc.area)}</span>
            <span><b>Organizacao:</b> ${esc(doc.estrutura)}</span>
            <div class="toolbar">
              <a class="button-link primary" href="${doc.href}" target="_blank" rel="noopener">Abrir em nova aba</a>
            </div>
          </article>`).join("")}
          <article>
            <strong>Ensino Fundamental</strong>
            <span>Consulta por ano de escolaridade, componente curricular, objeto de conhecimento e habilidade.</span>
          </article>
          <article>
            <strong>Uso pedagogico</strong>
            <span>Referência para relatorios, analise diagnostica, imersao e cadastro de habilidades aplicadas.</span>
          </article>
        </div>
      </div>
      <div class="card">
        <h3>Fonte municipal</h3>
        <p class="muted">Os documentos abaixo foram carregados a partir dos arquivos oficiais anexados e passam a orientar as analises pedagogicas do sistema.</p>
        <p class="muted">Use os cards ao lado para abrir o curriculo completo em nova aba. A consulta curricular resumida permanece organizada abaixo apenas para leitura.</p>
      </div>
    </section>
    ${curriculoMunicipalOverview()}`;
}

function curriculoMunicipalOverview() {
  const docs = state.curriculoMunicipalData || [];
  if (!docs.length) {
    return `<section class="card">
      <h3>Consulta curricular resumida</h3>
      <p class="muted">As informações resumidas do Currículo Municipal serao carregadas automaticamente para visualizacao.</p>
    </section>`;
  }
  return `<section class="card">
    <div class="toolbar">
      <h3>Consulta curricular resumida</h3>
      ${docs.map((doc) => `<span class="badge">${esc(doc.titulo)}: ${doc.linhas?.length || 0} linhas</span>`).join("")}
    </div>
    <p class="muted">Resumo automatico para apoio de consulta. O documento completo deve ser aberto nos cards acima.</p>
    ${docs.map((doc) => `
      <h3>${esc(doc.titulo)}</h3>
      ${curriculoMunicipalTable(doc.linhas || [])}
    `).join("")}
  </section>`;
}

function curriculoMunicipalTable(rows) {
  if (!rows?.length) return `<div class="empty-box">Nenhuma informacao estruturada encontrada para o documento selecionado.</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Componente</th><th>Ano</th><th>Codigo</th><th>Objeto/Tema</th><th>Habilidade ou trecho curricular</th><th>Pagina</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>
        <td>${esc(row.componente)}</td>
        <td>${esc(row.ano)}</td>
        <td><strong>${esc(row.codigo)}</strong></td>
        <td>${esc(row.objeto)}</td>
        <td>${esc(row.habilidade)}</td>
        <td>${esc(row.pagina)}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

function habilidadesAplicadasView() {
  const draft = habilidadeDraft();
  const errors = state.habilidadeErrors || {};
  const questionLimit = habilidadeQuestionLimit(draft.ano);
  const incorrectAlternatives = habilidadeAlternatives.filter((item) => item !== draft.alternativaCorreta);
  return `
    <section class="card">
      <div class="bncc-header">
        <div>
          <h3>Cadastro de questoes avaliativas</h3>
          <p class="muted">Formulario inteligente para vincular avaliacao, ano, disciplina, questao, descritor e analise pedagogica dos distratores.</p>
        </div>
        <span class="badge">Limite atual: ${questionLimit || "-"} questoes</span>
      </div>
      <form id="habilidadeForm" class="habilidade-form" novalidate>
        ${fieldSelect("avaliacao", "Avaliacao", draft.avaliacao, state.habilidadeOptions.avaliacoes || [], errors.avaliacao, "Selecione a avaliacao")}
        ${fieldSelect("ano", "Ano", draft.ano, habilidadeYears, errors.ano, "Selecione o ano")}
        ${fieldSelect("disciplina", "Disciplina", draft.disciplina, habilidadeDisciplines, errors.disciplina, "Selecione a disciplina")}
        <label class="${errors.questao ? "field-error" : ""}">Questao
          <select name="questao" data-habilidade-field="questao" required ${!draft.ano ? "disabled" : ""}>
            <option value="">${draft.ano ? "Selecione a questao" : "Selecione o ano primeiro"}</option>
            ${Array.from({ length: questionLimit || 0 }, (_, index) => index + 1).map((number) => `<option value="${number}" ${String(draft.questao) === String(number) ? "selected" : ""}>Q${number}</option>`).join("")}
          </select>
          ${helpText(errors.questao || (draft.ano ? `Este ano permite até ${questionLimit} questoes.` : "O limite sera definido automaticamente pelo ano selecionado."))}
        </label>
        <label class="span-2 ${errors.objetoConhecimento ? "field-error" : ""}">Objeto do Conhecimento
          <textarea name="objetoConhecimento" data-habilidade-field="objetoConhecimento" required rows="4" placeholder="Descreva o objeto do conhecimento avaliado.">${esc(draft.objetoConhecimento)}</textarea>
          ${helpText(errors.objetoConhecimento)}
        </label>
        <label class="${errors.descritorUsado ? "field-error" : ""}">Descritor Usado
          <input name="descritorUsado" data-habilidade-field="descritorUsado" required value="${esc(draft.descritorUsado)}" placeholder="Ex.: D01, D05, habilidade do Currículo Municipal...">
          ${helpText(errors.descritorUsado)}
        </label>
        ${fieldSelect("alternativaCorreta", "Alternativa Correta", draft.alternativaCorreta, habilidadeAlternatives, errors.alternativaCorreta, "Selecione")}
        <section class="span-2 distractor-panel">
          <h3>Analise dos Distratores</h3>
          <p class="muted">A alternativa correta fica oculta automaticamente. Preencha apenas as alternativas incorretas.</p>
          <div class="distractor-grid">
            ${draft.alternativaCorreta ? incorrectAlternatives.map((alternative) => `
              <label class="${errors[`distrator_${alternative}`] ? "field-error" : ""}">Analise da alternativa ${alternative}
                <textarea name="distrator_${alternative}" data-distractor="${alternative}" required rows="3" placeholder="Explique o possivel erro, habilidade fragilizada ou raciocinio do estudante.">${esc(draft.analiseDistratores?.[alternative] || "")}</textarea>
                ${helpText(errors[`distrator_${alternative}`])}
              </label>`).join("") : `<div class="empty-box">Selecione a alternativa correta para carregar automaticamente os campos de analise.</div>`}
          </div>
        </section>
        <div class="toolbar span-2">
          <button class="primary" type="submit">Salvar cadastro</button>
          <button type="button" id="resetHabilidadeForm">Limpar formulario</button>
        </div>
      </form>
    </section>
    <section class="card">
      <h3>Habilidades aplicadas cadastradas</h3>
      <div class="table-wrap"><table><thead><tr><th>Avaliacao</th><th>Ano</th><th>Disciplina</th><th>Questao</th><th>Descritor</th><th>Alternativa</th><th>Criado em</th></tr></thead><tbody>
        ${state.habilidadesAplicadas.length ? state.habilidadesAplicadas.map((item) => `<tr><td>${esc(item.avaliacao)}</td><td>${esc(item.ano)}</td><td>${esc(item.disciplina)}</td><td>Q${esc(item.questao)}</td><td>${esc(item.descritorUsado)}</td><td><span class="badge">${esc(item.alternativaCorreta)}</span></td><td>${date(item.criadoEm)}</td></tr>`).join("") : "<tr><td colspan='7'>Nenhum cadastro realizado.</td></tr>"}
      </tbody></table></div>
    </section>`;
}

function qualityView() {
  const q = state.quality;
  return `
    ${filtersHtml()}
    <section class="card">
      <h3>Qualidade dos dados</h3>
      ${q ? `<p>Total analisado: <strong>${q.total}</strong> | Chaves duplicadas: <strong>${q.duplicates}</strong></p>
      <div class="table-wrap"><table><thead><tr><th>Campo</th><th>Vazios</th></tr></thead><tbody>
        ${Object.entries(q.emptyByField).map(([field, count]) => `<tr><td>${field}</td><td>${count}</td></tr>`).join("") || "<tr><td colspan='2'>Sem campos obrigatorios vazios.</td></tr>"}
      </tbody></table></div>` : "<p>Carregando...</p>"}
    </section>`;
}

function compareView() {
  const comparison = state.comparison;
  return `
    ${filtersHtml()}
    <section class="card">
      <h3>Comparação entre avaliacoes</h3>
      <p class="muted">Selecione uma ou mais avaliacoes no filtro Avaliacao. A tabela cria uma coluna para cada avaliacao marcada, permitindo comparar a mesma unidade em momentos diferentes.</p>
      <canvas id="compareChart"></canvas>
      ${comparisonTable(comparison)}
    </section>`;
}

function importView() {
  return `
    <section class="admin-grid">
      <div class="card">
        <h3>Importar planilha Excel</h3>
        ${state.importStats ? `<div class="import-summary">
          <div><strong>${state.importStats.totalAlunos}</strong><span>Total atual da base</span></div>
          <div><strong>${state.importStats.acertos}</strong><span>Acertos na base</span></div>
          <div><strong>${state.importStats.percentualAcertos}%</strong><span>Percentual geral</span></div>
        </div>` : ""}
        <form id="importForm" class="form-grid">
          <label>Arquivo .xlsx <input name="file" type="file" accept=".xlsx" required></label>
          <div class="toolbar"><button class="primary" type="submit">Conferir planilha</button></div>
        </form>
        <div id="previewArea"></div>
      </div>
      <div class="card">
        <h3>Logs de importação</h3>
        <div class="table-wrap"><table><thead><tr><th>Arquivo</th><th>Total</th><th>Novos</th><th>Atualizados</th><th>Data</th><th>Acoes</th></tr></thead><tbody>
          ${state.imports.length ? state.imports.map((i) => `<tr><td>${esc(i.nomeArquivo)}</td><td>${i.quantidadeRegistros}</td><td>${i.novosRegistros ?? i.quantidadeRegistros}</td><td>${i.registrosAtualizados ?? 0}</td><td>${date(i.criadaEm)}</td><td><button class="danger" data-delete-import="${i.id}">Excluir</button></td></tr>`).join("") : "<tr><td colspan='6'>Nenhuma importacao registrada.</td></tr>"}
        </tbody></table></div>
      </div>
    </section>`;
}

function adminView() {
  const editingUser = state.users.find((user) => user.id === state.editingUserId);
  const submitLabel = editingUser ? "Salvar alteracoes" : "Cadastrar usuario";
  const passwordAttrs = editingUser ? 'placeholder="Preencha apenas se desejar alterar"' : "required";
  return `
    <section class="admin-grid">
      <div class="card">
        <h3>Usuarios</h3>
        <form id="userForm" class="form-grid">
          <label>Unidade escolar <input name="unidadeEscolar" required value="${esc(editingUser?.unidadeEscolar || "")}"></label>
          <label>E-mail <input name="email" type="email" required value="${esc(editingUser?.email || "")}"></label>
          <label>Senha <input name="senha" type="password" ${passwordAttrs}></label>
          <label>Perfil <select name="perfil">
            ${["ADMINISTRADOR", "GESTOR SEMED", "GESTOR UNIDADE"].map((perfil) => `<option ${editingUser?.perfil === perfil ? "selected" : ""}>${perfil}</option>`).join("")}
          </select></label>
          <label>Status <select name="ativo">
            <option value="true" ${editingUser?.ativo !== false ? "selected" : ""}>Ativo</option>
            <option value="false" ${editingUser?.ativo === false ? "selected" : ""}>Inativo</option>
          </select></label>
          <div class="toolbar">
            <button class="primary" type="submit">${submitLabel}</button>
            ${editingUser ? `<button type="button" id="cancelUserEdit">Cancelar edicao</button>` : ""}
          </div>
        </form>
        ${usersTable()}
      </div>
      <div class="card">
        <h3>Permissoes de telas</h3>
        <div id="permissionsBox">${permissionsHtml()}</div>
        <div class="toolbar"><button class="primary" id="savePermissions">Salvar permissoes</button></div>
      </div>
      <div class="card">
        <h3>Auditoria</h3>
        <div class="table-wrap"><table><thead><tr><th>Acao</th><th>Usuario</th><th>Data</th></tr></thead><tbody>
          ${state.logs.map((l) => `<tr><td>${esc(l.acao)}</td><td>${esc(l.usuarioEmail || "")}</td><td>${date(l.criadoEm)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>
    </section>`;
}

function permissionsHtml() {
  const roles = Object.keys(state.adminPermissions?.permissions || state.permissionsByRole || {});
  const data = state.adminPermissions?.permissions || {};
  const labels = {
    dashboard: "Dashboard",
    analise: "Análise diagnóstica",
    bncc: "Habilidades BNCC",
    habilidadesAplicadas: "Cadastro de habilidades",
    admin: "Painel administrativo",
    importacoes: "Importações",
    relatorios: "Relatórios",
    qualidade: "Qualidade dos dados",
    comparativo: "Comparativo",
  };
  return `<div class="permissions-grid">${roles.map((role) => `
    <section class="permission-card">
      <header>
        <strong>${esc(role)}</strong>
        <span>${(state.adminPermissions?.screens || []).filter((screen) => data[role]?.[screen] !== false).length} telas ativas</span>
      </header>
      <div class="permission-list">
        ${(state.adminPermissions?.screens || []).map((screen) => `
          <label class="permission-row">
            <input type="checkbox" data-role="${role}" data-screen="${screen}" ${data[role]?.[screen] !== false ? "checked" : ""}>
            <span>${esc(labels[screen] || screen)}</span>
          </label>`).join("")}
      </div>
    </section>`).join("")}</div>`;
}

function usersTable() {
  return `<div class="table-wrap"><table><thead><tr><th>E-mail</th><th>Perfil</th><th>Unidade</th><th>Status</th><th>Acoes</th></tr></thead><tbody>
    ${state.users.map((u) => `<tr>
      <td>${esc(u.email)}</td><td><span class="badge">${esc(u.perfil)}</span></td><td>${esc(u.unidadeEscolar || "")}</td>
      <td class="${u.ativo ? "status-on" : "status-off"}">${u.ativo ? "Ativo" : "Inativo"}</td>
      <td class="row-actions">
        <button data-edit-user="${u.id}">Editar</button>
        <button data-toggle-user="${u.id}">${u.ativo ? "Inativar" : "Ativar"}</button>
      </td>
    </tr>`).join("")}
  </tbody></table></div>`;
}

function habilidadeDraft() {
  state.habilidadeDraft ||= {};
  state.habilidadeDraft.analiseDistratores ||= {};
  return state.habilidadeDraft;
}

function fieldSelect(name, label, value, options, error, placeholder) {
  return `<label class="${error ? "field-error" : ""}">${label}
    <select name="${name}" data-habilidade-field="${name}" required>
      <option value="">${esc(placeholder || "Selecione")}</option>
      ${options.map((option) => `<option value="${esc(option)}" ${String(value || "") === String(option) ? "selected" : ""}>${esc(option)}</option>`).join("")}
    </select>
    ${helpText(error)}
  </label>`;
}

function helpText(text) {
  return text ? `<span class="field-help">${esc(text)}</span>` : "";
}

function habilidadeQuestionLimit(year) {
  return habilidadeQuestionLimits[year] || 0;
}

function validateHabilidadeDraft() {
  const draft = habilidadeDraft();
  const errors = {};
  const required = {
    avaliacao: "Selecione a avaliação.",
    ano: "Selecione o ano.",
    disciplina: "Selecione a disciplina.",
    questao: "Selecione a questão.",
    objetoConhecimento: "Informe o objeto do conhecimento.",
    descritorUsado: "Informe o descritor usado.",
    alternativaCorreta: "Selecione a alternativa correta.",
  };
  for (const [field, message] of Object.entries(required)) {
    if (!String(draft[field] || "").trim()) errors[field] = message;
  }
  const limit = habilidadeQuestionLimit(draft.ano);
  const question = Number(draft.questao);
  if (draft.ano && (!Number.isInteger(question) || question < 1 || question > limit)) {
    errors.questao = `O ${draft.ano} permite até ${limit} questões.`;
  }
  if (draft.alternativaCorreta) {
    for (const alternative of habilidadeAlternatives.filter((item) => item !== draft.alternativaCorreta)) {
      if (!String(draft.analiseDistratores?.[alternative] || "").trim()) {
        errors[`distrator_${alternative}`] = `Informe a analise da alternativa ${alternative}.`;
      }
    }
  }
  state.habilidadeErrors = errors;
  return errors;
}

function tableHtml(rows) {
  if (!rows.length) return "";
  return `<div class="table-wrap"><table><thead><tr>
    <th>Unidade</th><th>Turma</th><th>Ano</th><th>Disciplina</th><th>Nivel</th><th>Inclusao</th><th>Alunos</th><th>Acertos</th><th>Pontos possíveis</th><th>%</th>
  </tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.unidade)}</td><td>${esc(r.turma)}</td><td>${esc(r.ano)}</td><td>${esc(r.disciplina)}</td><td>${levelBadge(r.nivel)}</td><td>${esc(r.inclusao)}</td><td>${r.alunos}</td><td>${r.acertos}</td><td>${r.pontosPossiveis}</td><td><strong>${r.percentual}%</strong></td></tr>`).join("")}
  </tbody></table></div>`;
}

function levelBadge(level) {
  const color = colorForLevel(level);
  return `<span class="level-badge" style="--level-color:${color}">${esc(level)}</span>`;
}

function normalizeLevel(level) {
  return String(level || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function colorForLevel(level) {
  return levelColors[normalizeLevel(level)] || "#667085";
}

function colorForDiscipline(discipline) {
  const value = normalizeLevel(discipline);
  if (value.includes("PORTUGUES")) return "#0057d9";
  if (value.includes("MATEMATICA")) return "#16a34a";
  return "#7c3aed";
}

function emptyState() {
  if (state.loading) return `<div class="loading-box">Carregando dados relacionados aos filtros selecionados...</div>`;
  if (!state.rows.length && Object.keys(state.filters).length) {
    return `<div class="empty-box">Nenhum resultado encontrado para os filtros selecionados.</div>`;
  }
  return "";
}

function diagnosticCards(items = []) {
  const normalized = items.map((item) => ({
    ...item,
    tipo: item.tipo || item.prioridade || "Atenção",
    titulo: item.titulo || `${item.label || item.questao || "Item"}${item.percentual !== undefined ? ` - ${item.percentual}%` : ""}`,
    indicacao: item.indicacao || item.texto || `${item.label || item.questao || "Item"} requer acompanhamento pedagógico a partir dos resultados filtrados.`,
  }));
  const active = normalized[state.activeDiagnosticIndex] || normalized[0];
  return `<div class="diagnostic-buttons">${normalized.map((item, index) => `
    <button data-diagnostic-index="${index}" class="${index === state.activeDiagnosticIndex ? "active" : ""}">
      <span class="badge">${esc(item.tipo)}</span>
      <strong>${esc(item.titulo)}</strong>
    </button>`).join("")}</div>
    ${active ? `<article class="diagnostic-item diagnostic-detail">
      <span class="badge">${esc(active.tipo)}</span>
      <strong>${esc(active.titulo)}</strong>
      <p>${esc(active.indicacao)}</p>
    </article>` : `<div class="empty-box">Nenhum ponto prioritario encontrado.</div>`}`;
}

function miniTable(title, rows, columns) {
  return `<section class="card no-shadow"><h3>${title}</h3><div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${labelFor(c)}</th>`).join("")}</tr></thead><tbody>
    ${rows.map((row) => `<tr>${columns.map((c) => `<td>${esc(row[c])}${c === "percentual" ? "%" : ""}</td>`).join("")}</tr>`).join("")}
  </tbody></table></div></section>`;
}

function labelFor(key) {
  return ({ label: "Item", percentual: "%", avaliados: "Avaliados", alunos: "Alunos" })[key] || key;
}

function bind() {
  document.querySelector("#loginForm")?.addEventListener("submit", login);
  document.querySelector("#logout")?.addEventListener("click", logout);
  document.querySelector("#backPage")?.addEventListener("click", goBack);
  document.querySelectorAll("[data-report-mode]").forEach((button) => button.addEventListener("click", async () => {
    state.reportMode = button.dataset.reportMode;
    state.rows = [];
    state.statistics = null;
    state.analysis = null;
    state.questionAnalysis = null;
    state.dashboard = null;
    clearApiCache();
    state.loading = true;
    render();
    await loadCurrent();
  }));
  document.querySelectorAll("[data-diagnostic-index]").forEach((button) => button.addEventListener("click", () => {
    state.activeDiagnosticIndex = Number(button.dataset.diagnosticIndex || 0);
    render();
  }));
  document.querySelectorAll("[data-answer-info]").forEach((button) => button.addEventListener("click", () => {
    state.questionAnswerSelection ||= {};
    const id = button.dataset.answerInfo;
    const alternative = button.dataset.answerAlternative;
    state.questionAnswerSelection[id] = state.questionAnswerSelection[id] === alternative ? "" : alternative;
    render();
  }));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", async () => {
    if (state.view !== button.dataset.view) {
      state.viewHistory.push(state.view);
    }
    state.view = button.dataset.view;
    await loadCurrent();
  }));
  document.querySelectorAll("[data-filter]").forEach((select) => select.addEventListener("change", handleFilterChange));
  document.querySelectorAll("[data-question-filter]").forEach((select) => select.addEventListener("change", handleQuestionFilterChange));
  document.querySelector("#clearFilters")?.addEventListener("click", async () => {
    state.filters = {};
    state.loading = true;
    render();
    await loadCurrent();
  });
  document.querySelector("#clearQuestionFilters")?.addEventListener("click", async () => {
    for (const key of questionAnalysisFilterOrder) delete state.filters[key];
    state.showQuestionImmersion = false;
    state.loading = true;
    render();
    await loadCurrent();
  });
  document.querySelector("#pdfReport")?.addEventListener("click", () => download(`/reports/pdf?${query()}`, "relatorio-avd.pdf"));
  document.querySelector("#questionAnalysisPdf")?.addEventListener("click", () => download(`/analysis/questions/pdf?${query()}`, "relatorio-analise-diagnostica-questoes.pdf"));
  document.querySelector("#questionImmersion")?.addEventListener("click", () => {
    state.showQuestionImmersion = !state.showQuestionImmersion;
    render();
  });
  document.querySelector("#printImmersion")?.addEventListener("click", () => {
    document.body.classList.add("print-immersion");
    const cleanup = () => document.body.classList.remove("print-immersion");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 2000);
  });
  document.querySelector("#exportCsv")?.addEventListener("click", () => download(`/export/excel?${query()}`, "exportacao-avd.csv"));
  document.querySelector("#printPage")?.addEventListener("click", () => window.print());
  document.querySelector("#userForm")?.addEventListener("submit", saveUser);
  document.querySelector("#cancelUserEdit")?.addEventListener("click", () => {
    state.editingUserId = "";
    render();
  });
  document.querySelectorAll("[data-edit-user]").forEach((button) => button.addEventListener("click", () => editUser(button.dataset.editUser)));
  document.querySelectorAll("[data-toggle-user]").forEach((button) => button.addEventListener("click", () => toggleUser(button.dataset.toggleUser)));
  document.querySelector("#savePermissions")?.addEventListener("click", savePermissions);
  document.querySelector("#importForm")?.addEventListener("submit", previewImport);
  document.querySelectorAll("[data-delete-import]").forEach((button) => button.addEventListener("click", () => deleteImport(button.dataset.deleteImport)));
  document.querySelector("#habilidadeForm")?.addEventListener("submit", saveHabilidadeAplicada);
  document.querySelector("#resetHabilidadeForm")?.addEventListener("click", () => {
    state.habilidadeDraft = {};
    state.habilidadeErrors = {};
    render();
  });
  document.querySelectorAll("[data-habilidade-field]").forEach((field) => field.addEventListener("input", handleHabilidadeField));
  document.querySelectorAll("[data-distractor]").forEach((field) => field.addEventListener("input", handleDistractorField));
}

function handleHabilidadeField(event) {
  const draft = habilidadeDraft();
  const field = event.target.dataset.habilidadeField;
  draft[field] = event.target.value;
  if (field === "ano") {
    const limit = habilidadeQuestionLimit(draft.ano);
    if (Number(draft.questao) > limit) draft.questao = "";
  }
  if (field === "alternativaCorreta") {
    delete draft.analiseDistratores[draft.alternativaCorreta];
  }
  validateHabilidadeDraft();
  if (["ano", "alternativaCorreta"].includes(field)) render();
  else updateHabilidadeFieldState(field);
}

function handleDistractorField(event) {
  const draft = habilidadeDraft();
  draft.analiseDistratores[event.target.dataset.distractor] = event.target.value;
  validateHabilidadeDraft();
  updateHabilidadeFieldState(`distrator_${event.target.dataset.distractor}`);
}

function updateHabilidadeFieldState(field) {
  const error = state.habilidadeErrors[field];
  const selector = field.startsWith("distrator_")
    ? `[data-distractor="${field.replace("distrator_", "")}"]`
    : `[data-habilidade-field="${field}"]`;
  const input = document.querySelector(selector);
  const label = input?.closest("label");
  if (!label) return;
  label.classList.toggle("field-error", Boolean(error));
  let help = label.querySelector(".field-help");
  if (!help && error) {
    help = document.createElement("span");
    help.className = "field-help";
    label.appendChild(help);
  }
  if (help) {
    help.textContent = error || "";
    if (!error) help.remove();
  }
}

async function handleFilterChange(event) {
  const key = event.target.dataset.filter;
  const value = key === "avaliacao"
    ? [...event.target.selectedOptions].map((option) => option.value).filter(Boolean)
    : event.target.value;
  if (Array.isArray(value) ? value.length : value) state.filters[key] = value;
  else delete state.filters[key];
  clearChildFilters(key);
  state.loading = true;
  render();
  await scheduleLoadCurrent();
}

async function handleQuestionFilterChange(event) {
  const key = event.target.dataset.questionFilter;
  const value = key === "avaliacao"
    ? [...event.target.selectedOptions].map((option) => option.value).filter(Boolean)
    : event.target.value;
  if (Array.isArray(value) ? value.length : value) state.filters[key] = value;
  else delete state.filters[key];
  clearQuestionChildFilters(key);
  state.loading = true;
  render();
  await scheduleLoadCurrent();
}

function scheduleLoadCurrent() {
  const loadId = ++currentLoadId;
  if (pendingLoadTimer) clearTimeout(pendingLoadTimer);
  return new Promise((resolve) => {
    pendingLoadTimer = setTimeout(async () => {
      pendingLoadTimer = null;
      if (loadId !== currentLoadId) return resolve();
      await loadCurrent(loadId);
      resolve();
    }, 160);
  });
}

function clearQuestionChildFilters(parentKey) {
  const index = questionAnalysisFilterOrder.indexOf(parentKey);
  if (index < 0) return;
  for (const child of questionAnalysisFilterOrder.slice(index + 1)) delete state.filters[child];
}

function clearChildFilters(parentKey) {
  const index = filterOrder.indexOf(parentKey);
  if (index < 0) return;
  for (const child of filterOrder.slice(index + 1)) delete state.filters[child];
}

function applyOptionsPayload(payload) {
  state.options = payload.options || payload || {};
  state.optionTotal = payload.total || 0;
  removeInvalidSelections();
}

function removeInvalidSelections() {
  let changedAt = -1;
  for (const key of filterOrder) {
    const allowed = state.options[key] || [];
    if (Array.isArray(state.filters[key])) {
      const kept = state.filters[key].filter((value) => allowed.includes(value));
      if (kept.length !== state.filters[key].length) {
        if (kept.length) state.filters[key] = kept;
        else delete state.filters[key];
        changedAt = filterOrder.indexOf(key);
        break;
      }
    } else if (state.filters[key] && !allowed.includes(state.filters[key])) {
      changedAt = filterOrder.indexOf(key);
      delete state.filters[key];
      break;
    }
  }
  if (changedAt >= 0) {
    for (const child of filterOrder.slice(changedAt + 1)) delete state.filters[child];
  }
}

async function goBack() {
  state.view = "dashboard";
  state.viewHistory = [];
  state.filters = {};
  state.reportMode = "padrao";
  state.showQuestionImmersion = false;
  state.activeDiagnosticIndex = 0;
  await loadCurrent();
}

async function login(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    const result = await api("/auth/login", { method: "POST", body: data, auth: false });
    state.token = result.token;
    state.refreshToken = result.refreshToken;
    state.user = result.user;
    state.permissions = result.permissions;
    localStorage.setItem("token", state.token);
    localStorage.setItem("refreshToken", state.refreshToken);
    await loadDashboard();
  } catch (error) {
    state.error = error.message;
  }
  render();
}

async function logout() {
  try { await api("/auth/logout", { method: "POST", body: { refreshToken: state.refreshToken } }); } catch {}
  logoutLocal();
  render();
}

function logoutLocal() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  Object.assign(state, { token: null, refreshToken: null, user: null, dashboard: null, rows: [], filters: {}, options: {} });
}

async function loadCurrent(loadId = ++currentLoadId) {
  try {
    if (state.view === "admin") await loadAdmin();
    else if (state.view === "importacoes") await loadImports();
    else if (state.view === "qualidade") await loadQuality();
    else if (state.view === "analise") await loadAnalysis();
    else if (state.view === "analiseQuestoes") await loadQuestionAnalysis();
    else if (state.view === "relatorios") await loadReports();
    else if (state.view === "comparativo") await loadCompare();
    else if (state.view === "habilidadesAplicadas") await loadHabilidadesAplicadas();
    else if (state.view === "curriculoMunicipal") await loadCurriculoMunicipal();
    else await loadDashboard();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function loadCurriculoMunicipal() {
  if (!state.curriculoMunicipalData) {
    const response = await fetch(assetPath("curriculo-municipal-data.json"));
    if (!response.ok) throw new Error("Falha ao carregar o Currículo Municipal.");
    state.curriculoMunicipalData = await response.json();
  }
}

async function loadReports() {
  const qs = query();
  const optionsPayload = await api(`/options?${qs}`);
  applyOptionsPayload(optionsPayload);
  state.rows = [];
  state.statistics = null;
  state.analysis = null;
  state.questionAnalysis = null;
  state.dashboard = null;
  if (!hasReportFilters()) {
    return;
  }
  if (state.reportMode === "diagnostica") {
    const [analysisPayload, dashboardPayload] = await Promise.all([
      api(`/analysis?${qs}`),
      api(`/dashboard?${qs}`),
    ]);
    state.analysis = analysisPayload;
    state.dashboard = dashboardPayload;
    return;
  }
  if (state.reportMode === "questoes") {
    state.questionAnalysis = await api(`/analysis/questions?${qs}`);
    return;
  }
  if (state.reportMode === "estatistica" || state.reportMode === "estatística") {
    state.statistics = await api(`/statistics?${qs}`);
    return;
  }
  const recordsPayload = await api(`/records?limit=500&${qs}`);
  state.rows = recordsPayload.rows;
}

async function loadCompare() {
  const qs = query();
  const [optionsPayload, comparisonPayload, dashboardPayload] = await Promise.all([
    api(`/options?${qs}`),
    api(`/compare?${qs}`),
    api(`/dashboard?${qs}`),
  ]);
  applyOptionsPayload(optionsPayload);
  state.comparison = comparisonPayload;
  state.dashboard = dashboardPayload;
}

async function loadDashboard() {
  const qs = query();
  const [optionsPayload, dashboardPayload] = await Promise.all([
    api(`/options?${qs}`),
    api(`/dashboard?${qs}`),
  ]);
  applyOptionsPayload(optionsPayload);
  state.dashboard = dashboardPayload;
  state.rows = [];
}

async function loadQuality() {
  const qs = query();
  const [optionsPayload, qualityPayload] = await Promise.all([
    api(`/options?${qs}`),
    api(`/quality?${qs}`),
  ]);
  applyOptionsPayload(optionsPayload);
  state.quality = qualityPayload;
}

async function loadAnalysis() {
  const qs = query();
  const [optionsPayload, analysisPayload, dashboardPayload] = await Promise.all([
    api(`/options?${qs}`),
    api(`/analysis?${qs}`),
    api(`/dashboard?${qs}`),
  ]);
  applyOptionsPayload(optionsPayload);
  state.analysis = analysisPayload;
  state.dashboard = dashboardPayload;
}

async function loadQuestionAnalysis() {
  const qs = query();
  state.questionAnalysis = await api(`/analysis/questions?${qs}`);
}

async function loadImports() {
  const [importsPayload, dashboardPayload] = await Promise.all([
    api("/imports"),
    api("/dashboard"),
  ]);
  state.imports = importsPayload;
  state.importStats = dashboardPayload.kpis;
}

async function deleteImport(id) {
  const item = state.imports.find((entry) => entry.id === id);
  const ok = confirm(`Excluir a importacao "${item?.nomeArquivo || id}"?\n\nOs registros vinculados a essa importacao serao removidos da base e os totais serao recalculados.`);
  if (!ok) return;
  const result = await api(`/imports/${id}`, { method: "DELETE" });
  clearApiCache();
  state.message = `Importação excluída. Registros removidos: ${result.registrosRemovidos}.`;
  state.filters = {};
  await loadImports();
  if (result?.kpis) state.importStats = result.kpis;
  render();
}

async function loadAdmin() {
  state.users = await api("/admin/users");
  state.adminPermissions = await api("/admin/permissions");
  state.logs = await api("/logs");
}

async function loadHabilidadesAplicadas() {
  const [options, items] = await Promise.all([
    api("/habilidades-aplicadas/options"),
    api("/habilidades-aplicadas"),
  ]);
  state.habilidadeOptions = options;
  state.habilidadesAplicadas = items;
}

async function saveHabilidadeAplicada(event) {
  event.preventDefault();
  const errors = validateHabilidadeDraft();
  if (Object.keys(errors).length) {
    state.error = "Revise os campos destacados antes de salvar.";
    render();
    return;
  }
  const draft = habilidadeDraft();
  const body = {
    avaliacao: draft.avaliacao,
    ano: draft.ano,
    disciplina: draft.disciplina,
    questao: Number(draft.questao),
    objetoConhecimento: draft.objetoConhecimento,
    descritorUsado: draft.descritorUsado,
    alternativaCorreta: draft.alternativaCorreta,
    analiseDistratores: Object.fromEntries(
      habilidadeAlternatives
        .filter((alternative) => alternative !== draft.alternativaCorreta)
        .map((alternative) => [alternative, draft.analiseDistratores?.[alternative] || ""])
    ),
  };
  try {
    await api("/habilidades-aplicadas", { method: "POST", body });
    state.message = "Habilidade aplicada cadastrada com sucesso.";
    state.error = "";
    state.habilidadeDraft = {};
    state.habilidadeErrors = {};
    await loadHabilidadesAplicadas();
  } catch (error) {
    state.error = error.message;
  }
  render();
}

function editUser(id) {
  state.editingUserId = id;
  state.message = "Edicao de usuario carregada no formulario.";
  render();
  document.querySelector("#userForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveUser(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.target));
  body.ativo = body.ativo === "true";
  if (!body.senha) delete body.senha;
  if (state.editingUserId) {
    await api(`/admin/users/${state.editingUserId}`, { method: "PUT", body });
    state.message = "Usuario atualizado.";
    state.editingUserId = "";
  } else {
    await api("/admin/users", { method: "POST", body });
    state.message = "Usuario cadastrado.";
  }
  await loadAdmin();
  render();
}

async function toggleUser(id) {
  const user = state.users.find((u) => u.id === id);
  await api(`/admin/users/${id}`, { method: "PUT", body: { ativo: !user.ativo } });
  await loadAdmin();
  render();
}

async function savePermissions() {
  const permissions = structuredClone(state.adminPermissions.permissions);
  document.querySelectorAll("[data-role][data-screen]").forEach((box) => {
    permissions[box.dataset.role][box.dataset.screen] = box.checked;
  });
  await api("/admin/permissions", { method: "PUT", body: { permissions } });
  state.message = "Permissoes atualizadas.";
  await loadAdmin();
  render();
}

async function previewImport(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const previewArea = document.querySelector("#previewArea");
  previewArea.innerHTML = progressHtml(0);
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(progress + Math.max(2, Math.round((95 - progress) * 0.12)), 95);
    const bar = document.querySelector("#importProgressBar");
    const text = document.querySelector("#importProgressValue");
    if (bar && text) {
      bar.style.width = `${progress}%`;
      text.textContent = `${progress}%`;
    }
  }, 240);
  try {
    const result = await api("/imports/preview", { method: "POST", form });
    clearInterval(timer);
    const bar = document.querySelector("#importProgressBar");
    const text = document.querySelector("#importProgressValue");
    if (bar && text) {
      bar.style.width = "100%";
      text.textContent = "100%";
    }
    setTimeout(() => renderImportPreview(result, "schema"), 250);
  } catch (error) {
    clearInterval(timer);
    previewArea.innerHTML = `<div class="notice error">${esc(error.message)}</div>`;
  }
}

function renderImportPreview(result, activeTab) {
  const notifications = importNotifications(result);
  const tabs = [
    ["schema", "Configuração", notifications.schema.length],
    ["validation", "Validação", notifications.validation.length],
    ["duplicates", "Duplicidades", notifications.duplicates.length],
    ["columns", "Colunas", result.headers.length],
    ["sample", "Amostra", result.sample.length],
  ];
  document.querySelector("#previewArea").innerHTML = `
    <div class="notice ${notifications.schema.some((n) => n.severity === "erro" || n.severity === "alerta") ? "error" : ""}">
      Arquivo conferido: ${result.totalRows} registros. Alertas de configuração: ${notifications.schema.length}. Alertas de validação: ${notifications.validation.length}.
      ${result.ignoredColumnsAfterRaca?.length ? `<br>Colunas ignoradas após RAÇA: ${result.ignoredColumnsAfterRaca.length}.` : ""}
    </div>
    <div class="preview-actions">
      ${tabs.map(([key, label, count]) => `<button data-preview-tab="${key}" class="${activeTab === key ? "active" : ""}">${label}<span>${count}</span></button>`).join("")}
    </div>
    <div class="preview-table">
      ${previewTable(activeTab, result, notifications)}
    </div>
    <div class="toolbar"><button class="primary" id="commitImport">Importar definitivamente</button></div>`;
  document.querySelector("#commitImport").addEventListener("click", async () => {
    const button = document.querySelector("#commitImport");
    button.disabled = true;
    button.textContent = "Importando...";
    const stopProgress = startImportProgress("IMPORTANDO DADOS");
    try {
      const committed = await api("/imports/commit", { method: "POST", body: { previewId: result.previewId, force: false } });
      clearApiCache();
      stopProgress(100);
      state.message = "IMPORTAÇÃO DE DADOS EFETIVADA";
      state.filters = {};
      await loadImports();
      if (committed?.kpis) state.importStats = committed.kpis;
      state.view = "importacoes";
      setTimeout(() => render(), 250);
    } catch (error) {
      stopProgress(0);
      document.querySelector("#previewArea").innerHTML = `<div class="notice error">${esc(error.message)}</div>`;
    }
  });
  document.querySelectorAll("[data-preview-tab]").forEach((button) => {
    button.addEventListener("click", () => renderImportPreview(result, button.dataset.previewTab));
  });
}

function progressHtml(value) {
  return `
    <div class="import-progress">
      <div class="progress-title">ANÁLISE DOS DADOS EM ANDAMENTO</div>
      <div class="progress-track"><div id="importProgressBar" class="progress-bar" style="width: ${value}%"></div></div>
      <div id="importProgressValue" class="progress-value">${value}%</div>
    </div>`;
}

function startImportProgress(message) {
  const previewArea = document.querySelector("#previewArea");
  previewArea.innerHTML = `
    <div class="import-progress">
      <div class="progress-title">${esc(message)}</div>
      <div class="progress-track"><div id="importProgressBar" class="progress-bar" style="width: 0%"></div></div>
      <div id="importProgressValue" class="progress-value">0%</div>
    </div>`;
  let progress = 0;
  const timer = setInterval(() => {
    progress = Math.min(progress + Math.max(2, Math.round((95 - progress) * 0.12)), 95);
    updateImportProgress(progress);
  }, 240);
  return (finalValue) => {
    clearInterval(timer);
    updateImportProgress(finalValue);
  };
}

function updateImportProgress(value) {
  const bar = document.querySelector("#importProgressBar");
  const text = document.querySelector("#importProgressValue");
  if (bar && text) {
    bar.style.width = `${value}%`;
    text.textContent = `${value}%`;
  }
}

function importNotifications(result) {
  return {
    schema: result.schemaWarnings || [],
    validation: result.validationErrors || [],
    duplicates: result.duplicates ? [{ severity: "alerta", category: "Duplicidade", row: "-", column: "NOME/AVALIACAO/DISCIPLINA/TURMA/UNIDADE", message: `${result.duplicates} duplicidades detectadas na planilha.` }] : [],
  };
}

function previewTable(activeTab, result, notifications) {
  if (activeTab === "columns") {
    return simpleTable(["#", "Coluna"], result.headers.map((column, index) => [index + 1, column]));
  }
  if (activeTab === "sample") {
    const headers = result.headers.slice(0, 12);
    return simpleTable(headers, result.sample.slice(0, 12).map((row) => headers.map((header) => row[header] ?? "")));
  }
  const rows = notifications[activeTab] || [];
  if (!rows.length) return `<div class="empty-box">Nenhuma notificação para esta conferência.</div>`;
  return simpleTable(["Severidade", "Catégoria", "Linha", "Campo", "Mensagem"], rows.map((item) => [
    item.severity || "info",
    item.category || "Validação",
    item.row ?? "-",
    item.column || "-",
    item.message || "",
  ]));
}

function simpleTable(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>
    ${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}
  </tbody></table></div>`;
}

async function changePassword() {
  const currentPassword = prompt("Senha atual");
  const newPassword = prompt("Nova senha");
  if (!currentPassword || !newPassword) return;
  await api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
  state.message = "Senha alterada.";
  render();
}

async function api(url, options = {}) {
  if (!window.AVD_DB_REQUEST) throw new Error("Camada Supabase nao carregada. Confira supabase-init.js.");
  const method = options.method || "GET";
  const cacheKey = method === "GET" ? `${method}:${url}:${state.token || ""}` : "";
  if (cacheKey && apiCache.has(cacheKey)) return structuredClone(apiCache.get(cacheKey));
  try {
    const result = await window.AVD_DB_REQUEST(method, url, options.body || options.form, { token: state.token, auth: options.auth !== false });
    if (cacheKey) apiCache.set(cacheKey, structuredClone(result));
    if (method !== "GET") clearApiCache();
    return result;
  } catch (error) {
    const message = error?.error || error?.message || "Falha na requisicao.";
    throw new Error(error?.detail ? `${message} ${error.detail}` : message);
  }
}

function clearApiCache() {
  apiCache.clear();
}

function assetPath(fileName) {
  return new URL(fileName, APP_ASSET_BASE).href;
}

function drawCharts() {
  if (state.dashboard) {
    drawBars("levelChart", state.dashboard.alunosPorNivel, "value", { suffix: " alunos", levelPalette: true });
    const unitData = state.dashboard.rankingUnidades;
    if (unitData.some((item) => item.unidade && item.disciplina)) {
      drawGroupedBars("unitChart", unitData, "percentual", { suffix: "%", compact: true });
    } else {
      drawBars("unitChart", unitData.slice(0, 20), "percentual", { suffix: "%", color: "#0057d9", compact: true });
    }
    drawBars("questionChart", state.dashboard.desempenhoPorQuestao, "percentual", { suffix: "%", color: "#b54708", compact: true });
    drawDonut("donutChart", state.dashboard.distribuicaoPercentualNivel, { levelPalette: true });
    drawBars("compareChart", state.dashboard.rankingUnidades.slice(0, 10), "percentual", { suffix: "%", color: "#0057d9" });
  }
  if (state.statistics) {
    drawBars("statsLevelChart", state.statistics.distribuicaoNivel, "value", { suffix: " alunos", levelPalette: true });
    drawBars("statsQuestionChart", state.statistics.questoes, "percentual", { suffix: "%", color: "#b54708", compact: true });
  }
  if (state.questionAnalysis) {
    drawBars("questionDiagnosticChart", consolidatedQuestionRows(state.questionAnalysis.rows || []).map((row) => ({ ...row, label: row.questao })), "percentual", { suffix: "%", color: "#b54708", compact: true });
  }
}

function drawBars(id, data, key, options = {}) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const render = (hoverIndex = -1) => {
    const ctx = setupCanvas(canvas);
    const cssW = canvas.clientWidth || 640;
    const cssH = canvas.clientHeight || 360;
    if (!data.length) {
      updateChartRegistry(id, { bars: [] });
      return drawNoData(ctx, cssW, cssH);
    }
    const max = Math.max(...data.map((d) => Number(d[key] || 0)), 1);
    const padL = 44, padR = 18, padT = 26, padB = 128;
    const bars = [];
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "#d7dde5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, cssH - padB);
    ctx.lineTo(cssW - padR, cssH - padB);
    ctx.stroke();
    ctx.fillStyle = "#667085";
    ctx.font = "11px Segoe UI";
    for (let i = 0; i <= 4; i += 1) {
      const value = (max / 4) * i;
      const y = cssH - padB - ((cssH - padT - padB) * i) / 4;
      ctx.fillText(formatNumber(value), 6, y + 3);
      ctx.strokeStyle = "#edf0f4";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(cssW - padR, y);
      ctx.stroke();
    }
    data.forEach((d, i) => {
      const slot = (cssW - padL - padR) / Math.max(data.length, 1);
      const bw = Math.max(slot * 0.62, 8);
      const x = padL + i * slot + (slot - bw) / 2;
      const bh = (cssH - padT - padB) * (Number(d[key] || 0) / max);
      const y = cssH - padB - bh;
      const active = i === hoverIndex;
      const color = options.levelPalette ? colorForLevel(d.label) : options.disciplinePalette && d.disciplina ? colorForDiscipline(d.disciplina) : shade(options.color || "#0038a8", i);
      const drawX = active ? x - 4 : x;
      const drawY = active ? Math.max(padT, y - 8) : y;
      const drawW = active ? bw + 8 : bw;
      const drawH = active ? bh + 8 : bh;
      bars.push({ x, y, w: bw, h: Math.max(bh, 4), index: i, item: d });
      ctx.fillStyle = color;
      if (active) {
        ctx.shadowColor = "rgba(29, 36, 48, .24)";
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;
      }
      roundRect(ctx, drawX, drawY, drawW, drawH, 6);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = "#1d2430";
      ctx.font = active ? "bold 12px Segoe UI" : "bold 11px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(`${formatNumber(d[key])}${options.suffix || ""}`, x + bw / 2, Math.max(14, y - 6));
      ctx.fillStyle = active ? color : "#344054";
      ctx.font = active ? "bold 11px Segoe UI" : "11px Segoe UI";
      ctx.save();
      ctx.translate(x + bw / 2, cssH - padB + 18);
      ctx.rotate(-0.55);
      ctx.textAlign = "right";
      ctx.fillText(String(d.label).slice(0, options.compact ? 8 : 18), 0, 0);
      ctx.restore();
      if (active) {
        drawTooltip(ctx, `${d.label}: ${formatNumber(d[key])}${options.suffix || ""}`, cssW, x + bw / 2, drawY - 10);
      }
    });
    const legendItems = options.levelPalette
      ? data.slice(0, 6).map((item) => ({ label: item.label, color: colorForLevel(item.label) }))
      : options.disciplinePalette && data.some((item) => item.disciplina)
        ? [...new Map(data.filter((item) => item.disciplina).map((item) => [item.disciplina, { label: item.disciplina, color: colorForDiscipline(item.disciplina) }])).values()]
        : [{ label: options.suffix === "%" ? "Percentual de acertos" : "Quantidade de alunos", color: options.color || "#0038a8" }];
    drawLegend(ctx, legendItems, cssW, cssH);
    updateChartRegistry(id, { bars });
  };
  const hoverIndex = chartRegistry.get(id)?.hoverIndex ?? -1;
  render(hoverIndex);
  bindChartHover(canvas, render, (point) => {
    const bars = chartRegistry.get(id)?.bars || [];
    const hit = bars.find((bar) => point.x >= bar.x && point.x <= bar.x + bar.w && point.y >= bar.y && point.y <= bar.y + bar.h);
    return hit ? hit.index : -1;
  });
}

function drawGroupedBars(id, data, key, options = {}) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const render = (hoverIndex = -1) => {
    const ctx = setupCanvas(canvas);
    const cssW = canvas.clientWidth || 640;
    const cssH = canvas.clientHeight || 360;
    if (!data.length) {
      updateChartRegistry(id, { bars: [] });
      return drawNoData(ctx, cssW, cssH);
    }
    const units = [...new Set(data.map((item) => item.unidade || item.label).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
    const preferred = ["LINGUA PORTUGUESA", "MATEMATICA"];
    const disciplines = [...new Set(data.map((item) => item.disciplina).filter(Boolean))]
      .sort((a, b) => {
        const ia = preferred.indexOf(normalizeLevel(a));
        const ib = preferred.indexOf(normalizeLevel(b));
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return String(a).localeCompare(String(b), "pt-BR");
      });
    const max = Math.max(...data.map((d) => Number(d[key] || 0)), 1);
    const padL = 44, padR = 18, padT = 26, padB = 132;
    const bars = [];
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "#d7dde5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, cssH - padB);
    ctx.lineTo(cssW - padR, cssH - padB);
    ctx.stroke();
    ctx.fillStyle = "#667085";
    ctx.font = "11px Segoe UI";
    for (let i = 0; i <= 4; i += 1) {
      const value = (max / 4) * i;
      const y = cssH - padB - ((cssH - padT - padB) * i) / 4;
      ctx.fillText(formatNumber(value), 6, y + 3);
      ctx.strokeStyle = "#edf0f4";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(cssW - padR, y);
      ctx.stroke();
    }
    const slot = (cssW - padL - padR) / Math.max(units.length, 1);
    const groupW = Math.min(slot * 0.74, 120);
    const gap = 5;
    const bw = Math.max((groupW - gap * Math.max(disciplines.length - 1, 0)) / Math.max(disciplines.length, 1), 8);
    let barIndex = 0;
    units.forEach((unit, unitIndex) => {
      const baseX = padL + unitIndex * slot + (slot - groupW) / 2;
      disciplines.forEach((discipline, disciplineIndex) => {
        const item = data.find((entry) => entry.unidade === unit && entry.disciplina === discipline) || { unidade: unit, disciplina, label: unit, [key]: 0 };
        const value = Number(item[key] || 0);
        const bh = (cssH - padT - padB) * (value / max);
        const x = baseX + disciplineIndex * (bw + gap);
        const y = cssH - padB - bh;
        const active = barIndex === hoverIndex;
        const color = colorForDiscipline(discipline);
        const drawX = active ? x - 3 : x;
        const drawY = active ? Math.max(padT, y - 8) : y;
        const drawW = active ? bw + 6 : bw;
        const drawH = active ? bh + 8 : bh;
        bars.push({ x, y, w: bw, h: Math.max(bh, 4), index: barIndex, item });
        ctx.fillStyle = color;
        if (active) {
          ctx.shadowColor = "rgba(29, 36, 48, .24)";
          ctx.shadowBlur = 14;
          ctx.shadowOffsetY = 6;
        }
        roundRect(ctx, drawX, drawY, drawW, drawH, 6);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        if (value > 0) {
          ctx.fillStyle = "#1d2430";
          ctx.font = active ? "bold 12px Segoe UI" : "bold 11px Segoe UI";
          ctx.textAlign = "center";
          ctx.fillText(`${formatNumber(value)}${options.suffix || ""}`, x + bw / 2, Math.max(14, y - 6));
        }
        if (active) drawTooltip(ctx, `${unit} | ${discipline}: ${formatNumber(value)}${options.suffix || ""}`, cssW, x + bw / 2, drawY - 10);
        barIndex += 1;
      });
      ctx.fillStyle = "#344054";
      ctx.font = "11px Segoe UI";
      ctx.save();
      ctx.translate(padL + unitIndex * slot + slot / 2, cssH - padB + 22);
      ctx.rotate(-0.55);
      ctx.textAlign = "right";
      ctx.fillText(String(unit).slice(0, 20), 0, 0);
      ctx.restore();
    });
    drawLegend(ctx, disciplines.map((discipline) => ({ label: discipline, color: colorForDiscipline(discipline) })), cssW, cssH);
    updateChartRegistry(id, { bars });
  };
  const hoverIndex = chartRegistry.get(id)?.hoverIndex ?? -1;
  render(hoverIndex);
  bindChartHover(canvas, render, (point) => {
    const bars = chartRegistry.get(id)?.bars || [];
    const hit = bars.find((bar) => point.x >= bar.x && point.x <= bar.x + bar.w && point.y >= bar.y && point.y <= bar.y + bar.h);
    return hit ? hit.index : -1;
  });
}

function drawDonut(id, data, options = {}) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const render = (hoverIndex = -1) => {
    const ctx = setupCanvas(canvas);
    const cssW = canvas.clientWidth || 640;
    const cssH = canvas.clientHeight || 360;
    if (!data.length) {
      updateChartRegistry(id, { slices: [] });
      return drawNoData(ctx, cssW, cssH);
    }
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const colors = ["#0038a8", "#0057d9", "#4f7ee8", "#7aa2f7", "#52637f"];
    const slices = [];
    let angle = -Math.PI / 2;
    const cx = cssW * 0.5, cy = cssH * 0.38, r = Math.min(cssW * 0.22, cssH * 0.24);
    ctx.clearRect(0, 0, cssW, cssH);
    data.forEach((d, i) => {
      const next = angle + (d.value / total) * Math.PI * 2;
      const active = i === hoverIndex;
      const radius = active ? r + 8 : r;
      const color = options.levelPalette ? colorForLevel(d.label) : colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, angle, next);
      ctx.closePath();
      ctx.fillStyle = color;
      if (active) {
        ctx.shadowColor = "rgba(29, 36, 48, .24)";
        ctx.shadowBlur = 14;
      }
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      if (active) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      slices.push({ start: angle, end: next, index: i, item: d, cx, cy, r });
      angle = next;
    });
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, r * .55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#1d2430";
    ctx.font = "bold 18px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(`${total}`, cx, cy - 2);
    ctx.font = "11px Segoe UI";
    ctx.fillStyle = "#667085";
    ctx.fillText("alunos", cx, cy + 16);
    if (hoverIndex >= 0 && data[hoverIndex]) {
      const d = data[hoverIndex];
      drawTooltip(ctx, `${d.label}: ${d.value} alunos | ${d.percent}%`, cssW, cx, cy - r - 12);
    }
    drawLegend(ctx, data.slice(0, 6).map((d, i) => ({ label: `${d.label} (${d.percent}%)`, color: options.levelPalette ? colorForLevel(d.label) : colors[i % colors.length] })), cssW, cssH);
    updateChartRegistry(id, { slices });
  };
  const hoverIndex = chartRegistry.get(id)?.hoverIndex ?? -1;
  render(hoverIndex);
  bindChartHover(canvas, render, (point) => {
    const slices = chartRegistry.get(id)?.slices || [];
    if (!slices.length) return -1;
    const { cx, cy, r } = slices[0];
    const dx = point.x - cx;
    const dy = point.y - cy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < r * .55 || distance > r + 12) return -1;
    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;
    const hit = slices.find((slice) => angle >= slice.start && angle <= slice.end);
    return hit ? hit.index : -1;
  });
}

function updateChartRegistry(id, values) {
  chartRegistry.set(id, { ...(chartRegistry.get(id) || {}), ...values });
}

function bindChartHover(canvas, render, hitTest) {
  const id = canvas.id;
  updateChartRegistry(id, { render, hitTest });
  if (canvas.dataset.hoverBound) return;
  canvas.dataset.hoverBound = "1";
  canvas.addEventListener("mousemove", (event) => {
    const chart = chartRegistry.get(id);
    if (!chart?.hitTest || !chart?.render) return;
    const rect = canvas.getBoundingClientRect();
    const hoverIndex = chart.hitTest({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (hoverIndex !== chart.hoverIndex) {
      chart.hoverIndex = hoverIndex;
      chart.render(hoverIndex);
    }
  });
  canvas.addEventListener("mouseleave", () => {
    const chart = chartRegistry.get(id);
    if (!chart?.render || chart.hoverIndex === -1) return;
    chart.hoverIndex = -1;
    chart.render(-1);
  });
}

function drawTooltip(ctx, text, canvasWidth, x, y) {
  const label = String(text || "");
  ctx.save();
  ctx.font = "bold 12px Segoe UI";
  const width = Math.min(ctx.measureText(label).width + 22, canvasWidth - 24);
  const left = Math.max(12, Math.min(canvasWidth - width - 12, x - width / 2));
  const top = Math.max(10, y - 30);
  ctx.fillStyle = "rgba(29, 36, 48, .94)";
  roundRect(ctx, left, top, width, 26, 7);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(label.slice(0, 64), left + width / 2, top + 17);
  ctx.restore();
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const cssHeight = 360;
  canvas.width = Math.max(320, Math.floor(rect.width * devicePixelRatio));
  canvas.height = Math.floor(cssHeight * devicePixelRatio);
  const ctx = canvas.getContext("2d");
  ctx.scale(devicePixelRatio, devicePixelRatio);
  canvas.style.height = `${cssHeight}px`;
  return ctx;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(height) / 2, width / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawLegend(ctx, items, width, height) {
  if (!items.length) return;
  ctx.textAlign = "left";
  ctx.font = "12px Segoe UI";
  const measured = items.map((item) => ({ ...item, w: Math.min(ctx.measureText(item.label).width + 34, 190) }));
  const rows = [[]];
  let rowWidth = 0;
  measured.forEach((item) => {
    if (rowWidth + item.w > width - 36 && rows[rows.length - 1].length) {
      rows.push([]);
      rowWidth = 0;
    }
    rows[rows.length - 1].push(item);
    rowWidth += item.w;
  });
  const baseY = height - 16 - (rows.length - 1) * 18;
  rows.forEach((row, rowIndex) => {
    const totalW = row.reduce((sum, item) => sum + item.w, 0);
    let x = Math.max(18, (width - totalW) / 2);
    const y = baseY + rowIndex * 18;
    row.forEach((item) => {
    ctx.fillStyle = item.color;
      roundRect(ctx, x, y - 10, 14, 14, 4);
    ctx.fill();
    ctx.fillStyle = "#667085";
      ctx.fillText(String(item.label).slice(0, 24), x + 20, y + 1);
      x += item.w;
    });
  });
}

function drawNoData(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#667085";
  ctx.font = "14px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("Nenhum resultado encontrado para os filtros selecionados.", width / 2, height / 2);
}

function shade(color, index) {
  const palette = [color, "#0057d9", "#4f7ee8", "#7aa2f7", "#233b76", "#52637f"];
  return palette[index % palette.length];
}

function formatNumber(value) {
  const n = Number(value || 0);
  if (n >= 1000) return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

async function download(url, filename) {
  let blob;
  try {
    const result = await api(url);
    blob = result instanceof Blob ? result : new Blob([String(result ?? "")]);
  } catch {
    state.error = "Não foi possível gerar o arquivo.";
    render();
    return;
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

function query() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state.filters)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value) params.set(key, value);
  }
  return params.toString();
}

function isSelectedFilter(key, value) {
  return Array.isArray(state.filters[key]) ? state.filters[key].includes(value) : state.filters[key] === value;
}

function comparisonTable(comparison) {
  if (!comparison?.evaluations?.length) return `<div class="empty-box">Selecione pelo menos uma avaliacao para montar o comparativo.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Unidade</th>${comparison.evaluations.map((evaluation) => `<th>${esc(evaluation)} - %</th><th>${esc(evaluation)} - alunos</th>`).join("")}</tr></thead><tbody>
    ${comparison.rows.map((row) => `<tr><td>${esc(row.unidade)}</td>${comparison.evaluations.map((evaluation) => `<td><strong>${row[evaluation]?.percentual ?? 0}%</strong></td><td>${row[evaluation]?.alunos ?? 0}</td>`).join("")}</tr>`).join("")}
  </tbody></table></div>`;
}

function chartCard(title, id) {
  return `<section class="card chart"><h3>${title}</h3><canvas id="${id}"></canvas></section>`;
}

function kpi(label, value) {
  return `<section class="card kpi"><div class="value">${value}</div><div class="label">${label}</div></section>`;
}

function alertHtml() {
  const html = `${state.message ? `<div class="notice">${state.message}</div>` : ""}${state.error ? `<div class="notice error">${state.error}</div>` : ""}`;
  state.message = "";
  state.error = "";
  return html;
}

function titleFor(view) {
  return ({ dashboard: "Dashboard geral", analise: "Análise diagnóstica", analiseQuestoes: "Analise Diagnostica das Questoes", bncc: "Habilidades BNCC", curriculoMunicipal: "Currículo Municipal", habilidadesAplicadas: "Cadastro de Habilidades Aplicadas", relatorios: "Relatórios", qualidade: "Qualidade dos dados", comparativo: "Comparativo", importacoes: "Importações", admin: "Painel administrativo" })[view] || "AVD";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
}

function date(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "";
}

