import type { MiniGame, SabotageKind } from './protocol';

export interface TaskStep {
  stationId: string;
  game: MiniGame;
}

export interface TaskDef {
  id: string;
  name: string;
  kind: 'common' | 'short' | 'long';
  steps: TaskStep[];
}

const one = (id: string, name: string, kind: TaskDef['kind'], stationId: string, game: MiniGame): TaskDef => ({
  id,
  name,
  kind,
  steps: [{ stationId, game }],
});

export const TASKS: TaskDef[] = [
  // Comuns: quando saem, todos os jogadores as têm.
  one('c-cartao', 'Validar cartão de acesso', 'common', 'seguranca-a', 'keypad'),
  one('c-arranque', 'Sequência de arranque', 'common', 'reunioes-a', 'sequence'),
  // Curtas
  one('s-cabos-treino', 'Treinar o modelo', 'short', 'treino-a', 'train'),
  one('s-metricas', 'Calibrar métricas', 'short', 'avaliacao-a', 'calibrate'),
  one('s-amostras', 'Limpar amostras corrompidas', 'short', 'rotulagem-a', 'clean'),
  one('s-cofre', 'Código do cofre de testes', 'short', 'redteam-a', 'keypad'),
  one('s-checklist', 'Checklist de revisão', 'short', 'etica-a', 'sequence'),
  one('s-ventoinhas', 'Calibrar ventoinhas', 'short', 'arrefecimento-a', 'calibrate'),
  one('s-duplicados', 'Rotular imagens do dataset', 'short', 'arquivo-a', 'label'),
  one('s-cafe', 'Configurar o chatbot da cafetaria', 'short', 'cafetaria-a', 'prompt'),
  // Longas: vários passos em salas diferentes.
  {
    id: 'l-dataset',
    name: 'Transferir dataset',
    kind: 'long',
    steps: [
      { stationId: 'arquivo-b', game: 'transfer' },
      { stationId: 'datacenter-a', game: 'transfer' },
    ],
  },
  {
    id: 'l-pesos',
    name: 'Publicar pesos do modelo',
    kind: 'long',
    steps: [
      { stationId: 'treino-b', game: 'transfer' },
      { stationId: 'avaliacao-b', game: 'calibrate' },
      { stationId: 'seguranca-b', game: 'keypad' },
    ],
  },
  {
    id: 'l-cablagem',
    name: 'Afinar o modelo (fine-tuning)',
    kind: 'long',
    steps: [
      { stationId: 'datacenter-b', game: 'label' },
      { stationId: 'arrefecimento-b', game: 'train' },
      { stationId: 'redteam-b', game: 'prompt' },
    ],
  },
  {
    id: 'l-auditoria',
    name: 'Auditoria de dados',
    kind: 'long',
    steps: [
      { stationId: 'rotulagem-b', game: 'clean' },
      { stationId: 'etica-b', game: 'sequence' },
      { stationId: 'cafetaria-b', game: 'clean' },
    ],
  },
];

export function taskDef(id: string): TaskDef | undefined {
  return TASKS.find((t) => t.id === id);
}

/** Mini-jogos com que os Desalinhados destroem a evidência, atribuídos em ciclo às consolas. */
export const HIDE_GAMES: MiniGame[] = ['clean', 'keypad', 'sequence', 'calibrate'];

/** Mini-jogo que repara cada sabotagem. */
export const FIX_GAMES: Record<Exclude<SabotageKind, 'doors'>, MiniGame> = {
  injection: 'calibrate',
  blackout: 'switches',
  guardrails: 'hold',
  cooling: 'keypad',
};
