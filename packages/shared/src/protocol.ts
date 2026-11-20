import type { Lang, Settings } from './constants';

export type Role = 'crew' | 'impostor';
export type Phase = 'lobby' | 'playing' | 'meeting' | 'ended';
/**
 * Passo 1 — speaking: discussão livre por voz; cada jogador vivo escolhe uma opção da pergunta da ronda e pode
 * mudar quantas vezes quiser (as escolhas são públicas, ao vivo). Só o anfitrião abre a votação.
 * Passo 2 — voting: a decisão do laboratório é revelada (com o objetivo dos Desalinhados) e vota-se a expulsão;
 * result: resultado da expulsão.
 */
export type MeetingStage = 'speaking' | 'voting' | 'result';
export type SabotageKind = 'injection' | 'blackout' | 'guardrails' | 'cooling' | 'doors';
export type MiniGame =
  | 'sequence'
  | 'calibrate'
  | 'transfer'
  | 'clean'
  | 'keypad'
  | 'switches'
  | 'hold'
  | 'scan'
  /** Mini-jogos de IA: rotular imagens, montar um prompt, treinar com paragem antecipada. */
  | 'label'
  | 'prompt'
  | 'train';
export type WinReason = 'tasks' | 'ejected' | 'outnumbered' | 'sabotage' | 'decisions';

export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  /** Morte conhecida publicamente (revelada em reunião). */
  dead: boolean;
  /** Só preenchido para colegas Desalinhados ou no fim do jogo. */
  role?: Role;
}

export interface TaskView {
  id: string;
  defId: string;
  /** Passos já concluídos. */
  step: number;
  done: boolean;
}

export interface MeetingView {
  stage: MeetingStage;
  /** 0 na fase speaking, que não tem tempo limite. */
  endsAt: number;
  reason: 'body' | 'emergency';
  callerId: string;
  victimId?: string;
  /** Jogadores vivos no início da reunião: primeiro quem convocou, depois por sorteio. */
  participants: string[];
  /** Escolhas feitas na ronda de opiniões: jogador -> índice da opção (públicas, ao vivo). */
  picks: Record<string, number>;
  /** A partir da votação: a opção vencedora e o objetivo dos Desalinhados. */
  decision?: DecisionView;
  /** O laboratório chegou ao limite de decisões desalinhadas: o jogo acaba no fim do resultado. */
  decisionLoss?: boolean;
  voted: string[];
  yourVote?: string;
  /** Na votação (ao vivo) e no resultado: alvo (ou 'skip') -> votantes. Com votos anónimos os votantes vêm como ''. */
  ballots?: Record<string, string[]>;
  ejectedId?: string | null;
  /** Só com «confirmar expulsões» ligado. */
  ejectedWasImpostor?: boolean;
  impostorsLeft?: number;
}

export interface DecisionView {
  /** Opção vencedora, ou null em caso de empate ou sem escolhas. */
  chosen: number | null;
  /** As opções que os Desalinhados queriam. */
  goal: number[];
}

/** A pergunta da ronda, na língua de quem a recebe. */
export interface RoundView {
  question: string;
  options: string[];
  /** Só para Desalinhados: as opções que querem que o laboratório escolha. */
  goal?: number[];
  /** Só para a Equipa: a opção dos Desalinhados, se este jogador encontrou a evidência da ronda (privada). */
  hints: number[];
}

export interface SabotageView {
  kind: Exclude<SabotageKind, 'doors'>;
  endsAt?: number;
  activePanels: string[];
}

export interface View {
  code: string;
  phase: Phase;
  hostId: string;
  serverNow: number;
  minPlayers: number;
  settings: Settings;
  players: PublicPlayer[];
  you: {
    id: string;
    role?: Role;
    alive: boolean;
    tasks: TaskView[];
    killReadyAt: number;
    emergencyLeft: number;
    sabotageReadyAt: number;
    doorReadyAt: Record<string, number>;
    inVent?: string;
  };
  /** Pergunta da ronda (null sem tema). */
  round: RoundView | null;
  /** Decisões desalinhadas até agora e limite (0 = sem limite); null sem tema. */
  badDecisions: { count: number; limit: number } | null;
  /** null quando a barra de tarefas está escondida. */
  taskProgress: number | null;
  emergencyReadyAt: number;
  sabotage: SabotageView | null;
  /** Só para Desalinhados: consola onde está a evidência da ronda, se ainda não foi destruída. */
  evidence: string[];
  /** 1 se a evidência da ronda ainda está escondida nas tarefas, 0 se foi destruída (todos veem). */
  evidenceLeft: number;
  lockedRooms: string[];
  meeting?: MeetingView;
  winner?: Role;
  winReason?: WinReason;
}

/** [id, x, y, fantasma(0|1)] */
export type SnapPlayer = [string, number, number, number];
/** [id da vítima, x, y] */
export type SnapBody = [string, number, number];

export interface Snap {
  t: number;
  x: number;
  y: number;
  /**
   * Contador de teletransportes do próprio jogador (início, reunião, conduta, movimento recusado).
   * O cliente só substitui a posição que prevê pela do servidor quando este valor muda.
   */
  w: number;
  players: SnapPlayer[];
  bodies: SnapBody[];
}

export interface ChatMessage {
  from: string;
  text: string;
  ghost: boolean;
}

/** Códigos dos avisos enviados pelo servidor; o texto é traduzido no cliente. */
export type EventCode =
  | 'killed'
  | 'noMeetings'
  | 'buttonCooldown'
  | 'critical'
  | 'tasksHidden'
  | 'minPlayers'
  /** Evidência encontrada numa tarefa: params.option (letra e texto) é a opção que os Desalinhados querem. */
  | 'clueGoal';

export interface GameEvent {
  type: 'killed' | 'error' | 'info';
  code: EventCode;
  params?: Record<string, number | string>;
}

/** Mensagens cliente -> servidor. */
export interface ClientMessages {
  /** Direção pedida; o servidor move o jogador (usado pelos bots de teste). */
  input: { dx: number; dy: number };
  /** Posição calculada pelo cliente; o servidor valida a velocidade e as colisões. */
  move: { x: number; y: number; w: number };
  color: { color: string };
  /** Língua em que este jogador quer receber temas e pistas. */
  lang: { lang: Lang };
  settings: Partial<Settings>;
  start: Record<string, never>;
  kill: { target: string };
  report: { body: string };
  emergency: Record<string, never>;
  /** Passo atual da tarefa concluído (o mini-jogo corre no cliente, como é habitual no género). */
  taskStep: { taskId: string };
  /** Só Desalinhados vivos: destroem a evidência escondida nesta consola. A Equipa encontra-a ao fazer tarefas. */
  evidence: { stationId: string };
  sabotage: { kind: SabotageKind; roomId?: string };
  fix: { panelId: string };
  vent: { action: 'enter' | 'move' | 'exit'; to?: string };
  /** Jogador vivo (fase speaking): a opção que defende. Pode mudar até o anfitrião abrir a votação. */
  decide: { option: number };
  vote: { target: string };
  /** Só o anfitrião: fecha as escolhas da discussão e abre a votação de expulsão. */
  openVoting: Record<string, never>;
  chat: { text: string };
  playAgain: Record<string, never>;
  /** Só o anfitrião: termina o jogo em curso e leva todos de volta ao lobby. */
  toLobby: Record<string, never>;
}
