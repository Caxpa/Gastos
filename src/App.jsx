import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import "./index.css";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const TIPOS = { fixa: "Fixa", variavel: "Variável", recebimento: "Recebimento" };
const mesAtual = new Date().getMonth() + 1;

const fmt = (v) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ============================================================
// HOOK PRINCIPAL
// ============================================================
function useGastos(anoSelecionado) {
  const [anos, setAnos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [lancamentos, setLancamentos] = useState({});
  const [salarios, setSalarios] = useState({});
  const [gastosAnuais, setGastosAnuais] = useState([]);
  const [mesesVisiveis, setMesesVisiveis] = useState(null);
  const [loading, setLoading] = useState(true);

  const carregarAnos = useCallback(async () => {
    const { data } = await supabase.from("ano").select("*").order("ano", { ascending: false });
    setAnos(data || []);
  }, []);

  const carregarCategorias = useCallback(async () => {
    const { data } = await supabase.from("categoria").select("*").eq("ativo", true).order("ordem");
    setCategorias(data || []);
  }, []);

  const carregarLancamentos = useCallback(async (anoId) => {
    if (!anoId) return;
    const { data } = await supabase.from("lancamento_mensal").select("*").eq("ano_id", anoId);
    const mapa = {};
    (data || []).forEach((l) => { mapa[`${l.categoria_id}-${l.mes}`] = l; });
    setLancamentos(mapa);
  }, []);

  const carregarSalarios = useCallback(async (anoId) => {
    if (!anoId) return;
    const { data } = await supabase.from("salario_mensal").select("*").eq("ano_id", anoId);
    const mapa = {};
    (data || []).forEach((s) => { mapa[s.mes] = s; });
    setSalarios(mapa);
  }, []);

  const carregarGastosAnuais = useCallback(async (anoId) => {
    if (!anoId) return;
    const { data } = await supabase.from("gasto_anual").select("*").eq("ano_id", anoId).order("ordem");
    setGastosAnuais(data || []);
  }, []);

  const carregarMesesVisiveis = useCallback(async (anoId) => {
    if (!anoId) return;
    const { data } = await supabase.from("preferencia_colunas").select("*").eq("ano_id", anoId).single();
    if (data) {
      setMesesVisiveis(data.meses_visiveis);
    } else {
      const proximo = mesAtual === 12 ? 1 : mesAtual + 1;
      const padrao = [mesAtual, proximo];
      await supabase.from("preferencia_colunas").insert({ ano_id: anoId, meses_visiveis: padrao });
      setMesesVisiveis(padrao);
    }
  }, []);

  const salvarMesesVisiveis = useCallback(async (anoId, meses) => {
    await supabase.from("preferencia_colunas")
      .upsert({ ano_id: anoId, meses_visiveis: meses, updated_at: new Date().toISOString() }, { onConflict: "ano_id" });
    setMesesVisiveis(meses);
  }, []);

  useEffect(() => { carregarAnos(); carregarCategorias(); }, [carregarAnos, carregarCategorias]);

  useEffect(() => {
    if (!anoSelecionado) return;
    setLoading(true);
    setMesesVisiveis(null);
    Promise.all([
      carregarLancamentos(anoSelecionado.id),
      carregarSalarios(anoSelecionado.id),
      carregarGastosAnuais(anoSelecionado.id),
      carregarMesesVisiveis(anoSelecionado.id),
    ]).finally(() => setLoading(false));
  }, [anoSelecionado, carregarLancamentos, carregarSalarios, carregarGastosAnuais, carregarMesesVisiveis]);

  return {
    anos, categorias, lancamentos, salarios, gastosAnuais, mesesVisiveis, loading,
    recarregarLancamentos: () => carregarLancamentos(anoSelecionado?.id),
    recarregarSalarios: () => carregarSalarios(anoSelecionado?.id),
    recarregarGastosAnuais: () => carregarGastosAnuais(anoSelecionado?.id),
    recarregarCategorias: carregarCategorias,
    recarregarAnos: carregarAnos,
    salvarMesesVisiveis: (meses) => salvarMesesVisiveis(anoSelecionado?.id, meses),
  };
}

// ============================================================
// PAINEL DE COLUNAS VISÍVEIS
// ============================================================
function PainelColunas({ mesesVisiveis, onSalvar, onFechar }) {
  const [selecionados, setSelecionados] = useState([...mesesVisiveis].sort((a, b) => a - b));

  const toggle = (mes) =>
    setSelecionados((prev) =>
      prev.includes(mes) ? prev.filter((m) => m !== mes) : [...prev, mes].sort((a, b) => a - b)
    );

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, width: 400 }}>
        <h3 style={{ margin: "0 0 6px", color: "#1a1a2e" }}>Colunas visíveis</h3>
        <p style={{ fontSize: 12, color: "#aaa", marginBottom: 20 }}>Selecione os meses que devem aparecer na tabela.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
          {MESES.map((m, i) => {
            const mes = i + 1;
            const ativo = selecionados.includes(mes);
            return (
              <button key={mes} onClick={() => toggle(mes)} style={{
                padding: "10px 6px", borderRadius: 8,
                border: ativo ? "2px solid #6c63ff" : "2px solid #eee",
                background: ativo ? "#6c63ff" : "#fff",
                color: ativo ? "#fff" : "#666",
                fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", position: "relative",
              }}>
                {m}
                {mes === mesAtual && <span style={{ position: "absolute", top: 3, right: 4, width: 6, height: 6, borderRadius: "50%", background: ativo ? "#fff" : "#6c63ff" }} />}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button style={s.btnSecundario} onClick={() => setSelecionados([1,2,3,4,5,6,7,8,9,10,11,12])}>Mostrar todos</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.btnSecundario} onClick={onFechar}>Cancelar</button>
            <button style={s.btnPrimario} onClick={() => { onSalvar(selecionados); onFechar(); }} disabled={selecionados.length === 0}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SALÁRIO
// ============================================================
function CampoSalario({ anoId, mes, salario, onSalvo }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const num = parseFloat(valor.replace(",", "."));
    setSalvando(true);
    try {
      if (valor === "" || isNaN(num)) {
        if (salario) await supabase.from("salario_mensal").delete().eq("id", salario.id);
      } else if (salario) {
        await supabase.from("salario_mensal").update({ valor: num }).eq("id", salario.id);
      } else {
        await supabase.from("salario_mensal").insert({ ano_id: anoId, mes, valor: num });
      }
      onSalvo();
    } finally { setSalvando(false); setEditando(false); }
  };

  if (editando) {
    return (
      <input autoFocus style={s.salarioInput} value={valor}
        onChange={(e) => setValor(e.target.value)} onBlur={salvar}
        onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setEditando(false); }}
        disabled={salvando} placeholder="0,00" />
    );
  }
  return (
    <div style={s.salarioDisplay} onClick={() => { setValor(salario ? String(salario.valor) : ""); setEditando(true); }}>
      {salario ? fmt(salario.valor) : <span style={{ color: "#bbb", fontSize: 16, fontWeight: 500 }}>Clique para informar o salário</span>}
      <span style={s.salarioEditar}>✏️</span>
    </div>
  );
}

// ============================================================
// DASHBOARD — com receita prevista e saldo projetado
// ============================================================
function Dashboard({ categorias, lancamentos, salarios, anoId, mes, onSalarioSalvo }) {
  const salario = salarios[mes];
  const salarioValor = salario ? Number(salario.valor) : 0;

  // Previstos
  const previstoDesp = categorias
    .filter((c) => c.tipo !== "recebimento" && c.valor_previsto)
    .reduce((a, c) => a + Number(c.valor_previsto), 0);

  const previstoReceb = categorias
    .filter((c) => c.tipo === "recebimento" && c.valor_previsto)
    .reduce((a, c) => a + Number(c.valor_previsto), 0);

  const receitaPrevista = salarioValor + previstoReceb;
  const sobraPrevistp = receitaPrevista - previstoDesp;

  // Realizados — se não lançado usa previsto
  const gastosProjetados = categorias
    .filter((c) => c.tipo !== "recebimento")
    .reduce((a, c) => {
      const l = lancamentos[`${c.id}-${mes}`];
      return a + (l ? Number(l.valor) : (Number(c.valor_previsto) || 0));
    }, 0);

  const recebimentosProjetados = categorias
    .filter((c) => c.tipo === "recebimento")
    .reduce((a, c) => {
      const l = lancamentos[`${c.id}-${mes}`];
      return a + (l ? Number(l.valor) : (Number(c.valor_previsto) || 0));
    }, 0);

  // Realizados puros (para o card de realizado)
  const gastosRealizados = categorias
    .filter((c) => c.tipo !== "recebimento")
    .reduce((a, c) => { const l = lancamentos[`${c.id}-${mes}`]; return a + (l ? Number(l.valor) : 0); }, 0);

  const recebimentosRealizados = categorias
    .filter((c) => c.tipo === "recebimento")
    .reduce((a, c) => { const l = lancamentos[`${c.id}-${mes}`]; return a + (l ? Number(l.valor) : 0); }, 0);

  const saldoProjetado = salarioValor + recebimentosProjetados - gastosProjetados;

  return (
    <div style={s.dashboardWrapper}>
      <div style={s.salarioCard}>
        <div style={s.salarioTopo}>
          <span style={s.salarioLabel}>Salário — {MESES[mes - 1]}</span>
          {receitaPrevista > 0 && previstoDesp > 0 && (
            <span style={{ fontSize: 12, color: sobraPrevistp >= 0 ? "#2ecc71" : "#e05c5c", fontWeight: 700 }}>
              {sobraPrevistp >= 0
                ? `Sobra ${fmt(sobraPrevistp)} após as contas previstas`
                : `Falta ${fmt(Math.abs(sobraPrevistp))} para cobrir as contas previstas`}
            </span>
          )}
        </div>
        <CampoSalario anoId={anoId} mes={mes} salario={salario} onSalvo={onSalarioSalvo} />
      </div>

      <div style={s.dashboard}>
        {previstoReceb > 0 && (
          <Card label="Receita Prevista" valor={receitaPrevista} cor="#6c63ff"
            sub={`salário + ${fmt(previstoReceb)} de recebimentos`} />
        )}
        <Card label="Desp. Previstas" valor={previstoDesp} cor="#6c63ff"
          sub={receitaPrevista > 0 ? `${Math.round((previstoDesp / receitaPrevista) * 100)}% da receita` : null} />
        <Card label="Desp. Realizadas" valor={gastosRealizados} cor="#e05c5c"
          sub={receitaPrevista > 0 ? `${Math.round((gastosRealizados / receitaPrevista) * 100)}% da receita` : null} />
        <Card label="Recebido" valor={recebimentosRealizados} cor="#2ecc71" />
        <Card label="Saldo Projetado" valor={saldoProjetado} cor={saldoProjetado >= 0 ? "#2ecc71" : "#e05c5c"}
          sub="usa previsto onde não há lançamento" />
      </div>
    </div>
  );
}

function Card({ label, valor, cor, sub }) {
  return (
    <div style={s.card}>
      <span style={{ ...s.cardValor, color: cor }}>{fmt(valor)}</span>
      <span style={s.cardLabel}>{label}</span>
      {sub && <span style={s.cardSub}>{sub}</span>}
    </div>
  );
}

// ============================================================
// CÉLULA EDITÁVEL — com navegação por Enter
// ============================================================
function CelulaLancamento({ categoriaId, anoId, mes, lancamento, onSalvo, onEnter }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const num = parseFloat(valor.replace(",", "."));
    if (isNaN(num) && valor !== "") return;
    setSalvando(true);
    try {
      if (valor === "" || isNaN(num)) {
        if (lancamento) await supabase.from("lancamento_mensal").delete().eq("id", lancamento.id);
      } else if (lancamento) {
        await supabase.from("lancamento_mensal").update({ valor: num }).eq("id", lancamento.id);
      } else {
        await supabase.from("lancamento_mensal").insert({ categoria_id: categoriaId, ano_id: anoId, mes, valor: num });
      }
      onSalvo();
    } finally { setSalvando(false); setEditando(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { salvar().then(() => onEnter && onEnter()); }
    if (e.key === "Escape") setEditando(false);
  };

  if (editando) {
    return (
      <input autoFocus style={s.celulaInput} value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar} onKeyDown={handleKeyDown}
        disabled={salvando} placeholder="0,00" />
    );
  }
  return (
    <div style={{ ...s.celula, color: lancamento ? "#1a1a2e" : "#ccc", cursor: "pointer" }}
      onClick={() => { setValor(lancamento ? String(lancamento.valor) : ""); setEditando(true); }}>
      {lancamento ? fmt(lancamento.valor) : "·"}
    </div>
  );
}

// ============================================================
// TABELA DE LANÇAMENTOS
// ============================================================
function TabelaLancamentos({ categorias, lancamentos, anoId, onSalvo, mesFoco, mesesVisiveis, onGerenciarColunas }) {
  const cellRefs = useRef({});

  const grupos = [
    { tipo: "fixa", label: "Contas Fixas" },
    { tipo: "variavel", label: "Gastos Variáveis" },
    { tipo: "recebimento", label: "Recebimentos" },
  ];

  const todasCats = grupos.flatMap(({ tipo }) => categorias.filter((c) => c.tipo === tipo));
  const mesesOrdenados = mesesVisiveis ? [...mesesVisiveis].sort((a, b) => a - b) : [];

  const focarProxima = (categoriaId, mes) => {
    const idxCat = todasCats.findIndex((c) => c.id === categoriaId);
    const idxMes = mesesOrdenados.indexOf(mes);

    if (idxCat < todasCats.length - 1) {
      const proxCat = todasCats[idxCat + 1];
      const el = cellRefs.current[`${proxCat.id}-${mes}`];
      if (el) { el.click(); return; }
    }

    if (idxMes < mesesOrdenados.length - 1) {
      const proxMes = mesesOrdenados[idxMes + 1];
      const primeiraCat = todasCats[0];
      if (primeiraCat) {
        const el = cellRefs.current[`${primeiraCat.id}-${proxMes}`];
        if (el) el.click();
      }
    }
  };

  return (
    <div style={s.tabelaWrapper}>
      <div style={s.tabelaHeader}>
        <button style={s.btnColunas} onClick={onGerenciarColunas}>
          ⚙️ Colunas ({mesesOrdenados.length}/12)
        </button>
      </div>
      <table style={s.tabela}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: "left", minWidth: 160 }}>Categoria</th>
            <th style={{ ...s.th, color: "#6c63ff" }}>Previsto</th>
            {mesesOrdenados.map((mes) => (
              <th key={mes} style={{ ...s.th, background: mes === mesFoco ? "#6c63ff11" : "transparent", color: mes === mesFoco ? "#6c63ff" : "#aaa" }}>
                {MESES[mes - 1]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map(({ tipo, label }) => {
            const cats = categorias.filter((c) => c.tipo === tipo);
            if (!cats.length) return null;
            return (
              <>
                <tr key={`h-${tipo}`}><td colSpan={mesesOrdenados.length + 2} style={s.grupoHeader}>{label}</td></tr>
                {cats.map((cat) => (
                  <tr key={cat.id} style={s.tr}>
                    <td style={s.tdNome}>{cat.nome}</td>
                    <td style={{ ...s.celula, color: "#6c63ff", fontWeight: 600 }}>{cat.valor_previsto ? fmt(cat.valor_previsto) : "—"}</td>
                    {mesesOrdenados.map((mes) => (
                      <td key={mes} style={{ padding: 0, background: mes === mesFoco ? "#6c63ff06" : "transparent" }}>
                        <div ref={(el) => { if (el) cellRefs.current[`${cat.id}-${mes}`] = el; else delete cellRefs.current[`${cat.id}-${mes}`]; }}>
                          <CelulaLancamento
                            categoriaId={cat.id} anoId={anoId} mes={mes}
                            lancamento={lancamentos[`${cat.id}-${mes}`]}
                            onSalvo={onSalvo}
                            onEnter={() => focarProxima(cat.id, mes)}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// GASTOS ANUAIS
// ============================================================
function EditableValor({ valor, onSalvar }) {
  const [editando, setEditando] = useState(false);
  const [v, setV] = useState("");
  if (editando) {
    return (
      <input autoFocus style={s.celulaInput} value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => { onSalvar(v); setEditando(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") { onSalvar(v); setEditando(false); } if (e.key === "Escape") setEditando(false); }} />
    );
  }
  return <div style={{ ...s.celula, cursor: "pointer" }} onClick={() => { setV(valor ?? ""); setEditando(true); }}>{fmt(valor)}</div>;
}

function GastosAnuais({ gastosAnuais, anoId, onSalvo }) {
  const [novo, setNovo] = useState({ descricao: "", valor_previsto: "", valor_realizado: "" });
  const [salvando, setSalvando] = useState(false);

  const salvarNovo = async () => {
    if (!novo.descricao) return;
    setSalvando(true);
    await supabase.from("gasto_anual").insert({ ano_id: anoId, descricao: novo.descricao, valor_previsto: parseFloat(novo.valor_previsto) || null, valor_realizado: parseFloat(novo.valor_realizado) || null, ordem: gastosAnuais.length + 1 });
    setNovo({ descricao: "", valor_previsto: "", valor_realizado: "" });
    setSalvando(false);
    onSalvo();
  };

  const atualizar = async (id, campo, valor) => {
    const num = parseFloat(String(valor).replace(",", "."));
    await supabase.from("gasto_anual").update({ [campo]: isNaN(num) ? null : num }).eq("id", id);
    onSalvo();
  };

  const excluir = async (id) => {
    if (!confirm("Excluir este gasto anual?")) return;
    await supabase.from("gasto_anual").delete().eq("id", id);
    onSalvo();
  };

  const totalPrevisto = gastosAnuais.reduce((a, g) => a + (Number(g.valor_previsto) || 0), 0);
  const totalRealizado = gastosAnuais.reduce((a, g) => a + (Number(g.valor_realizado) || 0), 0);

  return (
    <div style={s.anuaisWrapper}>
      <h3 style={s.secaoTitulo}>Gastos Anuais</h3>
      <table style={s.tabela}>
        <thead>
          <tr>
            <th style={{ ...s.th, textAlign: "left" }}>Descrição</th>
            <th style={s.th}>Previsto</th>
            <th style={s.th}>Realizado</th>
            <th style={s.th}>Diferença</th>
            <th style={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {gastosAnuais.map((g) => (
            <tr key={g.id} style={s.tr}>
              <td style={s.tdNome}>{g.descricao}</td>
              <td style={s.celula}><EditableValor valor={g.valor_previsto} onSalvar={(v) => atualizar(g.id, "valor_previsto", v)} /></td>
              <td style={s.celula}><EditableValor valor={g.valor_realizado} onSalvar={(v) => atualizar(g.id, "valor_realizado", v)} /></td>
              <td style={{ ...s.celula, color: (g.valor_previsto - g.valor_realizado) >= 0 ? "#2ecc71" : "#e05c5c", fontWeight: 600 }}>
                {fmt((g.valor_previsto || 0) - (g.valor_realizado || 0))}
              </td>
              <td style={{ padding: "4px 8px", textAlign: "center" }}>
                <button onClick={() => excluir(g.id)} style={s.btnExcluir} title="Excluir">✕</button>
              </td>
            </tr>
          ))}
          <tr style={{ background: "#f7f7ff" }}>
            <td style={{ ...s.tdNome, fontWeight: 700 }}>Total</td>
            <td style={{ ...s.celula, fontWeight: 700 }}>{fmt(totalPrevisto)}</td>
            <td style={{ ...s.celula, fontWeight: 700 }}>{fmt(totalRealizado)}</td>
            <td style={{ ...s.celula, fontWeight: 700, color: (totalPrevisto - totalRealizado) >= 0 ? "#2ecc71" : "#e05c5c" }}>{fmt(totalPrevisto - totalRealizado)}</td>
            <td></td>
          </tr>
          <tr>
            <td style={{ padding: "6px 8px" }}><input style={s.inputSimples} placeholder="Nova descrição..." value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} /></td>
            <td style={{ padding: "6px 8px" }}><input style={{ ...s.inputSimples, textAlign: "right" }} placeholder="Previsto" value={novo.valor_previsto} onChange={(e) => setNovo({ ...novo, valor_previsto: e.target.value })} /></td>
            <td style={{ padding: "6px 8px" }}><input style={{ ...s.inputSimples, textAlign: "right" }} placeholder="Realizado" value={novo.valor_realizado} onChange={(e) => setNovo({ ...novo, valor_realizado: e.target.value })} /></td>
            <td style={{ padding: "6px 8px" }}><button style={s.btnPrimario} onClick={salvarNovo} disabled={salvando || !novo.descricao}>Adicionar</button></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// GERENCIAR CATEGORIAS — previsto liberado para recebimentos
// ============================================================
function GerenciarCategorias({ categorias, onSalvo }) {
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  const iniciarEdicao = (cat) => {
    setEditando(cat.id);
    setForm({ nome: cat.nome, tipo: cat.tipo, valor_previsto: cat.valor_previsto ?? "" });
  };

  const cancelar = () => { setEditando(null); setForm({}); };

  const salvar = async (cat) => {
    setSalvando(true);
    await supabase.from("categoria").update({
      nome: form.nome, tipo: form.tipo,
      valor_previsto: parseFloat(String(form.valor_previsto).replace(",", ".")) || null,
    }).eq("id", cat.id);
    setSalvando(false);
    setEditando(null);
    onSalvo();
  };

  const excluir = async (cat) => {
    if (!confirm(`Excluir "${cat.nome}"? Todos os lançamentos também serão excluídos.`)) return;
    await supabase.from("categoria").update({ ativo: false }).eq("id", cat.id);
    onSalvo();
  };

  const moverOrdem = async (cat, direcao, cats) => {
    const idx = cats.findIndex((c) => c.id === cat.id);
    const alvo = cats[idx + direcao];
    if (!alvo) return;
    await Promise.all([
      supabase.from("categoria").update({ ordem: alvo.ordem }).eq("id", cat.id),
      supabase.from("categoria").update({ ordem: cat.ordem }).eq("id", alvo.id),
    ]);
    onSalvo();
  };

  const grupos = [
    { tipo: "fixa", label: "Contas Fixas" },
    { tipo: "variavel", label: "Gastos Variáveis" },
    { tipo: "recebimento", label: "Recebimentos" },
  ];

  return (
    <div style={s.anuaisWrapper}>
      <h3 style={s.secaoTitulo}>Gerenciar Categorias</h3>
      {grupos.map(({ tipo, label }) => {
        const cats = categorias.filter((c) => c.tipo === tipo);
        if (!cats.length) return null;
        return (
          <div key={tipo} style={{ marginBottom: 28 }}>
            <div style={{ ...s.grupoHeader, borderRadius: 8, marginBottom: 8, display: "inline-block", padding: "4px 12px" }}>{label}</div>
            <table style={s.tabela}>
              <thead>
                <tr>
                  <th style={{ ...s.th, textAlign: "left" }}>Nome</th>
                  <th style={s.th}>Tipo</th>
                  <th style={s.th}>Previsto</th>
                  <th style={s.th}>Ordem</th>
                  <th style={s.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((cat, idx) => (
                  <tr key={cat.id} style={s.tr}>
                    {editando === cat.id ? (
                      <>
                        <td style={{ padding: "6px 8px" }}><input style={s.inputSimples} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus /></td>
                        <td style={{ padding: "6px 8px" }}>
                          <select style={s.inputSimples} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                            <option value="fixa">Fixa</option>
                            <option value="variavel">Variável</option>
                            <option value="recebimento">Recebimento</option>
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input style={{ ...s.inputSimples, textAlign: "right" }}
                            value={form.valor_previsto}
                            onChange={(e) => setForm({ ...form, valor_previsto: e.target.value })}
                            placeholder="0,00" />
                        </td>
                        <td style={{ ...s.celula, color: "#aaa", fontSize: 12 }}>{cat.ordem}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={s.btnPrimario} onClick={() => salvar(cat)} disabled={salvando}>Salvar</button>
                            <button style={s.btnSecundario} onClick={cancelar}>Cancelar</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={s.tdNome}>{cat.nome}</td>
                        <td style={s.celula}>
                          <span style={{ background: tipo === "recebimento" ? "#e6fff2" : tipo === "fixa" ? "#f0efff" : "#fff8ee", color: tipo === "recebimento" ? "#1a7a4a" : tipo === "fixa" ? "#6c63ff" : "#c45000", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            {TIPOS[cat.tipo]}
                          </span>
                        </td>
                        <td style={{ ...s.celula, color: "#6c63ff", fontWeight: 600 }}>{cat.valor_previsto ? fmt(cat.valor_previsto) : "—"}</td>
                        <td style={s.celula}>
                          <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                            <button onClick={() => moverOrdem(cat, -1, cats)} style={s.btnOrdem} disabled={idx === 0}>↑</button>
                            <button onClick={() => moverOrdem(cat, 1, cats)} style={s.btnOrdem} disabled={idx === cats.length - 1}>↓</button>
                          </div>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => iniciarEdicao(cat)} style={s.btnSecundario}>Editar</button>
                            <button onClick={() => excluir(cat)} style={s.btnExcluir}>Excluir</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// MODAL NOVA CATEGORIA — previsto para todos os tipos
// ============================================================
function ModalNovaCategoria({ onFechar, onSalvo, totalCategorias }) {
  const [form, setForm] = useState({ nome: "", tipo: "fixa", valor_previsto: "" });
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!form.nome) return;
    setSalvando(true);
    await supabase.from("categoria").insert({
      nome: form.nome, tipo: form.tipo,
      valor_previsto: parseFloat(form.valor_previsto) || null,
      ordem: totalCategorias + 1,
    });
    setSalvando(false);
    onSalvo();
    onFechar();
  };

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <h3 style={{ margin: "0 0 20px", color: "#1a1a2e" }}>Nova Categoria</h3>
        <label style={s.label}>Nome</label>
        <input style={s.input} value={form.nome} autoFocus onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Freelance" />
        <label style={s.label}>Tipo</label>
        <select style={s.input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          <option value="fixa">Fixa</option>
          <option value="variavel">Variável</option>
          <option value="recebimento">Recebimento</option>
        </select>
        <label style={s.label}>Valor previsto (R$)</label>
        <input style={s.input} type="number" value={form.valor_previsto} onChange={(e) => setForm({ ...form, valor_previsto: e.target.value })} placeholder="0,00" />
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button style={s.btnSecundario} onClick={onFechar}>Cancelar</button>
          <button style={s.btnPrimario} onClick={salvar} disabled={salvando || !form.nome}>{salvando ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APP PRINCIPAL
// ============================================================
export default function App() {
  const anoAtual = new Date().getFullYear();

  const [anoSelecionado, setAnoSelecionado] = useState(null);
  const [mesFoco, setMesFoco] = useState(mesAtual);
  const [aba, setAba] = useState("mensal");
  const [modalCategoria, setModalCategoria] = useState(false);
  const [painelColunas, setPainelColunas] = useState(false);
  const [novoAno, setNovoAno] = useState("");
  const [criandoAno, setCriandoAno] = useState(false);

  const { anos, categorias, lancamentos, salarios, gastosAnuais, mesesVisiveis, loading,
    recarregarLancamentos, recarregarSalarios, recarregarGastosAnuais,
    recarregarCategorias, recarregarAnos, salvarMesesVisiveis } = useGastos(anoSelecionado);

  useEffect(() => {
    if (anos.length && !anoSelecionado) {
      setAnoSelecionado(anos.find((a) => a.ano === anoAtual) || anos[0]);
    }
  }, [anos, anoSelecionado, anoAtual]);

  const criarAno = async () => {
    const num = parseInt(novoAno);
    if (!num || anos.find((a) => a.ano === num)) return;
    setCriandoAno(true);
    const { data } = await supabase.from("ano").insert({ ano: num }).select().single();
    await recarregarAnos();
    setAnoSelecionado(data);
    setNovoAno("");
    setCriandoAno(false);
  };

  const ABAS = [
    { id: "mensal", label: "Mensal" },
    { id: "anuais", label: "Anuais" },
    { id: "categorias", label: "Categorias" },
  ];

  return (
    <div style={s.app}>
      <header style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.logo}>💰</span>
          <span style={s.titulo}>Controle de Gastos</span>
        </div>
        <div style={s.headerRight}>
          <div style={s.anoSelector}>
            {anos.map((a) => (
              <button key={a.id} style={{ ...s.anoBtn, background: anoSelecionado?.id === a.id ? "#6c63ff" : "transparent", color: anoSelecionado?.id === a.id ? "#fff" : "#6c63ff" }} onClick={() => setAnoSelecionado(a)}>{a.ano}</button>
            ))}
            <input style={s.inputAno} placeholder="+ Ano" value={novoAno} onChange={(e) => setNovoAno(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criarAno()} maxLength={4} disabled={criandoAno} />
          </div>
          <button style={s.btnPrimario} onClick={() => setModalCategoria(true)}>+ Categoria</button>
        </div>
      </header>

      <div style={s.abas}>
        {ABAS.map((a) => (
          <button key={a.id} style={{ ...s.aba, borderBottom: aba === a.id ? "2px solid #6c63ff" : "2px solid transparent", color: aba === a.id ? "#6c63ff" : "#aaa" }} onClick={() => setAba(a.id)}>
            {a.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.loading}>Carregando...</div>
      ) : (
        <main style={s.main}>
          {aba === "mensal" && (
            <>
              <div style={s.meses}>
                {MESES.map((m, i) => (
                  <button key={i} style={{ ...s.mesBtn, background: mesFoco === i + 1 ? "#6c63ff" : "transparent", color: mesFoco === i + 1 ? "#fff" : "#555" }} onClick={() => setMesFoco(i + 1)}>{m}</button>
                ))}
              </div>
              <Dashboard categorias={categorias} lancamentos={lancamentos} salarios={salarios} anoId={anoSelecionado?.id} mes={mesFoco} onSalarioSalvo={recarregarSalarios} />
              {mesesVisiveis && (
                <TabelaLancamentos
                  categorias={categorias} lancamentos={lancamentos}
                  anoId={anoSelecionado?.id} onSalvo={recarregarLancamentos}
                  mesFoco={mesFoco} mesesVisiveis={mesesVisiveis}
                  onGerenciarColunas={() => setPainelColunas(true)}
                />
              )}
            </>
          )}
          {aba === "anuais" && <GastosAnuais gastosAnuais={gastosAnuais} anoId={anoSelecionado?.id} onSalvo={recarregarGastosAnuais} />}
          {aba === "categorias" && <GerenciarCategorias categorias={categorias} onSalvo={recarregarCategorias} />}
        </main>
      )}

      {modalCategoria && <ModalNovaCategoria totalCategorias={categorias.length} onFechar={() => setModalCategoria(false)} onSalvo={recarregarCategorias} />}
      {painelColunas && mesesVisiveis && <PainelColunas mesesVisiveis={mesesVisiveis} onSalvar={salvarMesesVisiveis} onFechar={() => setPainelColunas(false)} />}
    </div>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const s = {
  app: { fontFamily: "'Inter', -apple-system, sans-serif", minHeight: "100vh", background: "#f8f8ff", color: "#1a1a2e" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap", gap: 12 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerRight: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  logo: { fontSize: 22 },
  titulo: { fontWeight: 700, fontSize: 18, color: "#1a1a2e", letterSpacing: "-0.3px" },
  anoSelector: { display: "flex", alignItems: "center", gap: 6 },
  anoBtn: { border: "1.5px solid #6c63ff", borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: "pointer", fontWeight: 600, transition: "all 0.15s" },
  inputAno: { border: "1px solid #ddd", borderRadius: 6, padding: "4px 8px", fontSize: 13, width: 56, textAlign: "center", outline: "none" },
  abas: { display: "flex", padding: "0 24px", background: "#fff", borderBottom: "1px solid #eee" },
  aba: { padding: "12px 20px", background: "none", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "color 0.15s" },
  main: { padding: "20px 16px", maxWidth: 1400, margin: "0 auto" },
  meses: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 },
  mesBtn: { padding: "5px 12px", border: "1.5px solid #6c63ff33", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" },
  dashboardWrapper: { marginBottom: 20 },
  salarioCard: { background: "#fff", borderRadius: 12, padding: "16px 20px", marginBottom: 10, boxShadow: "0 1px 4px #0001", display: "flex", flexDirection: "column", gap: 8 },
  salarioTopo: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  salarioLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#aaa" },
  salarioDisplay: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 26, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-1px" },
  salarioEditar: { fontSize: 14, opacity: 0.3 },
  salarioInput: { fontSize: 26, fontWeight: 800, border: "none", borderBottom: "2px solid #6c63ff", outline: "none", background: "transparent", color: "#1a1a2e", width: "100%", padding: "2px 0", letterSpacing: "-1px" },
  dashboard: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 },
  card: { background: "#fff", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 4px #0001" },
  cardValor: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" },
  cardLabel: { fontSize: 10, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" },
  cardSub: { fontSize: 10, color: "#ccc", marginTop: 2 },
  tabelaWrapper: { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px #0001", overflowX: "auto" },
  tabelaHeader: { display: "flex", justifyContent: "flex-end", padding: "10px 14px 0" },
  btnColunas: { background: "transparent", border: "1.5px solid #ddd", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#888", cursor: "pointer", fontFamily: "inherit" },
  tabela: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 8px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "2px solid #f0f0f8", whiteSpace: "nowrap", textAlign: "right" },
  grupoHeader: { padding: "8px 12px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "#6c63ff", background: "#f7f7ff", borderTop: "1px solid #eee" },
  tr: { borderBottom: "1px solid #f5f5f5" },
  tdNome: { padding: "8px 12px", fontWeight: 500, whiteSpace: "nowrap", color: "#333" },
  celula: { padding: "8px", textAlign: "right", whiteSpace: "nowrap", fontSize: 13 },
  celulaInput: { width: "100%", border: "none", borderBottom: "2px solid #6c63ff", outline: "none", textAlign: "right", fontSize: 13, padding: "6px 8px", background: "#f7f7ff", boxSizing: "border-box" },
  anuaisWrapper: { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px #0001" },
  secaoTitulo: { margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#1a1a2e" },
  loading: { display: "flex", justifyContent: "center", padding: 60, color: "#aaa", fontSize: 14 },
  overlay: { position: "fixed", inset: 0, background: "#0005", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#fff", borderRadius: 16, padding: 28, width: 360, maxWidth: "90vw", boxShadow: "0 8px 40px #0002" },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 4, marginTop: 14, textTransform: "uppercase", letterSpacing: "0.4px" },
  input: { width: "100%", border: "1.5px solid #ddd", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  inputSimples: { width: "100%", border: "1px solid #eee", borderRadius: 6, padding: "6px 8px", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  btnPrimario: { background: "#6c63ff", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" },
  btnSecundario: { background: "transparent", color: "#666", border: "1.5px solid #ddd", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnExcluir: { background: "transparent", color: "#e05c5c", border: "1.5px solid #e05c5c", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnOrdem: { background: "transparent", color: "#aaa", border: "1px solid #ddd", borderRadius: 4, padding: "2px 7px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
};
