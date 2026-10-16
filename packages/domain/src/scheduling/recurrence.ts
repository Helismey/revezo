export type RecurrenceMode = 'WEEKLY_DAYS' | 'DAILY_RANGE';

export interface RecurrenceOptions {
  mode: RecurrenceMode;
  startDate: string; // AAAA-MM-DD
  endDate: string;   // AAAA-MM-DD
  weekdays?: number[]; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  maxOccurrences?: number;
}

/**
 * Gera datas de ocorrência para programas recorrentes.
 * Função pura, imutável e protegida contra loops infinitos (teto padrão de 100 datas).
 */
export function generateRecurrenceDates(options: RecurrenceOptions): Date[] {
  const { mode, startDate, endDate, weekdays = [], maxOccurrences = 100 } = options;

  if (!startDate || !endDate) return [];

  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);

  if (startParts.length !== 3 || endParts.length !== 3) return [];

  // Usamos meio-dia UTC para prevenir desvios de fuso horário / horário de verão
  const current = new Date(Date.UTC(startParts[0]!, startParts[1]! - 1, startParts[2]!, 12, 0, 0));
  const end = new Date(Date.UTC(endParts[0]!, endParts[1]! - 1, endParts[2]!, 12, 0, 0));

  if (current > end) return [];

  const dates: Date[] = [];
  const targetWeekdays = new Set(weekdays);

  while (current <= end && dates.length < maxOccurrences) {
    const dayOfWeek = current.getUTCDay();

    if (mode === 'DAILY_RANGE') {
      dates.push(new Date(current));
    } else if (mode === 'WEEKLY_DAYS') {
      if (targetWeekdays.has(dayOfWeek)) {
        dates.push(new Date(current));
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export function formatISODateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converte uma data civil (AAAA-MM-DD) e um horário local em America/Sao_Paulo (HH:mm)
 * para um objeto Date em UTC (considerando o offset fixo -03:00 do fuso de Brasília).
 */
export function parseSaoPauloDateTimeToUtc(dateStr: string, timeStr = '09:00'): Date {
  const [rawH = '09', rawM = '00'] = timeStr.split(':');
  const hh = String(Number(rawH) || 0).padStart(2, '0');
  const mm = String(Number(rawM) || 0).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00.000-03:00`);
}

