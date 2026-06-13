-- ============================================================
-- SCHEMA - Controle de Gastos
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- Extensão para UUID (já vem ativa no Supabase, mas garantindo)
create extension if not exists "pgcrypto";


-- ------------------------------------------------------------
-- CATEGORIAS
-- tipo: 'fixa' | 'variavel' | 'recebimento'
-- valor_previsto: null para recebimentos
-- ordem: controla a exibição na tela
-- ------------------------------------------------------------
create table categoria (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          text not null check (tipo in ('fixa', 'variavel', 'recebimento')),
  valor_previsto numeric(10,2),
  ordem         int not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);


-- ------------------------------------------------------------
-- ANOS
-- Um registro por ano de controle
-- ------------------------------------------------------------
create table ano (
  id         uuid primary key default gen_random_uuid(),
  ano        int not null unique,
  created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- LANÇAMENTOS MENSAIS
-- Um registro = uma célula preenchida da planilha
-- mes: 1 (janeiro) a 12 (dezembro)
-- ------------------------------------------------------------
create table lancamento_mensal (
  id           uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categoria(id) on delete cascade,
  ano_id       uuid not null references ano(id) on delete cascade,
  mes          int not null check (mes between 1 and 12),
  valor        numeric(10,2) not null,
  created_at   timestamptz not null default now(),

  unique (categoria_id, ano_id, mes)  -- impede duplicata para mesma célula
);


-- ------------------------------------------------------------
-- GASTOS ANUAIS
-- Equivalente à aba "Anuais" da planilha
-- ------------------------------------------------------------
create table gasto_anual (
  id               uuid primary key default gen_random_uuid(),
  ano_id           uuid not null references ano(id) on delete cascade,
  descricao        text not null,
  valor_previsto   numeric(10,2),
  valor_realizado  numeric(10,2),
  ordem            int not null default 0,
  created_at       timestamptz not null default now()
);


-- ============================================================
-- ÍNDICES
-- ============================================================
create index on lancamento_mensal (ano_id, mes);
create index on lancamento_mensal (categoria_id);
create index on gasto_anual (ano_id);


-- ============================================================
-- SEED — dados iniciais baseados na planilha 2026
-- ============================================================

-- Ano 2026
insert into ano (ano) values (2026);


-- Categorias fixas (têm previsto e lançamento todo mês)
insert into categoria (nome, tipo, valor_previsto, ordem) values
  ('Água',                  'fixa',     210,   1),
  ('Luz',                   'fixa',     350,   2),
  ('Internet',              'fixa',     100,   3),
  ('Sky',                   'fixa',     600,   4),
  ('Academia Ju',           'fixa',     300,   5),
  ('Cartão Caxpa',          'fixa',     750,   6),
  ('Academia Caxpa',        'fixa',     250,   7),
  ('Unimed',                'fixa',    2000,   8),
  ('Vivo Ju',               'fixa',      60,   9),
  ('Vivo Caxpa + Eugênia',  'fixa',     130,  10),
  ('INSS Juba',             'fixa',     180,  11),
  ('DAS',                   'fixa',    1500,  12),
  ('INSS',                  'fixa',     180,  13),
  ('Honorários',            'fixa',     260,  14);

-- Categorias variáveis (têm previsto como referência, lançamento opcional)
insert into categoria (nome, tipo, valor_previsto, ordem) values
  ('Unha',           'variavel',   200,  15),
  ('Farmácia',       'variavel',  2000,  16),
  ('Gasolina',       'variavel',   500,  17),
  ('Ração',          'variavel',   100,  18),
  ('Mercado',        'variavel',  2000,  19),
  ('Futuro Craque',  'variavel',   200,  20),
  ('Lanches',        'variavel',   800,  21),
  ('Diversos',       'variavel',  2500,  22);

-- Recebimentos (sem previsto)
insert into categoria (nome, tipo, valor_previsto, ordem) values
  ('Mãe',   'recebimento', null, 23),
  ('Elisa', 'recebimento', null, 24),
  ('Luís',  'recebimento', null, 25);


-- Gastos anuais 2026 (aba Anuais)
insert into gasto_anual (ano_id, descricao, valor_previsto, valor_realizado, ordem)
select
  a.id,
  g.descricao,
  g.previsto,
  g.realizado,
  g.ordem
from ano a, (values
  ('DPVAT Moto Caxpa',  250,  400, 1),
  ('DPVAT Carro',      1700, 2000, 2),
  ('Seguro Carro',     3000, 1992, 3),
  ('IPTU',              450,  450, 4)
) as g(descricao, previsto, realizado, ordem)
where a.ano = 2026;


-- ============================================================
-- VIEW AUXILIAR — resumo mensal (opcional, facilita o frontend)
-- Retorna para cada categoria+ano+mês: previsto e realizado
-- ============================================================
create or replace view resumo_mensal as
select
  c.id            as categoria_id,
  c.nome          as categoria,
  c.tipo,
  c.valor_previsto,
  a.ano,
  lm.mes,
  lm.valor        as valor_realizado
from categoria c
cross join ano a
left join lancamento_mensal lm
  on lm.categoria_id = c.id
  and lm.ano_id = a.id
where c.ativo = true
order by a.ano, lm.mes, c.ordem;
