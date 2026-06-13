-- ============================================================
-- ADICIONAR SALÁRIO
-- Cole isso no SQL Editor do Supabase APÓS rodar o schema principal
-- ============================================================

create table salario_mensal (
  id         uuid primary key default gen_random_uuid(),
  ano_id     uuid not null references ano(id) on delete cascade,
  mes        int not null check (mes between 1 and 12),
  valor      numeric(10,2) not null,
  created_at timestamptz not null default now(),

  unique (ano_id, mes)
);

create index on salario_mensal (ano_id, mes);
