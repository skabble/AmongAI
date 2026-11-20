import { useStore } from './store';
import { EndScreen } from './ui/EndScreen';
import { GameCanvas } from './ui/GameCanvas';
import { Home } from './ui/Home';
import { Hud } from './ui/Hud';
import { Lobby } from './ui/Lobby';
import { Meeting } from './ui/Meeting';
import { RoleReveal } from './ui/RoleReveal';
import { SidePanel } from './ui/SidePanel';
import { TaskModal } from './ui/TaskModal';
import { LangToggle } from './ui/LangToggle';
import { Toasts } from './ui/Toasts';

export function App() {
  const screen = useStore((s) => s.screen);
  const phase = useStore((s) => s.view?.phase);

  if (screen !== 'game' || !phase) {
    return (
      <>
        <Home connecting={screen === 'connecting'} />
        <Toasts />
        <LangToggle />
      </>
    );
  }

  return (
    <>
      {phase === 'lobby' && <Lobby />}
      {(phase === 'playing' || phase === 'meeting') && (
        <div className="stage">
          <GameCanvas />
          {phase === 'playing' && <Hud />}
          {phase === 'playing' && <TaskModal />}
          <RoleReveal />
          <SidePanel />
          {phase === 'meeting' && <Meeting />}
        </div>
      )}
      {phase === 'ended' && <EndScreen />}
      <Toasts />
      <LangToggle />
    </>
  );
}
