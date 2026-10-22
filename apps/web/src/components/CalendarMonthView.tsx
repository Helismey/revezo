'use client';

import React, { useState, useMemo } from 'react';
import { CaretLeft, CaretRight, Clock, Buildings, Plus, X } from '@/components/Icons';
import { getLocalDateString } from '@revezo/domain';

export interface CalendarEventItem {
  id: string;
  title: string;
  date: string | Date; // ISO string ou objeto Date
  time?: string;
  departmentName?: string;
  departmentId?: string;
  status?: 'CONFIRMED' | 'PENDING' | 'PENDING_APPROVAL' | 'DECLINED' | 'SUBSTITUTED' | string;
  subtitle?: string;
  badgeVariant?: 'primary' | 'success' | 'warning' | 'info' | 'neutral';
  meta?: any;
}

export interface CalendarMonthViewProps {
  events: CalendarEventItem[];
  departments?: { id: string; name: string }[];
  selectedDepartmentId?: string;
  onSelectDepartmentId?: (deptId: string) => void;
  onEventClick?: (event: CalendarEventItem) => void;
  onAddEventClick?: (dateStr: string) => void;
  canAddEvent?: boolean;
  emptyStateMessage?: string;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ⚡ Bolt Optimization: Added React.memo to prevent unnecessary re-renders of the complex calendar grid.
// This is especially beneficial when parent components (like MinhaEscalaClient) re-render for unrelated state changes.
export const CalendarMonthView = React.memo(function CalendarMonthView({
  events,
  departments,
  selectedDepartmentId = '',
  onSelectDepartmentId,
  onEventClick,
  onAddEventClick,
  canAddEvent = false,
  emptyStateMessage = 'Nenhum compromisso agendado para este dia.',
}: CalendarMonthViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayEvents, setSelectedDayEvents] = useState<{
    dateStr: string;
    formattedDate: string;
    events: CalendarEventItem[];
  } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Filtra eventos pelo departamento se houver seleção
  const filteredEvents = useMemo(() => {
    if (!selectedDepartmentId) return events;
    return events.filter((e) => e.departmentId === selectedDepartmentId);
  }, [events, selectedDepartmentId]);

  // Agrupa eventos por data no formato YYYY-MM-DD (America/Sao_Paulo)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const ev of filteredEvents) {
      const d = typeof ev.date === 'string' ? new Date(ev.date) : ev.date;
      if (isNaN(d.getTime())) continue;
      // Normaliza para string YYYY-MM-DD no fuso America/Sao_Paulo
      const dateKey = getLocalDateString(d, 'America/Sao_Paulo');
      const list = map.get(dateKey) || [];
      list.push(ev);
      map.set(dateKey, list);
    }
    return map;
  }, [filteredEvents]);

  // Gera a matriz do calendário (inclui dias dos meses anterior e posterior para fechar semanas completas)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const firstDayWeekday = firstDayOfMonth.getDay(); // 0 a 6
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const days: {
      date: Date;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      dayNumber: number;
      events: CalendarEventItem[];
    }[] = [];

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Dias do mês anterior
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({
        date: d,
        dateKey: key,
        isCurrentMonth: false,
        isToday: key === todayKey,
        dayNumber: d.getDate(),
        events: eventsByDate.get(key) || [],
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const d = new Date(year, month, i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({
        date: d,
        dateKey: key,
        isCurrentMonth: true,
        isToday: key === todayKey,
        dayNumber: i,
        events: eventsByDate.get(key) || [],
      });
    }

    // Dias do próximo mês para completar 35 ou 42 células (múltiplo de 7)
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        const d = new Date(year, month + 1, i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        days.push({
          date: d,
          dateKey: key,
          isCurrentMonth: false,
          isToday: key === todayKey,
          dayNumber: d.getDate(),
          events: eventsByDate.get(key) || [],
        });
      }
    }

    return days;
  }, [year, month, eventsByDate]);

  const handleOpenDayModal = (day: (typeof calendarDays)[0]) => {
    const formatted = day.date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    setSelectedDayEvents({
      dateStr: day.dateKey,
      formattedDate: formatted.charAt(0).toUpperCase() + formatted.slice(1),
      events: day.events,
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'CONFIRMED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-success-soft text-success-ink">Confirmado</span>;
      case 'PENDING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-warning-soft text-warning-ink">Aguardando Voluntário</span>;
      case 'PENDING_APPROVAL':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-warning-soft text-warning-ink border border-warning/40">Aguardando Líder</span>;
      case 'DECLINED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-danger-soft text-danger-ink">Recusado</span>;
      case 'SUBSTITUTED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-info-soft text-primary">Substituído</span>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-surface border border-line rounded-surface p-4 sm:p-6 shadow-sm">
      {/* Barra Superior: Navegação e Filtro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-bg rounded-control p-1 border border-line">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Mês anterior"
              className="p-2 min-h-touch min-w-touch flex items-center justify-center rounded-control hover:bg-surface text-ink transition-colors"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold rounded-control hover:bg-surface text-ink transition-colors min-h-touch flex items-center"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Próximo mês"
              className="p-2 min-h-touch min-w-touch flex items-center justify-center rounded-control hover:bg-surface text-ink transition-colors"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-display text-ink">
            {MONTH_NAMES[month]} <span className="text-ink-muted font-normal">{year}</span>
          </h2>
        </div>

        {departments && departments.length > 0 && onSelectDepartmentId && (
          <div className="flex items-center gap-2">
            <label htmlFor="calendar-dept-filter" className="text-xs font-semibold text-ink-muted uppercase tracking-wider hidden sm:inline">
              Departamento:
            </label>
            <select
              id="calendar-dept-filter"
              value={selectedDepartmentId}
              onChange={(e) => onSelectDepartmentId(e.target.value)}
              className="bg-surface border border-line rounded-control px-3 py-2 text-sm text-ink font-medium focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-auto"
            >
              <option value="">Todos os Departamentos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Grade do Calendário */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center font-semibold text-xs text-ink-muted uppercase tracking-wider py-1">
        {WEEKDAY_NAMES.map((w, idx) => (
          <div key={w} className={idx === 0 || idx === 6 ? 'text-primary font-bold' : ''}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {calendarDays.map((day) => {
          const hasEvents = day.events.length > 0;
          return (
            <div
              key={day.dateKey}
              onClick={() => handleOpenDayModal(day)}
              className={`min-h-[75px] sm:min-h-[105px] p-1.5 sm:p-2 rounded-control border transition-all cursor-pointer flex flex-col justify-between ${
                day.isCurrentMonth
                  ? 'bg-surface hover:border-primary/50 hover:shadow-sm'
                  : 'bg-bg/60 opacity-40 hover:opacity-70'
              } ${day.isToday ? 'border-primary ring-2 ring-primary/20 font-bold' : 'border-line'}`}
            >
              {/* Número do dia */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs sm:text-sm font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full tabular-nums ${
                    day.isToday
                      ? 'bg-primary text-white shadow-sm'
                      : day.isCurrentMonth
                      ? 'text-ink'
                      : 'text-ink-muted'
                  }`}
                >
                  {day.dayNumber}
                </span>

                {/* Indicador mobile de quantidade */}
                {hasEvents && (
                  <span className="sm:hidden inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary tabular-nums">
                    {day.events.length}
                  </span>
                )}
              </div>

              {/* Eventos Desktop / Preview */}
              <div className="mt-1 space-y-1 overflow-hidden hidden sm:block">
                {day.events.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEventClick) onEventClick(ev);
                      else handleOpenDayModal(day);
                    }}
                    className="truncate text-[11px] px-1.5 py-0.5 rounded font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                    title={`${ev.time ? `[${ev.time}] ` : ''}${ev.title}${ev.departmentName ? ` - ${ev.departmentName}` : ''}`}
                  >
                    {ev.time ? <span className="opacity-75 mr-1 font-mono text-[10px] tabular-nums">{ev.time.split(' ')[0]}</span> : null}
                    {ev.title}
                  </div>
                ))}

                {day.events.length > 2 && (
                  <div className="text-[10px] text-ink-muted font-semibold pl-1">
                    +{day.events.length - 2} mais
                  </div>
                )}
              </div>

              {/* Indicadores bolinha no Mobile */}
              <div className="flex items-center gap-1 mt-auto sm:hidden">
                {day.events.slice(0, 3).map((ev, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${
                      ev.status === 'PENDING_APPROVAL' ? 'bg-warning' : 'bg-primary'
                    }`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Detalhes do Dia */}
      {selectedDayEvents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-line rounded-surface w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Cabeçalho do Modal */}
            <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between bg-bg/50">
              <div>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">Programação & Escalas</span>
                <h3 className="text-lg font-bold font-display text-ink">{selectedDayEvents.formattedDate}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayEvents(null)}
                className="p-2 min-h-touch min-w-touch flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface rounded-control transition-colors"
                aria-label="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Lista de Eventos do Dia */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
              {selectedDayEvents.events.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-ink-muted text-sm">{emptyStateMessage}</p>
                  {canAddEvent && onAddEventClick && (
                    <button
                      type="button"
                      onClick={() => {
                        const dateKey = selectedDayEvents.dateStr;
                        setSelectedDayEvents(null);
                        onAddEventClick(dateKey);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 min-h-touch rounded-control bg-primary text-white text-xs font-bold shadow hover:bg-primary/90 transition-all"
                    >
                      <Plus size={16} weight="bold" /> Criar Compromisso Neste Dia
                    </button>
                  )}
                </div>
              ) : (
                selectedDayEvents.events.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => {
                      if (onEventClick) {
                        setSelectedDayEvents(null);
                        onEventClick(ev);
                      }
                    }}
                    className={`p-3.5 rounded-control border border-line bg-surface hover:border-primary/50 transition-all ${
                      onEventClick ? 'cursor-pointer hover:shadow-md' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-bold text-ink text-sm leading-snug">{ev.title}</h4>
                      {getStatusBadge(ev.status)}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted mt-2">
                      {ev.time && (
                        <span className="inline-flex items-center gap-1 font-mono font-medium">
                          <Clock size={14} className="text-ink-muted flex-shrink-0" />
                          <span className="tabular-nums">{ev.time}</span>
                        </span>
                      )}
                      {ev.departmentName && (
                        <span className="inline-flex items-center gap-1 font-semibold text-primary">
                          <Buildings size={14} className="text-primary flex-shrink-0" />
                          {ev.departmentName}
                        </span>
                      )}
                    </div>

                    {ev.subtitle && (
                      <p className="text-xs text-ink-muted mt-1.5 border-t border-line/60 pt-1.5">
                        {ev.subtitle}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 border-t border-line bg-bg/50 flex items-center justify-between">
              {canAddEvent && onAddEventClick ? (
                <button
                  type="button"
                  onClick={() => {
                    const dateKey = selectedDayEvents.dateStr;
                    setSelectedDayEvents(null);
                    onAddEventClick(dateKey);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-touch rounded-control bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-sm"
                >
                  <Plus size={16} weight="bold" /> Novo Compromisso
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setSelectedDayEvents(null)}
                className="px-4 py-2 min-h-touch rounded-control border border-line text-xs font-semibold text-ink hover:bg-surface transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
