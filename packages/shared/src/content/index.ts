// Dilemas de cada tema, em português e inglês. Importado apenas pelo servidor.
import { z } from 'zod';

export const OPTION_COUNT = 4;
export const GOAL_COUNT = 2;
import iaSociedade from './temas/ia-sociedade.json';

const localized = z.object({
  question: z.string().min(10),
  options: z.array(z.string().min(1).max(60)).length(OPTION_COUNT),
});

/** Cada dilema tem 4 opções, todas defensáveis; em cada ronda 2 delas são sorteadas como objetivo dos Impostores. */
const item = z.object({ pt: localized, en: localized });

export const themeSchema = z.object({
  id: z.string().min(1),
  items: z.array(item).min(6),
});

export type ThemeContent = z.infer<typeof themeSchema>;
export type QuestionItem = ThemeContent['items'][number];

const all = [iaSociedade].map((raw) => themeSchema.parse(raw));

export const THEME_CONTENT: Record<string, ThemeContent> = Object.fromEntries(all.map((t) => [t.id, t]));
