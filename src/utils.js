// Funções puras de formatação e cálculo, sem estado.

export const hoje = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD no fuso local
export const n = x => Number(x) || 0;
export const brl = x => n(x).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// para buscas e comparações: ignora acentos e maiúsculas ("são joão" = "SAO JOAO")
export const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const data = s => s ? s.split('-').reverse().join('/') : '—';

export function calc(v) {
  const mensal = n(v.remuneracao) + n(v.periculosidade) + n(v.premiacao)
    + n(v.assiduidade) + n(v.alimentacao) + n(v.adicional);
  return { mensal, anual: mensal * 12 };
}

export function diasAbertos(v) {
  if (!v.iniciada) return 0;
  return Math.round((new Date(v.fechada || hoje()) - new Date(v.iniciada)) / 864e5);
}

export const foraSla = v => n(v.sla) > 0 && diasAbertos(v) > n(v.sla);

// converte vagas salvas em versões antigas:
// - periculosidade era "sim/não" (30% da remuneração), virou valor
// - não existia status; quem tinha data de fechamento está fechada, o resto aberta
export function migrar(v) {
  const r = { ...v };
  if (typeof r.periculosidade === 'boolean') r.periculosidade = r.periculosidade ? n(r.remuneracao) * 0.3 : 0;
  // vagas antigas da planilha: status vazio, mas a Situação diz "Cancelada"/"Congelada"
  const sit = (r.situacao || '').toLowerCase();
  if (!r.status) r.status = sit === 'cancelada' ? 'cancelada' : sit === 'congelada' ? 'congelada' : r.fechada ? 'fechada' : 'aberta';
  return r;
}

// autoverificação rápida das regras de cálculo
console.assert(calc({ remuneracao: 2000, periculosidade: 600, alimentacao: 500 }).mensal === 3100, 'calc mensal');
console.assert(calc({ remuneracao: 1000 }).anual === 12000, 'calc anual');
console.assert(migrar({ remuneracao: 2000, periculosidade: true }).periculosidade === 600, 'migração periculosidade');
console.assert(migrar({ fechada: '2026-01-10' }).status === 'fechada' && migrar({}).status === 'aberta', 'migração status');
console.assert(migrar({ status: 'congelada' }).status === 'congelada', 'migração mantém status');
console.assert(migrar({ situacao: 'Cancelada', fechada: '2026-01-10' }).status === 'cancelada', 'migração status pela situação');
console.assert(normalizar('São João Ação') === 'sao joao acao' && normalizar(null) === '', 'normalizar sem acento');
console.assert(diasAbertos({ iniciada: '2026-01-01', fechada: '2026-01-31' }) === 30, 'dias abertos');
console.assert(foraSla({ iniciada: '2026-01-01', fechada: '2026-02-15', sla: 30 }), 'fora do SLA');
