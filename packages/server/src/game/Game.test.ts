import { describe, expect, it } from 'vitest';
import {
  CRITICAL_MS,
  RESULT_MS,
  PANELS,
  STATIONS,
  VENTS,
  taskDef,
  type ChatMessage,
  type Snap,
  type View,
} from '@desalinhados/shared';
import { THEME_CONTENT, type QuestionItem } from '@desalinhados/shared/content';
import { BAD_DECISION_KILL_FACTOR, GOOD_DECISION_KILL_FACTOR, Game } from './Game';

interface Harness {
  game: Game;
  ids: string[];
  views: Map<string, View>;
  snaps: Map<string, Snap>;
  sent: { id: string; type: string; payload: any }[];
  now: number;
  tick(ms?: number): void;
  act(id: string, type: string, msg?: unknown): void;
  player(id: string): any;
  impostors(): string[];
  crew(): string[];
}

function setup(n: number, settings: Record<string, unknown> = {}): Harness {
  const h = {
    views: new Map<string, View>(),
    snaps: new Map<string, Snap>(),
    sent: [] as Harness['sent'],
    now: 1_000_000,
  } as Harness;
  h.game = new Game('TESTE', (id, type, payload) => {
    h.sent.push({ id, type, payload });
    if (type === 'view') h.views.set(id, payload as View);
    if (type === 'snap') h.snaps.set(id, payload as Snap);
  });
  h.ids = Array.from({ length: n }, (_, i) => `p${i}`);
  h.tick = (ms = 50) => {
    h.now += ms;
    h.game.tick(h.now);
  };
  h.act = (id, type, msg = {}) => h.game.handle(id, type, msg, h.now);
  h.player = (id) => h.game.players.get(id);
  h.impostors = () => h.ids.filter((id) => h.player(id).role === 'impostor');
  h.crew = () => h.ids.filter((id) => h.player(id).role === 'crew');
  for (const id of h.ids) expect(h.game.addPlayer(id, `Nome ${id}`)).toBeNull();
  h.act('p0', 'settings', settings);
  h.act('p0', 'start');
  h.tick();
  return h;
}

function at(h: Harness, id: string, point: { x: number; y: number }) {
  Object.assign(h.player(id), { x: point.x, y: point.y });
}

/** Faz todos os passos de uma tarefa, indo a cada estação. */
function finishTask(h: Harness, id: string, task: any) {
  const def = taskDef(task.defId)!;
  for (const step of def.steps.slice(task.step)) {
    at(h, id, STATIONS.find((s) => s.id === step.stationId)!);
    h.act(id, 'taskStep', { taskId: task.id });
  }
}

/**
 * Discussão: cada participante escolhe a opção dada por `pick` (ou nenhuma) e o anfitrião abre a votação.
 */
function speakAll(h: Harness, pick: (id: string) => number | undefined = () => undefined) {
  h.tick();
  const m = h.views.get(h.ids[0]!)!.meeting!;
  for (const id of m.participants) {
    const option = pick(id);
    if (option !== undefined) h.act(id, 'decide', { option });
  }
  h.act(h.game.hostId, 'openVoting');
  h.tick();
}

/** Abre a votação sem escolhas (não conta como decisão). */
function toVoting(h: Harness) {
  speakAll(h);
}

/** O item de conteúdo com esta pergunta (em português). */
function itemOf(h: Harness, question: string): QuestionItem {
  return THEME_CONTENT[h.game.settings.theme]!.items.find((i) => i.pt.question === question)!;
}

describe('Game', () => {
  it('recusa entradas com o jogo a decorrer e exige o mínimo de jogadores', () => {
    const g = new Game('X', () => {});
    g.addPlayer('a', 'A');
    g.addPlayer('b', 'A');
    expect(g.players.get('b')!.name).toBe('A 2');
    g.handle('a', 'start', {}, 0);
    expect(g.phase).toBe('lobby');
    const h = setup(5);
    expect(h.game.phase).toBe('playing');
    expect(h.game.addPlayer('tarde', 'Tarde')).toBe('started');
  });

  it('não revela papéis à Equipa e mostra os colegas aos Desalinhados', () => {
    const h = setup(10, { impostors: 2 });
    expect(h.impostors()).toHaveLength(2);
    const crewView = h.views.get(h.crew()[0]!)!;
    expect(crewView.you.role).toBe('crew');
    expect(crewView.players.every((p) => p.role === undefined)).toBe(true);
    expect(crewView.you.killReadyAt).toBe(0);
    const impView = h.views.get(h.impostors()[0]!)!;
    expect(impView.players.filter((p) => p.role === 'impostor')).toHaveLength(2);
    expect(impView.players.filter((p) => p.role === 'crew')).toHaveLength(0);
  });

  it('distribui tarefas comuns iguais para todos, mais longas e curtas', () => {
    const h = setup(6, { commonTasks: 1, longTasks: 2, shortTasks: 3 });
    const lists = h.ids.map((id) => h.player(id).tasks.map((t: any) => taskDef(t.defId)!));
    for (const list of lists) {
      expect(list.filter((d: any) => d.kind === 'common')).toHaveLength(1);
      expect(list.filter((d: any) => d.kind === 'long')).toHaveLength(2);
      expect(list.filter((d: any) => d.kind === 'short')).toHaveLength(3);
    }
    expect(new Set(lists.map((list) => list.find((d: any) => d.kind === 'common').id)).size).toBe(1);
  });

  it('todos discutem a mesma pergunta; só os Desalinhados veem o objetivo', () => {
    const h = setup(6);
    const imp = h.impostors()[0]!;
    const crew = h.crew();
    const round = h.views.get(imp)!.round!;
    expect(round).toBeTruthy();
    for (const id of h.ids) expect(h.views.get(id)!.round!.question).toBe(round.question);
    // 4 opções, 2 delas (diferentes) são o objetivo.
    expect(round.options).toHaveLength(4);
    expect(new Set(round.goal)).toHaveProperty('size', 2);
    for (const id of crew) expect(h.views.get(id)!.round!.goal).toBeUndefined();
    expect(h.views.get(imp)!.badDecisions).toEqual({ count: 0, limit: 3 });
  });

  it('cada jogador recebe a pergunta e as opções na sua língua', () => {
    const h = setup(5);
    const [a, b] = h.crew() as [string, string];
    h.act(b, 'lang', { lang: 'en' });
    h.act(a, 'lang', { lang: 'xx' }); // ignorado
    h.tick();
    const item = itemOf(h, h.views.get(a)!.round!.question);
    expect(h.views.get(a)!.round).toMatchObject({ question: item.pt.question, options: item.pt.options });
    expect(h.views.get(b)!.round).toMatchObject({ question: item.en.question, options: item.en.options });
  });

  it('discussão: todos os vivos escolhem e podem mudar; escolhas públicas ao vivo; a votação revela a decisão', () => {
    const h = setup(5, { emergencyCooldown: 0 });
    const imp = h.impostors()[0]!;
    const goal = h.views.get(imp)!.round!.goal![0]!;
    const other = (goal + 1) % 3;
    const question = h.views.get(imp)!.round!.question;
    const [a, b] = h.crew() as [string, string];
    at(h, a, { x: 1200, y: 760 });
    h.act(a, 'emergency');
    h.tick();
    expect(h.views.get(imp)!.meeting!.stage).toBe('speaking');

    h.act(a, 'decide', { option: 99 }); // inválida
    h.act(a, 'decide', { option: other });
    h.act(b, 'decide', { option: other });
    h.tick();
    // Todos veem as escolhas logo, mas o objetivo só é revelado na votação.
    for (const id of h.ids) expect(h.views.get(id)!.meeting!.picks).toEqual({ [a]: other, [b]: other });
    expect(h.views.get(b)!.meeting!.decision).toBeUndefined();

    // O Desalinhado convence-os: mudam de opção durante a discussão.
    h.act(a, 'decide', { option: goal });
    h.act(b, 'decide', { option: goal });
    h.tick();
    expect(h.views.get(imp)!.meeting!.picks).toEqual({ [a]: goal, [b]: goal });

    // Só o anfitrião abre a votação.
    const notHost = h.ids.find((id) => id !== h.game.hostId)!;
    h.act(notHost, 'openVoting');
    h.tick();
    expect(h.views.get(a)!.meeting!.stage).toBe('speaking');

    speakAll(h, () => goal);
    const m = h.views.get(b)!.meeting!;
    expect(m.stage).toBe('voting');
    expect(m.decision).toEqual({ chosen: goal, goal: h.views.get(imp)!.round!.goal });
    expect(Object.keys(m.picks).sort()).toEqual([...m.participants].sort());
    expect(h.views.get(b)!.badDecisions!.count).toBe(1);
    // Depois de abrir a votação já não se muda.
    h.act(a, 'decide', { option: other });
    h.tick();
    expect(h.views.get(b)!.meeting!.picks[a]).toBe(goal);

    for (const id of h.ids) h.act(id, 'vote', { target: 'skip' });
    h.tick(RESULT_MS + 50);
    expect(h.game.phase).toBe('playing');
    expect(h.player(imp).killReadyAt).toBe(h.now + h.game.settings.killCooldown * 1000 * BAD_DECISION_KILL_FACTOR);
    expect(h.views.get(b)!.round!.question).not.toBe(question);
  });

  it('uma decisão acertada atrasa as eliminações; sem escolhas (empate) não muda nada', () => {
    const h = setup(5, { emergencyCooldown: 0 });
    const imp = h.impostors()[0]!;
    const goal = h.views.get(imp)!.round!.goal!;
    const good = [0, 1, 2].find((i) => !goal.includes(i))!;
    at(h, h.ids[0]!, { x: 1200, y: 760 });
    h.act(h.ids[0]!, 'emergency');
    h.tick();
    speakAll(h, () => good);
    expect(h.views.get(imp)!.badDecisions!.count).toBe(0);
    for (const id of h.ids) h.act(id, 'vote', { target: 'skip' });
    h.tick(RESULT_MS + 50);
    expect(h.player(imp).killReadyAt).toBe(h.now + h.game.settings.killCooldown * 1000 * GOOD_DECISION_KILL_FACTOR);

    // O anfitrião pode passar a vez sem escolha: sem decisão e tempo normal.
    h.tick(20_000);
    at(h, h.ids[1]!, { x: 1200, y: 760 });
    h.act(h.ids[1]!, 'emergency');
    toVoting(h);
    expect(h.views.get(imp)!.meeting!.decision!.chosen).toBeNull();
    for (const id of h.ids) h.act(id, 'vote', { target: 'skip' });
    h.tick(RESULT_MS + 50);
    expect(h.player(imp).killReadyAt).toBe(h.now + h.game.settings.killCooldown * 1000);
  });

  it('no limite de decisões desalinhadas os Desalinhados ganham, sem votação de expulsão', () => {
    const h = setup(5, { emergencyCooldown: 0, badDecisions: 1 });
    const imp = h.impostors()[0]!;
    const goal = h.views.get(imp)!.round!.goal![0]!;
    at(h, h.ids[0]!, { x: 1200, y: 760 });
    h.act(h.ids[0]!, 'emergency');
    h.tick();
    speakAll(h, () => goal);
    const m = h.views.get(imp)!.meeting!;
    expect(m).toMatchObject({ stage: 'result', decisionLoss: true });
    h.act(h.ids[1]!, 'vote', { target: imp }); // já não há votação
    h.tick(RESULT_MS + 50);
    const v = h.views.get(imp)!;
    expect(v.phase).toBe('ended');
    expect(v).toMatchObject({ winner: 'impostor', winReason: 'decisions' });
  });

  it('evidência: uma por ronda, escondida numa tarefa; revela a opção dos Desalinhados a quem a encontra', () => {
    const h = setup(6);
    const imp = h.impostors()[0]!;
    const crew = h.crew();
    const round = h.views.get(imp)!.round!;
    const stations = h.views.get(imp)!.evidence;
    expect(stations).toHaveLength(1);
    const [stationId] = stations as [string];
    // Só os Desalinhados sabem onde está; todos sabem se ainda existe.
    for (const id of crew) {
      expect(h.views.get(id)!.evidence).toEqual([]);
      expect(h.views.get(id)!.evidenceLeft).toBe(1);
    }
    // Está numa consola onde alguém da Equipa tem um passo de tarefa.
    const owner = (except?: string) => {
      for (const id of crew) {
        if (id === except) continue;
        for (const task of h.player(id).tasks) {
          if (taskDef(task.defId)!.steps.some((s) => s.stationId === stationId)) return { id, task };
        }
      }
      return undefined;
    };
    const found = owner()!;
    expect(found).toBeDefined();

    // Quem conclui o passo nessa consola fica a saber uma opção do objetivo, e é avisado.
    h.sent.length = 0;
    finishTask(h, found.id, found.task);
    h.tick();
    const hints = h.views.get(found.id)!.round!.hints;
    expect(hints).toHaveLength(1);
    expect(round.goal).toContain(hints[0]);
    expect(h.sent.some((m) => m.id === found.id && m.type === 'event' && m.payload.code === 'clueGoal')).toBe(true);
    // A pista é privada e encontrá-la não gasta a evidência.
    for (const id of crew) if (id !== found.id) expect(h.views.get(id)!.round!.hints).toEqual([]);
    expect(h.views.get(imp)!.round!.hints).toEqual([]);
    expect(h.views.get(imp)!.evidence).toEqual([stationId]);

    // Só os Desalinhados destroem, e só ao pé da consola.
    const station = STATIONS.find((s) => s.id === stationId)!;
    at(h, crew[0]!, station);
    h.act(crew[0]!, 'evidence', { stationId });
    at(h, imp, { x: 1200, y: 760 });
    h.act(imp, 'evidence', { stationId });
    h.tick();
    expect(h.views.get(imp)!.evidence).toEqual([stationId]);
    at(h, imp, station);
    h.act(imp, 'evidence', { stationId });
    h.tick();
    expect(h.views.get(imp)!.evidence).toEqual([]);
    expect(h.views.get(crew[0]!)!.evidenceLeft).toBe(0);

    // Depois de destruída, fazer a tarefa nessa consola já não dá pista.
    const late = owner(found.id);
    if (late && !late.task.done) {
      finishTask(h, late.id, late.task);
      h.tick();
      expect(h.views.get(late.id)!.round!.hints).toEqual([]);
    }
  });

  it('os avisos do servidor são códigos traduzíveis', () => {
    const h = setup(4, { emergencyMeetings: 0 });
    const a = h.crew()[0]!;
    at(h, a, { x: 1200, y: 825 });
    h.act(a, 'emergency');
    expect(h.sent.at(-1)).toMatchObject({ id: a, type: 'event', payload: { type: 'error', code: 'noMeetings' } });
    const g = new Game('X', (id, type, payload) => h.sent.push({ id, type, payload }));
    g.addPlayer('solo', 'Solo');
    g.handle('solo', 'start', {}, 0);
    expect(h.sent.at(-1)!.payload).toMatchObject({ code: 'minPlayers', params: { n: 4 } });
  });

  it('sem tema não há temas nem evidências', () => {
    const h = setup(4, { theme: 'none' });
    const a = h.crew()[0]!;
    expect(h.views.get(a)!.round).toBeNull();
    expect(h.views.get(a)!.badDecisions).toBeNull();
    expect(h.views.get(a)!.evidence).toEqual([]);
    const task = h.player(a).tasks[0];
    finishTask(h, a, task);
    expect(task.done).toBe(true);
  });

  it('a visão filtra jogadores fora do alcance ou atrás de paredes', () => {
    const h = setup(5);
    const [a, b, c] = h.ids as [string, string, string];
    at(h, a, { x: 300, y: 250 }); // Datacenter
    at(h, b, { x: 350, y: 300 }); // Datacenter
    at(h, c, { x: 900, y: 250 }); // Sala de Treino
    h.tick();
    const seen = h.snaps.get(a)!.players.map((p) => p[0]);
    expect(seen).toContain(b);
    expect(seen).not.toContain(c);
  });

  it('eliminar, reportar, discutir, votar e expulsar o Desalinhado dá a vitória à Equipa', () => {
    const h = setup(6);
    const imp = h.impostors()[0]!;
    const [victim, reporter] = h.crew() as [string, string];
    at(h, imp, { x: 300, y: 250 });
    at(h, victim, { x: 320, y: 250 });

    h.act(imp, 'kill', { target: victim });
    expect(h.player(victim).alive).toBe(true); // cooldown inicial
    h.tick(11_000);
    h.act(imp, 'kill', { target: victim });
    expect(h.player(victim).alive).toBe(false);
    h.tick();
    // A morte ainda não é pública; o fantasma não aparece aos vivos.
    expect(h.views.get(reporter)!.players.find((p) => p.id === victim)!.dead).toBe(false);
    expect(h.snaps.get(imp)!.players.some((p) => p[0] === victim)).toBe(false);

    at(h, reporter, { x: 330, y: 260 });
    h.tick();
    expect(h.snaps.get(reporter)!.bodies.map((b) => b[0])).toEqual([victim]);
    h.act(reporter, 'report', { body: victim });
    h.tick();
    expect(h.game.phase).toBe('meeting');
    const m = h.views.get(reporter)!.meeting!;
    expect(m.stage).toBe('speaking');
    expect(m.participants).not.toContain(victim);
    expect(h.views.get(reporter)!.players.find((p) => p.id === victim)!.dead).toBe(true);

    // Chat: os vivos falam para todos, os fantasmas só entre si.
    const chats = () => h.sent.filter((s) => s.type === 'chat');
    h.act(reporter, 'chat', { text: 'foi no datacenter' });
    expect(chats().map((c) => c.id).sort()).toEqual([...h.ids].sort());
    const before = chats().length;
    h.act(victim, 'chat', { text: 'foi o vermelho' });
    const ghostChats = chats().slice(before);
    expect(ghostChats.map((c) => c.id)).toEqual([victim]);
    expect((ghostChats[0]!.payload as ChatMessage).ghost).toBe(true);

    // Não se vota enquanto há pessoas por falar.
    h.act(reporter, 'vote', { target: imp });
    h.tick();
    expect(h.views.get(reporter)!.meeting!.voted).toEqual([]);
    toVoting(h);
    expect(h.views.get(reporter)!.meeting!.stage).toBe('voting');

    h.act(victim, 'vote', { target: reporter }); // os mortos não votam
    for (const id of h.ids) if (id !== victim) h.act(id, 'vote', { target: imp });
    h.tick();
    const result = h.views.get(reporter)!.meeting!;
    expect(result.stage).toBe('result');
    expect(result.ejectedId).toBe(imp);
    expect(result.ejectedWasImpostor).toBe(true);
    expect(result.impostorsLeft).toBe(0);
    expect(result.ballots![imp]).toHaveLength(5); // 6 jogadores menos a vítima
    expect(result.ballots![imp]).not.toContain(victim);

    h.tick(7_000);
    h.tick();
    const end = h.views.get(reporter)!;
    expect(end.phase).toBe('ended');
    expect(end.winner).toBe('crew');
    expect(end.winReason).toBe('ejected');
    expect(end.players.find((p) => p.id === imp)!.role).toBe('impostor');
  });

  it('reunião: participam os vivos (quem convocou primeiro), sem tempo limite até o anfitrião abrir a votação', () => {
    const h = setup(6, { theme: 'none', emergencyCooldown: 0 });
    const host = h.game.hostId;
    const caller = h.ids.find((id) => id !== host)!;
    at(h, caller, { x: 1200, y: 825 });
    h.act(caller, 'emergency');
    h.tick();
    let m = h.views.get(host)!.meeting!;
    expect(m.stage).toBe('speaking');
    expect(m.endsAt).toBe(0);
    expect(m.participants[0]).toBe(caller);
    expect([...m.participants].sort()).toEqual([...h.ids].sort());

    // Sem tempo limite, e só o anfitrião abre a votação.
    h.tick(10 * 60_000);
    h.act(caller, 'openVoting');
    h.tick();
    expect(h.views.get(host)!.meeting!.stage).toBe('speaking');
    h.act(host, 'openVoting');
    h.tick();
    m = h.views.get(host)!.meeting!;
    expect(m.stage).toBe('voting');
    expect(m.endsAt).toBeGreaterThan(h.now);
  });

  it('votos anónimos e expulsões por confirmar escondem a informação', () => {
    const h = setup(6, { anonymousVotes: true, confirmEjects: false, theme: 'none' });
    const [a, b] = h.crew() as [string, string];
    h.tick(16_000);
    at(h, a, { x: 1200, y: 825 });
    h.act(a, 'emergency');
    h.tick();
    toVoting(h);
    for (const id of h.ids) h.act(id, 'vote', { target: b });
    h.tick();
    const m = h.views.get(a)!.meeting!;
    expect(m.ejectedId).toBe(b);
    expect(m.ejectedWasImpostor).toBeUndefined();
    expect(m.impostorsLeft).toBeUndefined();
    expect(m.ballots![b]).toEqual(['', '', '', '', '', '']);
  });

  it('o botão de emergência respeita o cooldown e o limite por jogador', () => {
    const h = setup(5, { theme: 'none', emergencyMeetings: 1, emergencyCooldown: 20 });
    const a = h.crew()[0]!;
    at(h, a, { x: 1200, y: 825 });
    h.act(a, 'emergency');
    expect(h.game.phase).toBe('playing');
    h.tick(21_000);
    h.act(a, 'emergency');
    expect(h.game.phase).toBe('meeting');
    toVoting(h);
    for (const id of h.ids) h.act(id, 'vote', { target: 'skip' });
    h.tick();
    h.tick(7_000);
    h.tick(21_000);
    at(h, a, { x: 1200, y: 825 });
    h.act(a, 'emergency');
    expect(h.game.phase).toBe('playing');
    expect(h.views.get(a)!.you.emergencyLeft).toBe(0);
  });

  it('os Desalinhados ganham quando igualam a Equipa', () => {
    const h = setup(4, { theme: 'none', killCooldown: 10 });
    const imp = h.impostors()[0]!;
    h.tick(11_000);
    for (const victim of h.crew().slice(0, 2)) {
      at(h, victim, h.player(imp));
      h.act(imp, 'kill', { target: victim });
      h.tick(11_000);
    }
    expect(h.views.get(imp)!.winner).toBe('impostor');
    expect(h.views.get(imp)!.winReason).toBe('outnumbered');
  });

  it('tarefas: passos por ordem, só ao pé da estação, e só as da Equipa contam', () => {
    const h = setup(4, { theme: 'none', commonTasks: 1, longTasks: 1, shortTasks: 1 });
    const imp = h.impostors()[0]!;
    const crew = h.crew();

    finishTask(h, imp, h.player(imp).tasks[0]);
    expect(h.player(imp).tasks[0].step).toBe(0);

    const long = h.player(crew[0]!).tasks.find((t: any) => taskDef(t.defId)!.kind === 'long');
    const steps = taskDef(long.defId)!.steps;
    // Na estação do segundo passo, o primeiro não avança.
    at(h, crew[0]!, STATIONS.find((s) => s.id === steps[1]!.stationId)!);
    h.act(crew[0]!, 'taskStep', { taskId: long.id });
    expect(long.step).toBe(0);
    at(h, crew[0]!, STATIONS.find((s) => s.id === steps[0]!.stationId)!);
    h.act(crew[0]!, 'taskStep', { taskId: long.id });
    expect(long).toMatchObject({ step: 1, done: false });
    h.tick();
    expect(h.views.get(imp)!.taskProgress).toBe(0);

    for (const id of crew) for (const t of h.player(id).tasks) finishTask(h, id, t);
    h.tick();
    const end = h.views.get(crew[0]!)!;
    expect(end.winner).toBe('crew');
    expect(end.winReason).toBe('tasks');
  });

  it('a barra de tarefas pode atualizar só nas reuniões ou ficar escondida', () => {
    const h = setup(5, { theme: 'none', taskBar: 'meetings', emergencyCooldown: 0 });
    const a = h.crew()[0]!;
    finishTask(h, a, h.player(a).tasks[0]);
    h.tick();
    expect(h.views.get(a)!.taskProgress).toBe(0);
    at(h, a, { x: 1200, y: 825 });
    h.act(a, 'emergency');
    h.tick();
    expect(h.views.get(a)!.taskProgress).toBeGreaterThan(0);
    expect(setup(4, { taskBar: 'never' }).views.get('p0')!.taskProgress).toBeNull();
  });

  it('condutas: entrar esconde o Desalinhado, que se move entre condutas ligadas e sai', () => {
    const h = setup(5, { theme: 'none' });
    const imp = h.impostors()[0]!;
    const crew = h.crew()[0]!;
    const vent = VENTS[0]!;
    at(h, imp, vent);
    at(h, crew, { x: vent.x - 60, y: vent.y + 40 });
    h.act(crew, 'vent', { action: 'enter' });
    expect(h.player(crew).inVent).toBeUndefined();
    h.tick();
    expect(h.snaps.get(crew)!.players.map((p) => p[0])).toContain(imp);

    h.act(imp, 'vent', { action: 'enter' });
    h.act(imp, 'input', { dx: 1, dy: 0 });
    h.tick();
    expect(h.views.get(imp)!.you.inVent).toBe(vent.id);
    expect(h.snaps.get(crew)!.players.map((p) => p[0])).not.toContain(imp);
    expect(h.player(imp).x).toBe(vent.x);

    h.act(imp, 'vent', { action: 'move', to: 'v-etica' }); // não está ligada
    expect(h.player(imp).inVent).toBe(vent.id);
    h.act(imp, 'vent', { action: 'move', to: vent.links[0] });
    const target = VENTS.find((v) => v.id === vent.links[0])!;
    expect(h.player(imp)).toMatchObject({ inVent: target.id, x: target.x, y: target.y });
    h.act(imp, 'vent', { action: 'exit' });
    expect(h.player(imp).inVent).toBeUndefined();
  });

  it('sabotagens: injection esconde tarefas; crítica por resolver dá a vitória aos Desalinhados', () => {
    const h = setup(5, { theme: 'none' });
    const imp = h.impostors()[0]!;
    const crew = h.crew()[0]!;
    h.act(crew, 'sabotage', { kind: 'injection' });
    h.tick(16_000);
    expect(h.views.get(crew)!.sabotage).toBeNull();

    h.act(imp, 'sabotage', { kind: 'injection' });
    h.tick();
    expect(h.views.get(crew)!.you.tasks).toHaveLength(0);
    expect(h.views.get(imp)!.you.tasks.length).toBeGreaterThan(0);
    const panel = PANELS.find((p) => p.kind === 'injection')!;
    at(h, crew, panel);
    h.act(crew, 'fix', { panelId: panel.id });
    h.tick();
    expect(h.views.get(crew)!.sabotage).toBeNull();
    expect(h.views.get(crew)!.you.tasks.length).toBeGreaterThan(0);

    h.tick(31_000);
    h.act(imp, 'sabotage', { kind: 'guardrails' });
    h.tick();
    // Um só painel não chega, e durante a crise não há botão de emergência.
    const [g1] = PANELS.filter((p) => p.kind === 'guardrails');
    at(h, crew, g1!);
    h.act(crew, 'fix', { panelId: g1!.id });
    h.tick();
    expect(h.views.get(crew)!.sabotage!.activePanels).toEqual([g1!.id]);
    at(h, crew, { x: 1200, y: 825 });
    h.act(crew, 'emergency');
    expect(h.game.phase).toBe('playing');
    h.tick(CRITICAL_MS);
    h.tick();
    expect(h.views.get(crew)!.winner).toBe('impostor');
    expect(h.views.get(crew)!.winReason).toBe('sabotage');
  });

  it('guardrails exigem os dois painéis ao mesmo tempo; arrefecimento aceita um de cada vez; portas trancam', () => {
    const h = setup(6, { theme: 'none' });
    const imp = h.impostors()[0]!;
    const [a, b] = h.crew() as [string, string];
    h.tick(16_000);
    h.act(imp, 'sabotage', { kind: 'guardrails' });
    const [g1, g2] = PANELS.filter((p) => p.kind === 'guardrails');
    at(h, a, g1!);
    at(h, b, g2!);
    h.act(a, 'fix', { panelId: g1!.id });
    h.tick(3_000); // o primeiro já largou
    h.act(b, 'fix', { panelId: g2!.id });
    h.tick();
    expect(h.views.get(a)!.sabotage).not.toBeNull();
    h.act(a, 'fix', { panelId: g1!.id });
    h.tick();
    expect(h.views.get(a)!.sabotage).toBeNull();

    h.tick(31_000);
    h.act(imp, 'sabotage', { kind: 'cooling' });
    const [c1, c2] = PANELS.filter((p) => p.kind === 'cooling');
    at(h, a, c1!);
    h.act(a, 'fix', { panelId: c1!.id });
    h.tick(10_000);
    expect(h.views.get(a)!.sabotage!.activePanels).toEqual([c1!.id]);
    at(h, a, c2!);
    h.act(a, 'fix', { panelId: c2!.id });
    h.tick();
    expect(h.views.get(a)!.sabotage).toBeNull();

    h.act(imp, 'sabotage', { kind: 'doors', roomId: 'datacenter' });
    h.tick();
    expect(h.views.get(a)!.lockedRooms).toEqual(['datacenter']);
    h.tick(11_000);
    h.tick();
    expect(h.views.get(a)!.lockedRooms).toEqual([]);
  });

  it('a saída de um jogador a meio conta como morte e pode acabar o jogo', () => {
    const h = setup(4);
    const imp = h.impostors()[0]!;
    h.game.removePlayer(imp, h.now);
    h.tick();
    const v = h.views.get(h.crew()[0]!)!;
    expect(v.winner).toBe('crew');
    expect(v.players.some((p) => p.id === imp)).toBe(false);
  });

  it('move: aceita posições do cliente dentro da velocidade e recusa saltos ou atravessar objetos', () => {
    const h = setup(4, { theme: 'none' });
    const id = h.crew()[0]!;
    at(h, id, { x: 300, y: 300 });
    h.tick(1000);
    const w = h.snaps.get(id)!.w;
    h.act(id, 'move', { x: 320, y: 300, w });
    expect(h.player(id)).toMatchObject({ x: 320, y: 300 });

    // Demasiado longe para o tempo que passou: fica onde estava e recebe um teletransporte.
    h.tick();
    h.act(id, 'move', { x: 900, y: 300, w });
    expect(h.player(id)).toMatchObject({ x: 320, y: 300 });
    h.tick();
    expect(h.snaps.get(id)!.w).toBe(w + 1);
    // Posições calculadas antes do teletransporte são ignoradas.
    h.act(id, 'move', { x: 325, y: 300, w });
    expect(h.player(id).x).toBe(320);

    // Não se atravessa uma consola.
    const s = STATIONS.find((x) => x.id === 'datacenter-a')!;
    at(h, id, { x: s.x - 60, y: s.y + 10 });
    h.tick(1000);
    h.act(id, 'move', { x: s.x + 60, y: s.y + 10, w: h.snaps.get(id)!.w });
    expect(h.player(id).x).toBe(s.x - 60);
  });


  it('o anfitrião pode terminar o jogo a qualquer momento e levar todos ao lobby', () => {
    const h = setup(4, { theme: 'none', emergencyCooldown: 0 });
    const other = h.ids.find((id) => id !== h.game.hostId)!;
    h.act(other, 'toLobby');
    expect(h.game.phase).toBe('playing');
    at(h, h.game.hostId, { x: 1200, y: 760 });
    h.act(h.game.hostId, 'emergency');
    expect(h.game.phase).toBe('meeting');
    h.act(h.game.hostId, 'toLobby');
    h.tick();
    expect(h.game.phase).toBe('lobby');
    expect(h.views.get(other)!.phase).toBe('lobby');
    expect(h.views.get(other)!.you.role).toBeUndefined();
  });
  it('durante a votação todos veem a contagem e quem votou em quem, ao vivo', () => {
    const h = setup(4, { theme: 'none', emergencyCooldown: 0 });
    at(h, h.ids[0]!, { x: 1200, y: 760 });
    h.act(h.ids[0]!, 'emergency');
    toVoting(h);
    h.act(h.ids[1]!, 'vote', { target: h.ids[2]! });
    h.tick();
    const m = h.views.get(h.ids[3]!)!.meeting!;
    expect(m.stage).toBe('voting');
    expect(m.ballots).toEqual({ [h.ids[2]!]: [h.ids[1]!] });
  });
});
