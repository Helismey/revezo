import { UserAssignmentTime } from './conflict.js';
import { DEFAULT_TIMEZONE, getLocalDateString } from './daily-limit.js';

export interface OverloadAlert {
  isOverloaded: boolean;
  score: number; // 0 a 100
  reasons: string[];
  consecutiveWeekends: number;
  assignmentsIn30Days: number;
}

export interface OverloadBadge {
  text: string;
  variant: 'danger' | 'warning' | 'ok';
}

/**
 * Retorna a chave do fim de semana (Data do Sábado em formato YYYY-MM-DD) para uma data dada.
 * Se for Sábado, retorna o próprio dia. Se for Domingo, retorna o dia anterior (Sábado).
 * Se for dia útil (seg-sex), retorna nulo.
 */
export function getWeekendKey(date: Date | string, timeZone = DEFAULT_TIMEZONE): string | null {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value; // 'Sat', 'Sun', 'Mon', etc.

  if (weekday !== 'Sat' && weekday !== 'Sun') {
    return null;
  }

  if (weekday === 'Sat') {
    return getLocalDateString(d, timeZone);
  }

  // Se for domingo, subtrai 24h para obter o sábado correspondente
  const satDate = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return getLocalDateString(satDate, timeZone);
}

/**
 * Encontra o sábado mais recente no fuso horário local que seja menor ou igual à data de referência.
 */
function getMostRecentSaturday(referenceDate: Date, timeZone = DEFAULT_TIMEZONE): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  // Iterar regressivamente até 7 dias para encontrar o sábado
  let current = new Date(referenceDate);
  for (let i = 0; i < 7; i++) {
    const parts = formatter.formatToParts(current);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    if (weekday === 'Sat') {
      return current;
    }
    current = new Date(current.getTime() - 24 * 60 * 60 * 1000);
  }
  return current;
}

/**
 * Calcula o número de fins de semana consecutivos em que o voluntário serviu.
 */
export function calculateConsecutiveWeekends(
  assignments: UserAssignmentTime[],
  referenceDate: Date | string = new Date(),
  timeZone = DEFAULT_TIMEZONE
): number {
  const ref = new Date(referenceDate);
  const activeAssignments = assignments.filter(
    (a) => a.status !== 'DECLINED' && a.status !== 'SUBSTITUTED'
  );

  // Mapear os fins de semana em que houve serviço
  const weekendSet = new Set<string>();
  for (const a of activeAssignments) {
    const key = getWeekendKey(a.startsAt, timeZone);
    if (key) {
      weekendSet.add(key);
    }
  }

  // Começar do sábado mais recente relativo à data de referência
  let currentSat = getMostRecentSaturday(ref, timeZone);
  let consecutive = 0;

  // Verificar até 12 fins de semana consecutivos
  for (let w = 0; w < 12; w++) {
    const satKey = getLocalDateString(currentSat, timeZone);
    if (weekendSet.has(satKey)) {
      consecutive++;
      // Próximo sábado anterior (7 dias atrás)
      currentSat = new Date(currentSat.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  return consecutive;
}

/**
 * Avalia o nível de sobrecarga de um voluntário.
 */
export function detectVolunteerOverload(
  assignments: UserAssignmentTime[],
  referenceDate: Date | string = new Date(),
  timeZone = DEFAULT_TIMEZONE
): OverloadAlert {
  const ref = new Date(referenceDate);
  const refTime = ref.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const activeAssignments = assignments.filter(
    (a) => a.status !== 'DECLINED' && a.status !== 'SUBSTITUTED'
  );

  // Escalas nos últimos 30 dias em relação à data de referência
  const assignmentsIn30Days = activeAssignments.filter((a) => {
    const t = new Date(a.startsAt).getTime();
    return t <= refTime && t >= refTime - thirtyDaysMs;
  }).length;

  const consecutiveWeekends = calculateConsecutiveWeekends(activeAssignments, ref, timeZone);

  const reasons: string[] = [];
  let score = 0;

  if (consecutiveWeekends >= 3) {
    reasons.push(`${consecutiveWeekends} fins de semana consecutivos escalado(a)`);
    score += Math.min(50, consecutiveWeekends * 15);
  }

  if (assignmentsIn30Days > 4) {
    reasons.push(`${assignmentsIn30Days} escalas nos últimos 30 dias`);
    score += Math.min(50, (assignmentsIn30Days - 4) * 15);
  }

  const isOverloaded = consecutiveWeekends >= 3 || assignmentsIn30Days > 4;

  return {
    isOverloaded,
    score,
    reasons,
    consecutiveWeekends,
    assignmentsIn30Days,
  };
}

/**
 * Retorna o selo visual de sobrecarga formatado para uso na interface.
 */
export function getOverloadBadge(alert: OverloadAlert): OverloadBadge | null {
  if (!alert.isOverloaded) {
    return null;
  }

  if (alert.consecutiveWeekends >= 4 || alert.assignmentsIn30Days >= 6) {
    return {
      text: `${alert.consecutiveWeekends} fds seguidos • Sobrecarga alta`,
      variant: 'danger',
    };
  }

  return {
    text: alert.reasons[0] || 'Atenção para descanso',
    variant: 'warning',
  };
}
