import { UserAssignmentTime } from './conflict.js';

export const MAX_DAILY_ASSIGNMENTS = 2;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const formattersCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formattersCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formattersCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Retorna a data no formato YYYY-MM-DD considerando o fuso horário da igreja.
 */
export function getLocalDateString(date: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Data inválida para cálculo de limite diário');
  }

  return getDateTimeFormatter(timeZone).format(d);
}

/**
 * Conta quantas escalas ativas o usuário já possui no mesmo dia civil.
 */
export function countDailyAssignments(
  targetDate: Date | string,
  existingAssignments: UserAssignmentTime[],
  ignoreAssignmentId?: string,
  timeZone = DEFAULT_TIMEZONE
): number {
  const targetDay = getLocalDateString(targetDate, timeZone);

  let count = 0;
  for (const a of existingAssignments) {
    if (ignoreAssignmentId && a.id === ignoreAssignmentId) {
      continue;
    }

    if (a.status === 'DECLINED' || a.status === 'SUBSTITUTED') {
      continue;
    }

    const assignmentDay = getLocalDateString(a.startsAt, timeZone);
    if (assignmentDay === targetDay) {
      count++;
    }
  }

  return count;
}

/**
 * Verifica se atribuir esta nova escala violaria o limite diário de 2 escalas por pessoa.
 */
export function wouldExceedDailyLimit(
  targetDate: Date | string,
  existingAssignments: UserAssignmentTime[],
  ignoreAssignmentId?: string,
  timeZone = DEFAULT_TIMEZONE
): boolean {
  const currentCount = countDailyAssignments(targetDate, existingAssignments, ignoreAssignmentId, timeZone);
  return currentCount >= MAX_DAILY_ASSIGNMENTS;
}
