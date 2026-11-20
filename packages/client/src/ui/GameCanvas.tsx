import { useEffect, useRef } from 'react';
import { createGame } from '../game/GameScene';

export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const game = createGame(ref.current!);
    return () => game.destroy(true);
  }, []);
  return <div ref={ref} className="canvas" />;
}
