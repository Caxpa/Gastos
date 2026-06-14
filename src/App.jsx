import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";
import "./index.css";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const TIPOS = { fixa: "Fixa", variavel: "Variável", recebimento: "Recebimento" };
const mesAtual = new Date().getMonth() + 1;

const fmt = (v) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtCompact = (v) => {
  if (v == null) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const parseNum = (v) => {
  if (v === "" || v == null) return null;
  const num = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isNaN(num) ? null : num;
};

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
    (data || []).forEach((sal) => { mapa[sal.mes] = sal; });
    setSalarios(mapa);
  }, []);

  const carregarGastosAnuais = useCallback(async (anoId) => {
    if (!anoId) return;
    const { data } = await supabase.from("gasto_anual").select("*").eq("ano_id", anoId).order("ordem");
    setGastosAnuais(data || []);
  }, []);

  const carregarMesesVisiveis = useCallback(async (anoId) => {
    if (!anoId) return;
    const { data } = await supabase.from("preferencia_colunas").select("*").eq("ano_id", anoId).maybeSingle();
    if (data) {
      setMesesVisiveis(data.meses_visiveis);
    } else {
      const proximo = mesAtual === 12 ? 12 : mesAtual + 1;
      const padrao = mesAtual === 12 ? [12] : [mesAtual, proximo];
      await supabase.from("preferencia_colunas").insert({ ano_id: anoId, meses_visiveis: padrao });
      setMesesVisiveis(padrao);
    }
  }, []);

  const salvarMesesVisiveis = useCallback(async (anoId, meses) => {
    setMesesVisiveis(meses);
    await supabase.from("preferencia_colunas")
      .upsert({ ano_id: anoId, meses_visiveis: meses, updated_at: new Date().toISOString() }, { onConflict: "ano_id" });
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
    setLancamentos, setSalarios,
    recarregarLancamentos: () => carregarLancamentos(anoSelecionado?.id),
    recarregarSalarios: () => carregarSalarios(anoSelecionado?.id),
    recarregarGastosAnuais: () => carregarGastosAnuais(anoSelecionado?.id),
    recarregarCategorias: carregarCategorias,
    recarregarAnos: carregarAnos,
    salvarMesesVisiveis: (meses) => salvarMesesVisiveis(anoSelecionado?.id, meses),
  };
}

// ============================================================
// CÁLCULOS DO MÊS (reutilizável)
// ============================================================
function calcularMes(categorias, lancamentos, salarios, mes) {
  const salario = salarios[mes];
  const salarioValor = salario ? Number(salario.valor) : 0;

  const previstoDesp = categorias
    .filter((c) => c.tipo !== "recebimento" && c.valor_previsto)
    .reduce((a, c) => a + Number(c.valor_previsto), 0);

  const previstoReceb = categorias
    .filter((c) => c.tipo === "recebimento" && c.valor_previsto)
    .reduce((a, c) => a + Number(c.valor_previsto), 0);

  const receitaPrevista = salarioValor + previstoReceb;

  const gastosRealizados = categorias
    .filter((c) => c.tipo !== "recebimento")
    .reduce((a, c) => { const l = lancamentos[`${c.id}-${mes}`]; return a + (l ? Number(l.valor) : 0); }, 0);

  const recebimentosRealizados = categorias
    .filter((c) => c.tipo === "recebimento")
    .reduce((a, c) => { const l = lancamentos[`${c.id}-${mes}`]; return a + (l ? Number(l.valor) : 0); }, 0);

  const gastosProjetados = categorias
    .filter((c) => c.tipo !== "recebimento")
    .reduce((a, c) => { const l = lancamentos[`${c.id}-${mes}`]; return a + (l ? Number(l.valor) : (Number(c.valor_previsto) || 0)); }, 0);

  const recebProjetados = categorias
    .filter((c) => c.tipo === "recebimento")
    .reduce((a, c) => { const l = lancamentos[`${c.id}-${mes}`]; return a + (l ? Number(l.valor) : (Number(c.valor_previsto) || 0)); }, 0);

  const saldoProjetado = salarioValor + recebProjetados - gastosProjetados;
  const sobraPrevista = receitaPrevista - previstoDesp;

  return { salarioValor, previstoDesp, previstoReceb, receitaPrevista, gastosRealizados, recebimentosRealizados, saldoProjetado, sobraPrevista };
}

// ============================================================
// INPUT NUMÉRICO COM AUTO-SAVE (sem duplo disparo)
// ============================================================
function InputAuto({ valorInicial, onSalvar, onEnter, style, displayStyle, displayContent, placeholder = "0,00", textMode = false }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const handledRef = useRef(false);

  const commit = (comEnter) => {
    if (handledRef.current) return;
    handledRef.current = true;
    onSalvar(valor);
    setEditando(false);
    if (comEnter && onEnter) onEnter();
  };

  const abrir = () => {
    handledRef.current = false;
    setValor(valorInicial != null ? String(valorInicial) : "");
    setEditando(true);
  };

  if (editando) {
    return (
      <input
        autoFocus
        style={style}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => setTimeout(() => commit(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(true); }
          if (e.key === "Escape") { handledRef.current = true; setEditando(false); }
        }}
        disabled={false}
        placeholder={placeholder}
        inputMode={textMode ? "text" : "decimal"}
      />
    );
  }
  return (
    <div style={displayStyle} onClick={abrir}>
      {displayContent}
    </div>
  );
}

// ============================================================
// DASHBOARD MOBILE
// ============================================================
function ResumoMes({ categorias, lancamentos, salarios, anoId, mes, onSalarioSalvo, setSalarios }) {
  const calc = calcularMes(categorias, lancamentos, salarios, mes);
  const salario = salarios[mes];

  const salvarSalario = async (raw) => {
    const num = parseNum(raw);
    if (num == null) {
      if (salario) { await supabase.from("salario_mensal").delete().eq("id", salario.id); onSalarioSalvo(); }
      return;
    }
    if (salario) {
      setSalarios((prev) => ({ ...prev, [mes]: { ...prev[mes], valor: num } }));
      await supabase.from("salario_mensal").update({ valor: num }).eq("id", salario.id);
    } else {
      const { data } = await supabase.from("salario_mensal").insert({ ano_id: anoId, mes, valor: num }).select().single();
      if (data) setSalarios((prev) => ({ ...prev, [mes]: data }));
    }
  };

  const pctGasto = calc.receitaPrevista > 0 ? Math.min(100, Math.round((calc.gastosRealizados / calc.receitaPrevista) * 100)) : 0;

  return (
    <div style={s.resumo}>
      {/* Saldo projetado — destaque principal */}
      <div style={s.saldoHero}>
        <span style={s.saldoLabel}>Saldo projetado de {MESES_LONGOS[mes - 1]}</span>
        <span style={{ ...s.saldoValor, color: calc.saldoProjetado >= 0 ? "#fff" : "#ffd9d9" }}>
          {fmt(calc.saldoProjetado)}
        </span>
        <span style={s.saldoSub}>
          {calc.saldoProjetado >= 0 ? "tende a sobrar no fim do mês" : "tende a faltar no fim do mês"}
        </span>
      </div>

      {/* Salário */}
      <div style={s.salarioBox}>
        <span style={s.salarioBoxLabel}>Salário do mês</span>
        <InputAuto
          valorInicial={salario ? salario.valor : ""}
          onSalvar={salvarSalario}
          style={s.salarioInput}
          displayStyle={s.salarioDisplay}
          displayContent={salario
            ? fmt(salario.valor)
            : <span style={{ color: "#bbb", fontSize: 17, fontWeight: 500 }}>Toque para informar</span>}
        />
      </div>

      {/* Mini cards */}
      <div style={s.miniGrid}>
        <div style={s.miniCard}>
          <span style={{ ...s.miniValor, color: "#6c63ff" }}>{fmtCompact(calc.receitaPrevista)}</span>
          <span style={s.miniLabel}>Receita prevista</span>
        </div>
        <div style={s.miniCard}>
          <span style={{ ...s.miniValor, color: "#e05c5c" }}>{fmtCompact(calc.gastosRealizados)}</span>
          <span style={s.miniLabel}>Já gastei</span>
        </div>
        <div style={s.miniCard}>
          <span style={{ ...s.miniValor, color: "#2ecc71" }}>{fmtCompact(calc.recebimentosRealizados)}</span>
          <span style={s.miniLabel}>Já recebi</span>
        </div>
        <div style={s.miniCard}>
          <span style={{ ...s.miniValor, color: "#6c63ff" }}>{fmtCompact(calc.previstoDesp)}</span>
          <span style={s.miniLabel}>Despesa prevista</span>
        </div>
      </div>

      {/* Barra de progresso de gasto */}
      {calc.receitaPrevista > 0 && (
        <div style={s.progressoBox}>
          <div style={s.progressoTopo}>
            <span style={s.progressoLabel}>Gasto sobre a receita prevista</span>
            <span style={{ ...s.progressoPct, color: pctGasto > 90 ? "#e05c5c" : "#6c63ff" }}>{pctGasto}%</span>
          </div>
          <div style={s.progressoTrilha}>
            <div style={{ ...s.progressoBarra, width: `${pctGasto}%`, background: pctGasto > 90 ? "#e05c5c" : "#6c63ff" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LISTA DE LANÇAMENTOS — vertical, mobile-first
// ============================================================
function ListaLancamentos({ categorias, lancamentos, anoId, mes, onSalvo, setLancamentos }) {
  const grupos = [
    { tipo: "fixa", label: "Contas Fixas", cor: "#6c63ff", bg: "#f0efff" },
    { tipo: "variavel", label: "Gastos Variáveis", cor: "#c45000", bg: "#fff8ee" },
    { tipo: "recebimento", label: "Recebimentos", cor: "#1a7a4a", bg: "#e6fff2" },
  ];

  const todasCats = grupos.flatMap(({ tipo }) => categorias.filter((c) => c.tipo === tipo));
  const itemRefs = useRef({});

  const salvar = async (cat, raw) => {
    const num = parseNum(raw);
    const existente = lancamentos[`${cat.id}-${mes}`];
    if (num == null) {
      if (existente) {
        setLancamentos((prev) => { const novo = { ...prev }; delete novo[`${cat.id}-${mes}`]; return novo; });
        await supabase.from("lancamento_mensal").delete().eq("id", existente.id);
      }
      return;
    }
    if (existente) {
      setLancamentos((prev) => ({ ...prev, [`${cat.id}-${mes}`]: { ...existente, valor: num } }));
      await supabase.from("lancamento_mensal").update({ valor: num }).eq("id", existente.id);
    } else {
      const { data } = await supabase.from("lancamento_mensal").insert({ categoria_id: cat.id, ano_id: anoId, mes, valor: num }).select().single();
      if (data) setLancamentos((prev) => ({ ...prev, [`${cat.id}-${mes}`]: data }));
    }
  };

  const focarProxima = (catId) => {
    const idx = todasCats.findIndex((c) => c.id === catId);
    if (idx < todasCats.length - 1) {
      const prox = todasCats[idx + 1];
      const el = itemRefs.current[prox.id];
      if (el) el.click();
    }
  };

  return (
    <div style={s.listaWrapper}>
      {grupos.map(({ tipo, label, cor, bg }) => {
        const cats = categorias.filter((c) => c.tipo === tipo);
        if (!cats.length) return null;

        const subtotal = cats.reduce((a, c) => {
          const l = lancamentos[`${c.id}-${mes}`];
          return a + (l ? Number(l.valor) : 0);
        }, 0);

        return (
          <div key={tipo} style={s.grupoCard}>
            <div style={{ ...s.grupoTitulo, background: bg }}>
              <span style={{ color: cor, fontWeight: 800 }}>{label}</span>
              <span style={{ color: cor, fontWeight: 700, fontSize: 13 }}>{fmt(subtotal)}</span>
            </div>
            {cats.map((cat) => {
              const l = lancamentos[`${cat.id}-${mes}`];
              return (
                <div key={cat.id} style={s.itemLinha}>
                  <div style={s.itemEsq}>
                    <span style={s.itemNome}>{cat.nome}</span>
                    {cat.valor_previsto != null && (
                      <span style={s.itemPrevisto}>prev. {fmt(cat.valor_previsto)}</span>
                    )}
                  </div>
                  <div ref={(el) => { if (el) itemRefs.current[cat.id] = el; else delete itemRefs.current[cat.id]; }}>
                    <InputAuto
                      valorInicial={l ? l.valor : ""}
                      onSalvar={(raw) => salvar(cat, raw)}
                      onEnter={() => focarProxima(cat.id)}
                      style={s.itemInput}
                      displayStyle={{ ...s.itemValor, color: l ? cor : "#ccc" }}
                      displayContent={l ? fmt(l.valor) : "—"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// SELETOR DE MÊS (chips horizontais com os visíveis)
// ============================================================
function SeletorMes({ mesesVisiveis, mesFoco, setMesFoco, onGerenciar }) {
  const ordenados = [...mesesVisiveis].sort((a, b) => a - b);
  return (
    <div style={s.seletorMes}>
      <div style={s.chipsRow}>
        {ordenados.map((mes) => (
          <button key={mes} onClick={() => setMesFoco(mes)} style={{
            ...s.chipMes,
            background: mes === mesFoco ? "#6c63ff" : "#fff",
            color: mes === mesFoco ? "#fff" : "#555",
            borderColor: mes === mesFoco ? "#6c63ff" : "#e3e3ee",
          }}>
            {MESES[mes - 1]}
            {mes === mesAtual && <span style={{ marginLeft: 5, fontSize: 9 }}>●</span>}
          </button>
        ))}
      </div>
      <button onClick={onGerenciar} style={s.btnConfigMes}>⚙️</button>
    </div>
  );
}

// ============================================================
// PAINEL COLUNAS VISÍVEIS
// ============================================================
function PainelColunas({ mesesVisiveis, onSalvar, onFechar }) {
  const [sel, setSel] = useState([...mesesVisiveis].sort((a, b) => a - b));
  const toggle = (mes) => setSel((p) => p.includes(mes) ? p.filter((m) => m !== mes) : [...p, mes].sort((a, b) => a - b));

  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={s.sheetHandle} />
        <h3 style={s.sheetTitulo}>Meses visíveis</h3>
        <p style={s.sheetSub}>Escolha quais meses aparecem na tela.</p>
        <div style={s.mesesGrid}>
          {MESES.map((m, i) => {
            const mes = i + 1;
            const ativo = sel.includes(mes);
            return (
              <button key={mes} onClick={() => toggle(mes)} style={{
                ...s.mesGridBtn,
                background: ativo ? "#6c63ff" : "#fff",
                color: ativo ? "#fff" : "#666",
                borderColor: ativo ? "#6c63ff" : "#e3e3ee",
              }}>
                {m}
                {mes === mesAtual && <span style={{ position: "absolute", top: 4, right: 6, fontSize: 8, color: ativo ? "#fff" : "#6c63ff" }}>●</span>}
              </button>
            );
          })}
        </div>
        <button style={s.btnTextoCheio} onClick={() => setSel([1,2,3,4,5,6,7,8,9,10,11,12])}>Mostrar todos</button>
        <div style={s.sheetAcoes}>
          <button style={s.btnSecundario} onClick={onFechar}>Cancelar</button>
          <button style={s.btnPrimario} onClick={() => { onSalvar(sel); onFechar(); }} disabled={!sel.length}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ABA ANUAIS
// ============================================================
function GastosAnuais({ gastosAnuais, anoId, onSalvo }) {
  const [novo, setNovo] = useState({ descricao: "", valor_previsto: "", valor_realizado: "" });
  const [salvando, setSalvando] = useState(false);

  const salvarNovo = async () => {
    if (!novo.descricao) return;
    setSalvando(true);
    await supabase.from("gasto_anual").insert({ ano_id: anoId, descricao: novo.descricao, valor_previsto: parseNum(novo.valor_previsto), valor_realizado: parseNum(novo.valor_realizado), ordem: gastosAnuais.length + 1 });
    setNovo({ descricao: "", valor_previsto: "", valor_realizado: "" });
    setSalvando(false);
    onSalvo();
  };

  const atualizar = async (id, campo, raw) => {
    await supabase.from("gasto_anual").update({ [campo]: parseNum(raw) }).eq("id", id);
    onSalvo();
  };

  const excluir = async (id) => {
    if (!confirm("Excluir este gasto anual?")) return;
    await supabase.from("gasto_anual").delete().eq("id", id);
    onSalvo();
  };

  const totalP = gastosAnuais.reduce((a, g) => a + (Number(g.valor_previsto) || 0), 0);
  const totalR = gastosAnuais.reduce((a, g) => a + (Number(g.valor_realizado) || 0), 0);

  return (
    <div style={s.listaWrapper}>
      <div style={s.grupoCard}>
        <div style={{ ...s.grupoTitulo, background: "#f0efff" }}>
          <span style={{ color: "#6c63ff", fontWeight: 800 }}>Gastos Anuais</span>
          <span style={{ color: "#6c63ff", fontWeight: 700, fontSize: 13 }}>{fmt(totalR)}</span>
        </div>
        {gastosAnuais.map((g) => {
          const dif = (g.valor_previsto || 0) - (g.valor_realizado || 0);
          return (
            <div key={g.id} style={{ ...s.itemLinha, flexWrap: "wrap" }}>
              <div style={{ ...s.itemEsq, flex: "1 1 100%", marginBottom: 6 }}>
                <span style={s.itemNome}>{g.descricao}</span>
                <span style={{ ...s.itemPrevisto, color: dif >= 0 ? "#2ecc71" : "#e05c5c" }}>
                  {dif >= 0 ? `economizou ${fmt(dif)}` : `estourou ${fmt(Math.abs(dif))}`}
                </span>
              </div>
              <div style={s.anualCampos}>
                <div style={s.anualCampo}>
                  <span style={s.anualMini}>Previsto</span>
                  <InputAuto valorInicial={g.valor_previsto} onSalvar={(v) => atualizar(g.id, "valor_previsto", v)}
                    style={s.itemInput} displayStyle={s.anualValor} displayContent={fmt(g.valor_previsto)} />
                </div>
                <div style={s.anualCampo}>
                  <span style={s.anualMini}>Realizado</span>
                  <InputAuto valorInicial={g.valor_realizado} onSalvar={(v) => atualizar(g.id, "valor_realizado", v)}
                    style={s.itemInput} displayStyle={s.anualValor} displayContent={fmt(g.valor_realizado)} />
                </div>
                <button onClick={() => excluir(g.id)} style={s.btnExcluirMini}>✕</button>
              </div>
            </div>
          );
        })}
        {/* Adicionar novo */}
        <div style={s.novoAnual}>
          <input style={s.inputNovo} placeholder="Nova descrição..." value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...s.inputNovo, textAlign: "right" }} placeholder="Previsto" inputMode="decimal" value={novo.valor_previsto} onChange={(e) => setNovo({ ...novo, valor_previsto: e.target.value })} />
            <input style={{ ...s.inputNovo, textAlign: "right" }} placeholder="Realizado" inputMode="decimal" value={novo.valor_realizado} onChange={(e) => setNovo({ ...novo, valor_realizado: e.target.value })} />
          </div>
          <button style={s.btnPrimario} onClick={salvarNovo} disabled={salvando || !novo.descricao}>Adicionar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ABA CATEGORIAS — auto-save
// ============================================================
function GerenciarCategorias({ categorias, onSalvo, onAdicionar }) {
  const salvarCampo = async (cat, campo, raw) => {
    const update = {};
    if (campo === "nome") { if (!String(raw).trim()) return; update.nome = String(raw).trim(); }
    else if (campo === "tipo") update.tipo = raw;
    else if (campo === "valor_previsto") update.valor_previsto = parseNum(raw);
    await supabase.from("categoria").update(update).eq("id", cat.id);
    onSalvo();
  };

  const excluir = async (cat) => {
    if (!confirm(`Excluir "${cat.nome}"? Os lançamentos também somem.`)) return;
    await supabase.from("categoria").update({ ativo: false }).eq("id", cat.id);
    onSalvo();
  };

  const mover = async (cat, dir, cats) => {
    const idx = cats.findIndex((c) => c.id === cat.id);
    const alvo = cats[idx + dir];
    if (!alvo) return;
    await Promise.all([
      supabase.from("categoria").update({ ordem: alvo.ordem }).eq("id", cat.id),
      supabase.from("categoria").update({ ordem: cat.ordem }).eq("id", alvo.id),
    ]);
    onSalvo();
  };

  const grupos = [
    { tipo: "fixa", label: "Contas Fixas", cor: "#6c63ff", bg: "#f0efff" },
    { tipo: "variavel", label: "Gastos Variáveis", cor: "#c45000", bg: "#fff8ee" },
    { tipo: "recebimento", label: "Recebimentos", cor: "#1a7a4a", bg: "#e6fff2" },
  ];

  return (
    <div style={s.listaWrapper}>
      <button style={s.btnAddCategoria} onClick={onAdicionar}>+ Nova categoria</button>
      <p style={s.dicaCat}>Toque em qualquer campo para editar. Salva sozinho.</p>
      {grupos.map(({ tipo, label, cor, bg }) => {
        const cats = categorias.filter((c) => c.tipo === tipo);
        if (!cats.length) return null;
        return (
          <div key={tipo} style={s.grupoCard}>
            <div style={{ ...s.grupoTitulo, background: bg }}>
              <span style={{ color: cor, fontWeight: 800 }}>{label}</span>
            </div>
            {cats.map((cat, idx) => (
              <div key={cat.id} style={s.catLinha}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InputAuto
                    valorInicial={cat.nome}
                    onSalvar={(v) => salvarCampo(cat, "nome", v)}
                    textMode
                    style={s.catInputNome}
                    displayStyle={s.catNome}
                    displayContent={cat.nome}
                  />
                  <div style={s.catSegundaLinha}>
                    <select
                      style={{ ...s.catSelect, color: cor }}
                      value={cat.tipo}
                      onChange={(e) => salvarCampo(cat, "tipo", e.target.value)}>
                      <option value="fixa">Fixa</option>
                      <option value="variavel">Variável</option>
                      <option value="recebimento">Recebimento</option>
                    </select>
                    <InputAuto
                      valorInicial={cat.valor_previsto ? cat.valor_previsto : ""}
                      onSalvar={(v) => salvarCampo(cat, "valor_previsto", v)}
                      style={s.catInputPrev}
                      displayStyle={s.catPrevisto}
                      displayContent={cat.valor_previsto ? `prev. ${fmt(cat.valor_previsto)}` : "sem previsto"}
                    />
                  </div>
                </div>
                <div style={s.catAcoes}>
                  <button onClick={() => mover(cat, -1, cats)} style={s.btnOrdem} disabled={idx === 0}>↑</button>
                  <button onClick={() => mover(cat, 1, cats)} style={s.btnOrdem} disabled={idx === cats.length - 1}>↓</button>
                  <button onClick={() => excluir(cat)} style={s.btnExcluirMini}>✕</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// MODAL NOVA CATEGORIA
// ============================================================
function ModalNovaCategoria({ onFechar, onSalvo, totalCategorias }) {
  const [form, setForm] = useState({ nome: "", tipo: "fixa", valor_previsto: "" });
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!form.nome) return;
    setSalvando(true);
    await supabase.from("categoria").insert({ nome: form.nome, tipo: form.tipo, valor_previsto: parseNum(form.valor_previsto), ordem: totalCategorias + 1 });
    setSalvando(false);
    onSalvo();
    onFechar();
  };

  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={s.sheetHandle} />
        <h3 style={s.sheetTitulo}>Nova categoria</h3>
        <label style={s.label}>Nome</label>
        <input style={s.input} value={form.nome} autoFocus onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Streaming" />
        <label style={s.label}>Tipo</label>
        <select style={s.input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          <option value="fixa">Fixa</option>
          <option value="variavel">Variável</option>
          <option value="recebimento">Recebimento</option>
        </select>
        <label style={s.label}>Valor previsto (R$)</label>
        <input style={s.input} inputMode="decimal" value={form.valor_previsto} onChange={(e) => setForm({ ...form, valor_previsto: e.target.value })} placeholder="0,00" />
        <div style={s.sheetAcoes}>
          <button style={s.btnSecundario} onClick={onFechar}>Cancelar</button>
          <button style={s.btnPrimario} onClick={salvar} disabled={salvando || !form.nome}>{salvando ? "..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const anoAtual = new Date().getFullYear();

  const [anoSelecionado, setAnoSelecionado] = useState(null);
  const [mesFoco, setMesFoco] = useState(mesAtual);
  const [aba, setAba] = useState("mensal");
  const [modalCategoria, setModalCategoria] = useState(false);
  const [painelColunas, setPainelColunas] = useState(false);
  const [menuAno, setMenuAno] = useState(false);
  const [novoAno, setNovoAno] = useState("");

  const g = useGastos(anoSelecionado);

  useEffect(() => {
    if (g.anos.length && !anoSelecionado) {
      setAnoSelecionado(g.anos.find((a) => a.ano === anoAtual) || g.anos[0]);
    }
  }, [g.anos, anoSelecionado, anoAtual]);

  // Garante que o mês em foco está entre os visíveis
  useEffect(() => {
    if (g.mesesVisiveis && g.mesesVisiveis.length && !g.mesesVisiveis.includes(mesFoco)) {
      setMesFoco([...g.mesesVisiveis].sort((a, b) => a - b)[0]);
    }
  }, [g.mesesVisiveis, mesFoco]);

  const criarAno = async () => {
    const num = parseInt(novoAno);
    if (!num || g.anos.find((a) => a.ano === num)) return;
    const { data } = await supabase.from("ano").insert({ ano: num }).select().single();
    await g.recarregarAnos();
    setAnoSelecionado(data);
    setNovoAno("");
    setMenuAno(false);
  };

  const ABAS = [
    { id: "mensal", label: "Mês", icon: "📅" },
    { id: "anuais", label: "Anuais", icon: "📌" },
    { id: "categorias", label: "Categorias", icon: "🏷️" },
  ];

  return (
    <div style={s.app}>
      {/* HEADER */}
      <header style={s.header}>
        <div style={s.headerTopo}>
          <span style={s.logo}>💰 Meus Gastos</span>
          <button style={s.anoBtn} onClick={() => setMenuAno(!menuAno)}>
            {anoSelecionado?.ano || "—"} ▾
          </button>
        </div>
        {menuAno && (
          <div style={s.anoMenu}>
            {g.anos.map((a) => (
              <button key={a.id} style={{ ...s.anoMenuItem, color: anoSelecionado?.id === a.id ? "#6c63ff" : "#555", fontWeight: anoSelecionado?.id === a.id ? 700 : 500 }}
                onClick={() => { setAnoSelecionado(a); setMenuAno(false); }}>
                {a.ano}
              </button>
            ))}
            <div style={s.anoNovo}>
              <input style={s.anoNovoInput} placeholder="Novo ano" value={novoAno} inputMode="numeric" maxLength={4}
                onChange={(e) => setNovoAno(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criarAno()} />
              <button style={s.btnPrimarioMini} onClick={criarAno}>+</button>
            </div>
          </div>
        )}
      </header>

      {/* CONTEÚDO */}
      {g.loading || !anoSelecionado ? (
        <div style={s.loading}>Carregando...</div>
      ) : (
        <main style={s.main}>
          {aba === "mensal" && g.mesesVisiveis && (
            <>
              <SeletorMes mesesVisiveis={g.mesesVisiveis} mesFoco={mesFoco} setMesFoco={setMesFoco} onGerenciar={() => setPainelColunas(true)} />
              <ResumoMes
                categorias={g.categorias} lancamentos={g.lancamentos} salarios={g.salarios}
                anoId={anoSelecionado.id} mes={mesFoco} onSalarioSalvo={g.recarregarSalarios}
                setSalarios={g.setSalarios}
              />
              <ListaLancamentos
                categorias={g.categorias} lancamentos={g.lancamentos}
                anoId={anoSelecionado.id} mes={mesFoco} onSalvo={g.recarregarLancamentos}
                setLancamentos={g.setLancamentos}
              />
            </>
          )}
          {aba === "anuais" && <GastosAnuais gastosAnuais={g.gastosAnuais} anoId={anoSelecionado.id} onSalvo={g.recarregarGastosAnuais} />}
          {aba === "categorias" && <GerenciarCategorias categorias={g.categorias} onSalvo={g.recarregarCategorias} onAdicionar={() => setModalCategoria(true)} />}
        </main>
      )}

      {/* NAV INFERIOR */}
      <nav style={s.navInferior}>
        {ABAS.map((a) => (
          <button key={a.id} style={{ ...s.navItem, color: aba === a.id ? "#6c63ff" : "#aaa" }} onClick={() => setAba(a.id)}>
            <span style={{ fontSize: 20 }}>{a.icon}</span>
            <span style={s.navLabel}>{a.label}</span>
          </button>
        ))}
      </nav>

      {modalCategoria && <ModalNovaCategoria totalCategorias={g.categorias.length} onFechar={() => setModalCategoria(false)} onSalvo={g.recarregarCategorias} />}
      {painelColunas && g.mesesVisiveis && <PainelColunas mesesVisiveis={g.mesesVisiveis} onSalvar={g.salvarMesesVisiveis} onFechar={() => setPainelColunas(false)} />}
    </div>
  );
}

// ============================================================
// ESTILOS — mobile-first, retrato
// ============================================================
const s = {
  app: { fontFamily: "'Inter', -apple-system, sans-serif", minHeight: "100vh", background: "#f4f4fb", color: "#1a1a2e", paddingBottom: 76, maxWidth: 560, margin: "0 auto" },

  header: { background: "#fff", borderBottom: "1px solid #ececf5", position: "sticky", top: 0, zIndex: 20, padding: "14px 16px 12px" },
  headerTopo: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { fontWeight: 800, fontSize: 18, letterSpacing: "-0.4px" },
  anoBtn: { background: "#f0efff", color: "#6c63ff", border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  anoMenu: { marginTop: 10, background: "#fafaff", borderRadius: 12, padding: 8, display: "flex", flexWrap: "wrap", gap: 6, border: "1px solid #ececf5" },
  anoMenuItem: { background: "#fff", border: "1px solid #ececf5", borderRadius: 8, padding: "6px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  anoNovo: { display: "flex", gap: 6, alignItems: "center" },
  anoNovoInput: { border: "1px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 14, width: 90, outline: "none", fontFamily: "inherit" },
  btnPrimarioMini: { background: "#6c63ff", color: "#fff", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: 18, fontWeight: 700, cursor: "pointer" },

  main: { padding: "14px 14px 0" },
  loading: { display: "flex", justifyContent: "center", padding: 80, color: "#aaa", fontSize: 15 },

  seletorMes: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  chipsRow: { display: "flex", gap: 8, flex: 1, overflowX: "auto", paddingBottom: 2 },
  chipMes: { flexShrink: 0, padding: "8px 16px", borderRadius: 22, border: "1.5px solid", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnConfigMes: { flexShrink: 0, background: "#fff", border: "1.5px solid #e3e3ee", borderRadius: 12, width: 40, height: 38, fontSize: 16, cursor: "pointer" },

  resumo: { marginBottom: 16 },
  saldoHero: { background: "linear-gradient(135deg, #6c63ff 0%, #8b7fff 100%)", borderRadius: 18, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 3, boxShadow: "0 6px 20px #6c63ff44", marginBottom: 12 },
  saldoLabel: { color: "#e8e6ff", fontSize: 13, fontWeight: 600 },
  saldoValor: { fontSize: 34, fontWeight: 800, letterSpacing: "-1.2px", lineHeight: 1.1 },
  saldoSub: { color: "#e8e6ff", fontSize: 12, fontWeight: 500 },

  salarioBox: { background: "#fff", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 4px #0001", marginBottom: 12 },
  salarioBoxLabel: { fontSize: 13, fontWeight: 600, color: "#888" },
  salarioDisplay: { fontSize: 20, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.5px", cursor: "pointer", textAlign: "right" },
  salarioInput: { fontSize: 20, fontWeight: 800, border: "none", borderBottom: "2px solid #6c63ff", outline: "none", textAlign: "right", width: 150, padding: "2px 0", fontFamily: "inherit", background: "transparent" },

  miniGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 },
  miniCard: { background: "#fff", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 3, boxShadow: "0 1px 4px #0001" },
  miniValor: { fontSize: 19, fontWeight: 800, letterSpacing: "-0.5px" },
  miniLabel: { fontSize: 11, color: "#999", fontWeight: 600 },

  progressoBox: { background: "#fff", borderRadius: 14, padding: "14px 18px", boxShadow: "0 1px 4px #0001" },
  progressoTopo: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  progressoLabel: { fontSize: 12, color: "#888", fontWeight: 600 },
  progressoPct: { fontSize: 14, fontWeight: 800 },
  progressoTrilha: { height: 8, background: "#f0f0f5", borderRadius: 5, overflow: "hidden" },
  progressoBarra: { height: "100%", borderRadius: 5, transition: "width 0.3s" },

  listaWrapper: { display: "flex", flexDirection: "column", gap: 14 },
  grupoCard: { background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 6px #0001" },
  grupoTitulo: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.6px" },

  itemLinha: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #f5f5fa" },
  itemEsq: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 },
  itemNome: { fontSize: 15, fontWeight: 600, color: "#2a2a3e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  itemPrevisto: { fontSize: 11, color: "#aaa", fontWeight: 500 },
  itemValor: { fontSize: 17, fontWeight: 700, cursor: "pointer", textAlign: "right", minWidth: 90, padding: "4px 0" },
  itemInput: { fontSize: 17, fontWeight: 700, border: "none", borderBottom: "2px solid #6c63ff", outline: "none", textAlign: "right", width: 120, padding: "2px 0", fontFamily: "inherit", background: "#f7f7ff" },

  anualCampos: { display: "flex", alignItems: "flex-end", gap: 14, width: "100%", justifyContent: "flex-end" },
  anualCampo: { display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" },
  anualMini: { fontSize: 10, color: "#aaa", fontWeight: 600, textTransform: "uppercase" },
  anualValor: { fontSize: 15, fontWeight: 700, cursor: "pointer", color: "#2a2a3e", textAlign: "right", minWidth: 70 },

  novoAnual: { display: "flex", flexDirection: "column", gap: 8, padding: 16, borderTop: "1px solid #f5f5fa", background: "#fafaff" },
  inputNovo: { flex: 1, border: "1px solid #e3e3ee", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },

  catLinha: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderTop: "1px solid #f5f5fa" },
  catNome: { fontSize: 15, fontWeight: 600, color: "#2a2a3e", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  catInputNome: { fontSize: 15, fontWeight: 600, border: "none", borderBottom: "2px solid #6c63ff", outline: "none", width: "100%", padding: "2px 0", fontFamily: "inherit", background: "#f7f7ff", boxSizing: "border-box" },
  catSegundaLinha: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 },
  catSelect: { border: "none", background: "transparent", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0, outline: "none" },
  catPrevisto: { fontSize: 12, color: "#999", fontWeight: 500, cursor: "pointer" },
  catInputPrev: { fontSize: 13, border: "none", borderBottom: "1.5px solid #6c63ff", outline: "none", width: 90, padding: "1px 0", fontFamily: "inherit", background: "#f7f7ff" },
  catAcoes: { display: "flex", gap: 4, alignItems: "center", flexShrink: 0 },

  btnAddCategoria: { background: "#6c63ff", color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" },
  dicaCat: { fontSize: 12, color: "#aaa", textAlign: "center", margin: "-4px 0 0" },

  navInferior: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #ececf5", display: "flex", justifyContent: "space-around", padding: "8px 0 10px", zIndex: 20, maxWidth: 560, margin: "0 auto" },
  navItem: { background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", fontFamily: "inherit", padding: "2px 20px" },
  navLabel: { fontSize: 11, fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "#0006", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 },
  sheet: { background: "#fff", borderRadius: "20px 20px 0 0", padding: "10px 20px 28px", width: "100%", maxWidth: 560, boxShadow: "0 -4px 30px #0003" },
  sheetHandle: { width: 40, height: 4, background: "#ddd", borderRadius: 3, margin: "0 auto 16px" },
  sheetTitulo: { margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#1a1a2e" },
  sheetSub: { fontSize: 13, color: "#999", marginBottom: 16 },
  sheetAcoes: { display: "flex", gap: 10, marginTop: 20 },

  mesesGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9, marginBottom: 14 },
  mesGridBtn: { padding: "12px 6px", borderRadius: 10, border: "1.5px solid", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", position: "relative" },
  btnTextoCheio: { background: "#f0efff", color: "#6c63ff", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" },

  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 5, marginTop: 14, textTransform: "uppercase", letterSpacing: "0.4px" },
  input: { width: "100%", border: "1.5px solid #e3e3ee", borderRadius: 10, padding: "11px 14px", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },

  btnPrimario: { flex: 1, background: "#6c63ff", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecundario: { flex: 1, background: "#f0f0f5", color: "#666", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnOrdem: { background: "#f4f4fb", color: "#999", border: "none", borderRadius: 7, width: 30, height: 30, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  btnExcluirMini: { background: "#fff0f0", color: "#e05c5c", border: "none", borderRadius: 7, width: 30, height: 30, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
