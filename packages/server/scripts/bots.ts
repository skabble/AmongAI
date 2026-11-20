// Teste de carga e de fugas de informação: liga N clientes simulados a um servidor em execução.
// Uso: npm run bots            (servidor em http://localhost:2567)
//      BOTS=15 SECONDS=20 SERVER=http://localhost:2567 npm run bots
import { Client, type Room } from '@colyseus/sdk';
import { MIN_PLAYERS, TICK_RATE, visionRadius, type Snap, type View } from '@desalinhados/shared';

const SERVER = process.env.SERVER ?? 'http://localhost:2567';
const COUNT = Math.max(MIN_PLAYERS, Number(process.env.BOTS) || 15);
const SECONDS = Number(process.env.SECONDS) || 20;

interface Bot {
  name: string;
  room: Room;
  view?: View;
  snaps: number;
  lastSnapAt: number;
  maxGap: number;
}

const problems: string[] = [];
const problem = (text: string) => {
  if (!problems.includes(text)) problems.push(text);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function watch(bot: Bot): void {
  bot.room.onMessage('view', (view: View) => {
    bot.view = view;
    // Fora da fase de jogo não há snapshots; a pausa não conta como atraso.
    if (view.phase !== 'playing') bot.lastSnapAt = 0;
    const role = view.you.role;
    if (view.phase === 'playing' || view.phase === 'meeting') {
      const leaked = view.players.filter((p) => p.role !== undefined);
      if (role === 'crew' && leaked.length > 0) problem(`${bot.name} (Equipa) recebeu papéis de outros jogadores`);
      if (role === 'crew' && (view.you.killReadyAt !== 0 || view.you.sabotageReadyAt !== 0)) {
        problem(`${bot.name} (Equipa) recebeu cooldowns dos Desalinhados`);
      }
      if (role === 'impostor' && leaked.some((p) => p.role !== 'impostor')) {
        problem(`${bot.name} (Desalinhado) recebeu papéis da Equipa`);
      }
      const stage = view.meeting?.stage;
      if (view.meeting?.ballots && stage === 'speaking') problem('votos revelados antes da votação');
      if (view.meeting?.decision && stage === 'speaking') problem('decisão revelada antes de todos falarem');
      if (role === 'crew' && view.round?.goal) problem(`${bot.name} (Equipa) recebeu o objetivo dos Desalinhados`);
      if (role === 'impostor' && view.round && view.round.hints.length > 0) problem(`${bot.name} (Desalinhado) recebeu pistas da Equipa`);
    }
  });
  bot.room.onMessage('snap', (snap: Snap) => {
    const now = performance.now();
    if (bot.lastSnapAt) bot.maxGap = Math.max(bot.maxGap, now - bot.lastSnapAt);
    bot.lastSnapAt = now;
    bot.snaps++;
    const view = bot.view;
    if (view?.you.alive) {
      const radius = visionRadius(view.settings, view.you.role === 'impostor', false);
      for (const [id, x, y, ghost] of snap.players) {
        if (ghost) problem(`${bot.name} (vivo) recebeu a posição de um fantasma`);
        if (Math.hypot(x - snap.x, y - snap.y) > radius + 2) problem(`${bot.name} recebeu a posição de ${id} fora do raio de visão`);
      }
    }
  });
  bot.room.onMessage('*', () => {});
}

async function waitFor(label: string, check: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Tempo esgotado à espera de: ${label}`);
    await sleep(50);
  }
}

async function main(): Promise<void> {
  const bots: Bot[] = [];
  const make = (name: string, room: Room): Bot => {
    const bot: Bot = { name, room, snaps: 0, lastSnapAt: 0, maxGap: 0 };
    watch(bot);
    bots.push(bot);
    return bot;
  };

  const host = make('Bot 1', await new Client(SERVER).create('game', { name: 'Bot 1' }));
  const code = host.room.roomId;
  console.log(`Sala ${code} criada; a ligar ${COUNT} bots a ${SERVER}`);
  for (let i = 2; i <= COUNT; i++) make(`Bot ${i}`, await new Client(SERVER).joinById(code, { name: `Bot ${i}` }));
  await waitFor('todos no lobby', () => host.view?.players.length === COUNT);

  // Entrar numa sala inexistente ou com o jogo a decorrer tem de falhar.
  let rejected = false;
  await new Client(SERVER).joinById('ZZZZZ', { name: 'Intruso' }).catch(() => (rejected = true));
  if (!rejected) problem('entrada numa sala inexistente não foi recusada');

  host.room.send('settings', { impostors: 3, emergencyCooldown: 0, votingSec: 15 });
  host.room.send('start', {});
  await waitFor('início do jogo', () => bots.every((b) => b.view?.phase === 'playing'));
  const impostors = bots.filter((b) => b.view!.you.role === 'impostor');
  const crew = bots.filter((b) => b.view!.you.role === 'crew');
  console.log(`Jogo iniciado: ${impostors.length} Desalinhados, ${crew.length} na Equipa`);

  // Pergunta da ronda: igual para todos; só os Desalinhados têm o objetivo, e é o mesmo para todos eles.
  const questions = new Set(bots.map((b) => b.view!.round?.question));
  if (questions.size !== 1 || !host.view!.round) problem('os jogadores não receberam todos a mesma pergunta');
  const goals = new Set(impostors.map((b) => JSON.stringify(b.view!.round?.goal)));
  if (goals.size !== 1 || !impostors[0]!.view!.round?.goal?.length) problem('os Desalinhados não receberam o mesmo objetivo');
  const question = host.view!.round?.question;
  console.log(`Pergunta: ${question}`);
  console.log(`Opções: ${host.view!.round?.options.join(' | ')}`);
  console.log(`Objetivo dos Desalinhados: ${impostors[0]!.view!.round?.goal?.map((i) => host.view!.round!.options[i]).join(', ')}`);
  // Evidências escondidas nas consolas: só os Desalinhados sabem onde; todos sabem quantas.
  const hidden = impostors[0]!.view!.evidence;
  console.log(`Evidências escondidas nas tarefas: ${host.view!.evidenceLeft}`);
  if (crew.some((b) => b.view!.evidence.length > 0)) problem('a Equipa recebeu a localização das evidências');
  if (hidden.length !== host.view!.evidenceLeft) problem('os Desalinhados não veem todas as evidências');
  // Ninguém está ao pé de uma consola no início, por isso estes pedidos têm de ser ignorados.
  if (hidden.length > 0) {
    for (const bot of impostors) bot.room.send('evidence', { stationId: hidden[0] });
    await sleep(300);
    if (host.view!.evidenceLeft !== hidden.length) problem('evidência destruída sem estar junto da consola');
  }

  rejected = false;
  await new Client(SERVER).joinById(code, { name: 'Tarde' }).catch(() => (rejected = true));
  if (!rejected) problem('entrada com o jogo a decorrer não foi recusada');

  // Todos andam ao acaso.
  const wander = setInterval(() => {
    for (const bot of bots) {
      if (bot.view?.phase !== 'playing') continue;
      bot.room.send('input', { dx: Math.random() * 2 - 1, dy: Math.random() * 2 - 1 });
    }
  }, 400);

  await sleep((SECONDS * 1000) / 2);

  // Reunião de emergência: tenta-se com todos até um estar ao alcance do botão.
  for (let attempt = 0; attempt < 40 && host.view?.phase === 'playing'; attempt++) {
    for (const bot of bots) bot.room.send('emergency', {});
    await sleep(250);
  }
  if (host.view?.phase === 'meeting') {
    const m = host.view.meeting!;
    console.log(`Reunião iniciada (${m.stage}) com ${m.participants.length} participantes`);
    if (m.decision) problem('decisão revelada no início da reunião');
    if (m.stage !== 'speaking' || m.participants.length !== COUNT) problem('a reunião não começou pela discussão');
    // Todos escolhem uma opção ao acaso; metade muda de ideias a meio da discussão; o anfitrião abre a votação.
    const options = host.view!.round?.options.length ?? 0;
    const random = () => Math.floor(Math.random() * options);
    for (const bot of bots) bot.room.send('decide', { option: random() });
    await waitFor('escolhas de todos', () => Object.keys(host.view?.meeting?.picks ?? {}).length === COUNT);
    for (const bot of bots.slice(0, COUNT / 2)) bot.room.send('decide', { option: random() });
    await sleep(200);
    host.room.send('openVoting', {});
    await waitFor('votação', () => host.view?.meeting?.stage !== 'speaking');
    const decision = host.view!.meeting?.decision;
    if (!decision || Object.keys(host.view!.meeting!.picks).length !== COUNT) problem('a decisão não mostra as escolhas de todos');
    console.log(`Decisão: ${decision?.chosen === null ? 'empate' : host.view!.round?.options[decision!.chosen]}; desalinhadas: ${host.view!.badDecisions?.count}`);
    if (host.view?.meeting?.stage !== 'voting') {
      console.log('Limite de decisões desalinhadas atingido');
      await waitFor('fim do jogo', () => host.view?.phase === 'ended', 12_000);
    }
    if (host.view?.phase === 'meeting') {
      for (const bot of bots) bot.room.send('vote', { target: 'skip' });
      await waitFor('resultado', () => host.view?.meeting?.stage === 'result' || host.view?.phase !== 'meeting');
      await waitFor('regresso ao jogo', () => host.view?.phase === 'playing', 12_000);
      if (host.view.round?.question === question) problem('a pergunta não mudou na ronda seguinte');
      console.log('Reunião concluída sem expulsões; nova ronda com nova pergunta');
    }
  } else if (host.view?.phase === 'playing') {
    problem('nenhum bot conseguiu convocar a reunião de emergência');
  }

  await sleep((SECONDS * 1000) / 2);
  clearInterval(wander);

  const expected = 1000 / TICK_RATE;
  const worstGap = Math.max(...bots.map((b) => b.maxGap));
  const minSnaps = Math.min(...bots.map((b) => b.snaps));
  console.log(`Snapshots por bot: mínimo ${minSnaps}; maior intervalo ${worstGap.toFixed(0)} ms (esperado ~${expected} ms)`);
  if (worstGap > expected * 6) problem(`intervalo entre snapshots demasiado alto: ${worstGap.toFixed(0)} ms`);

  await Promise.all(bots.map((b) => b.room.leave(true).catch(() => {})));
  if (problems.length > 0) {
    console.error(`\n${problems.length} problema(s):`);
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }
  console.log('\nSem problemas detetados.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
