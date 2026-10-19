'use client';

import React, { useState, useMemo } from 'react';
import { AlertBanner } from '@/components/AlertBanner';
import { CalendarMonthView, CalendarEventItem } from '@/components/CalendarMonthView';
import {
  ListBullets,
  Calendar,
  Plus,
  X,
  ArrowsClockwise,
  Crown,
  Cross,
  Church,
  ChartBar,
  Trash,
  ShieldCheck,
} from '@/components/Icons';
import { generateRecurrenceDates, parseSaoPauloDateTimeToUtc } from '@revezo/domain';

export interface DepartmentOption {
  id: string;
  name: string;
  functions: { id: string; name: string }[];
}

export interface ProgramSlotData {
  title: string;
  departmentId: string;
  functionId?: string;
  startsAtTime: string; // HH:mm
  endsAtTime: string;   // HH:mm
  requiredCount: number;
}

export interface ProgramListItem {
  id: string;
  title: string;
  date: string;
  departments: { id: string; name: string }[];
  slotsCount: number;
  createdByRole?: string | null;
  isCreatedBySuperior?: boolean;
}

interface ProgramasClientProps {
  programs: ProgramListItem[];
  departments: DepartmentOption[];
  canManage: boolean;
  activeChurchId?: string;
  churchName?: string;
}

const WEEKDAY_OPTIONS = [
  { day: 0, label: 'Domingo' },
  { day: 1, label: 'Segunda-feira' },
  { day: 2, label: 'Terça-feira' },
  { day: 3, label: 'Quarta-feira' },
  { day: 4, label: 'Quinta-feira' },
  { day: 5, label: 'Sexta-feira' },
  { day: 6, label: 'Sábado' },
];

export function ProgramasClient({ programs, departments, canManage, activeChurchId, churchName }: ProgramasClientProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalTab, setCreateModalTab] = useState<'single' | 'recurrent'>('single');
  const [selectedCalendarDeptId, setSelectedCalendarDeptId] = useState('');

  const [cloningProgramId, setCloningProgramId] = useState<string | null>(null);
  const [cloneDate, setCloneDate] = useState('');
  const [message, setMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Estado do formulário de programa único
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [slots, setSlots] = useState<ProgramSlotData[]>([
    {
      title: 'Louvor e Adoração',
      departmentId: departments[0]?.id || '',
      functionId: '',
      startsAtTime: '09:00',
      endsAtTime: '10:30',
      requiredCount: 1,
    },
  ]);

  // Estado do formulário de programação recorrente / em massa
  const [recurrentTitle, setRecurrentTitle] = useState('');
  const [recurrenceMode, setRecurrenceMode] = useState<'WEEKLY_DAYS' | 'DAILY_RANGE'>('WEEKLY_DAYS');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([6]); // Padrão Sábado (6)
  const [recurrentStartDate, setRecurrentStartDate] = useState('');
  const [recurrentEndDate, setRecurrentEndDate] = useState('');
  const [recurrentTime, setRecurrentTime] = useState('09:00');
  const [recurrentDeptIds, setRecurrentDeptIds] = useState<string[]>([]);
  const [recurrentSlots, setRecurrentSlots] = useState<ProgramSlotData[]>([
    {
      title: 'Louvor e Ministração',
      departmentId: departments[0]?.id || '',
      functionId: '',
      startsAtTime: '09:00',
      endsAtTime: '10:30',
      requiredCount: 1,
    },
  ]);

  // Cálculo em tempo real da prévia de ocorrências
  const recurrencePreviewDates = useMemo(() => {
    if (!recurrentStartDate || !recurrentEndDate) return [];
    try {
      return generateRecurrenceDates({
        mode: recurrenceMode,
        startDate: recurrentStartDate,
        endDate: recurrentEndDate,
        weekdays: recurrenceMode === 'WEEKLY_DAYS' ? selectedWeekdays : undefined,
        maxOccurrences: 100,
      });
    } catch {
      return [];
    }
  }, [recurrenceMode, recurrentStartDate, recurrentEndDate, selectedWeekdays]);

  // Transforma os programas para eventos no calendário
  const calendarEvents = useMemo<CalendarEventItem[]>(() => {
    const list: CalendarEventItem[] = [];
    for (const prog of programs) {
      if (prog.departments.length > 0) {
        for (const dept of prog.departments) {
          list.push({
            id: `${prog.id}-${dept.id}`,
            title: prog.title,
            date: prog.date,
            departmentName: dept.name,
            departmentId: dept.id,
            subtitle: `${prog.slotsCount} vaga(s) planejada(s) neste programa`,
            meta: prog,
          });
        }
      } else {
        list.push({
          id: prog.id,
          title: prog.title,
          date: prog.date,
          subtitle: `${prog.slotsCount} vaga(s) planejada(s)`,
          meta: prog,
        });
      }
    }
    return list;
  }, [programs]);

  const handleDeptToggle = (deptId: string) => {
    setSelectedDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  };

  const handleRecurrentDeptToggle = (deptId: string) => {
    setRecurrentDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  };

  const handleWeekdayToggle = (day: number) => {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleAddSlot = () => {
    setSlots((prev) => [
      ...prev,
      {
        title: '',
        departmentId: selectedDeptIds[0] || departments[0]?.id || '',
        functionId: '',
        startsAtTime: '09:00',
        endsAtTime: '10:30',
        requiredCount: 1,
      },
    ]);
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSlotChange = (index: number, field: keyof ProgramSlotData, val: any) => {
    setSlots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, [field]: val };
      return copy;
    });
  };

  const handleAddRecurrentSlot = () => {
    setRecurrentSlots((prev) => [
      ...prev,
      {
        title: '',
        departmentId: recurrentDeptIds[0] || departments[0]?.id || '',
        functionId: '',
        startsAtTime: '09:00',
        endsAtTime: '10:30',
        requiredCount: 1,
      },
    ]);
  };

  const handleRemoveRecurrentSlot = (index: number) => {
    setRecurrentSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRecurrentSlotChange = (index: number, field: keyof ProgramSlotData, val: any) => {
    setRecurrentSlots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, [field]: val };
      return copy;
    });
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDeptIds.length === 0) {
      setMessage({ type: 'erro', text: 'Selecione pelo menos um departamento para o programa.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const formattedSlots = slots.map((s) => {
        const startsAt = parseSaoPauloDateTimeToUtc(date, s.startsAtTime);
        const endsAt = parseSaoPauloDateTimeToUtc(date, s.endsAtTime);
        return {
          title: s.title,
          departmentId: s.departmentId,
          functionId: s.functionId || null,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          requiredCount: Number(s.requiredCount),
        };
      });

      const res = await fetch('/api/programas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          date: parseSaoPauloDateTimeToUtc(date, slots[0]?.startsAtTime || '09:00').toISOString(),
          departmentIds: selectedDeptIds,
          slots: formattedSlots,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao criar programa');
      }

      setMessage({ type: 'sucesso', text: 'Programa criado com sucesso!' });
      setShowCreateModal(false);
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na requisição';
      setMessage({ type: 'erro', text: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRecurrentPrograms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recurrentDeptIds.length === 0) {
      setMessage({ type: 'erro', text: 'Selecione pelo menos um departamento envolvido na recorrência.' });
      return;
    }

    if (recurrencePreviewDates.length === 0) {
      setMessage({ type: 'erro', text: 'Nenhuma data válida encontrada no período para a recorrência configurada.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/programas/recorrentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: recurrentTitle,
          departmentIds: recurrentDeptIds,
          time: recurrentTime,
          recurrence: {
            mode: recurrenceMode,
            startDate: recurrentStartDate,
            endDate: recurrentEndDate,
            weekdays: recurrenceMode === 'WEEKLY_DAYS' ? selectedWeekdays : undefined,
          },
          slots: recurrentSlots.map((s) => ({
            title: s.title,
            departmentId: s.departmentId,
            functionId: s.functionId || null,
            startTime: s.startsAtTime,
            endTime: s.endsAtTime,
            requiredCount: Number(s.requiredCount),
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao criar programas em lote');
      }

      setMessage({
        type: 'sucesso',
        text: json.message || `${json.count} programas recorrentes criados com sucesso!`,
      });
      setShowCreateModal(false);
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar recorrência';
      setMessage({ type: 'erro', text: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleCloneProgram = async (programId: string) => {
    if (!cloneDate) {
      setMessage({ type: 'erro', text: 'Informe a data de destino para clonar o programa.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/programas/clonar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          targetDate: cloneDate,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao clonar programa');
      }

      setMessage({ type: 'sucesso', text: 'Programa clonado com sucesso para a nova data!' });
      setCloningProgramId(null);
      setCloneDate('');
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao clonar programa';
      setMessage({ type: 'erro', text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Programação de Cultos</h1>
          <p className="text-ink-muted text-sm mt-1">
            Planeje os cultos e compromissos da igreja individualmente ou em massa por período.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Alternador de Visão Lista / Calendário */}
          <div className="flex items-center bg-bg rounded-control p-1 border border-line">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-control text-xs font-semibold transition-all inline-flex items-center gap-1.5 min-h-touch ${
                viewMode === 'list'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <ListBullets size={16} weight={viewMode === 'list' ? 'fill' : 'regular'} />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-control text-xs font-semibold transition-all inline-flex items-center gap-1.5 min-h-touch ${
                viewMode === 'calendar'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Calendar size={16} weight={viewMode === 'calendar' ? 'fill' : 'regular'} />
              Calendário
            </button>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(true);
                setDate(new Date().toISOString().split('T')[0]!);
                setRecurrentStartDate(new Date().toISOString().split('T')[0]!);
              }}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-control text-sm shadow-sm hover:bg-primary/95 transition-all min-h-touch inline-flex items-center gap-1.5"
            >
              <Plus size={16} weight="bold" /> Novo Compromisso
            </button>
          )}
        </div>
      </div>

      {message && <AlertBanner type={message.type} message={message.text} />}

      {/* Conteúdo Principal: Modo Calendário ou Modo Lista */}
      {viewMode === 'calendar' ? (
        <CalendarMonthView
          events={calendarEvents}
          departments={departments}
          selectedDepartmentId={selectedCalendarDeptId}
          onSelectDepartmentId={setSelectedCalendarDeptId}
          canAddEvent={canManage}
          onAddEventClick={(dateStr) => {
            setDate(dateStr);
            setRecurrentStartDate(dateStr);
            setShowCreateModal(true);
          }}
          emptyStateMessage="Nenhum culto ou compromisso programado para este dia."
        />
      ) : programs.length === 0 ? (
        <div className="bg-surface rounded-surface border border-line p-8 text-center shadow-sm">
          <p className="text-ink-muted text-sm">Nenhum programa agendado. Crie o primeiro para iniciar as escalas.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-surface border border-line divide-y divide-line overflow-hidden shadow-sm">
          {programs.map((prog) => {
            const progDate = new Date(prog.date);
            const isCloningThis = cloningProgramId === prog.id;

            return (
              <div key={prog.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-bg/40 transition-colors">
                <div>
                  <div className="flex items-center flex-wrap gap-2">
                    <h3 className="font-display font-bold text-base sm:text-lg text-ink">{prog.title}</h3>
                    {prog.createdByRole && (
                      <span
                        className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          prog.createdByRole === 'ADMIN_MASTER'
                            ? 'bg-info-soft text-primary border border-info-soft'
                            : prog.createdByRole === 'PASTOR'
                            ? 'bg-warning-soft text-warning-ink border border-warning/30'
                            : 'bg-bg text-ink-muted border border-line'
                        }`}
                      >
                        {prog.createdByRole === 'ADMIN_MASTER' ? (
                          <>
                            <Crown size={12} weight="fill" className="mr-1 inline" /> Admin Master
                          </>
                        ) : prog.createdByRole === 'PASTOR' ? (
                          <>
                            <Cross size={12} weight="fill" className="mr-1 inline" /> Pastoral
                          </>
                        ) : (
                          <>
                            <Church size={12} weight="fill" className="mr-1 inline" /> Local
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  {prog.isCreatedBySuperior && (
                    <p className="text-[11px] text-warning-ink bg-warning-soft border border-warning/40 px-2 py-0.5 rounded-control inline-flex items-center gap-1 mt-1">
                      <ShieldCheck size={14} className="text-warning-ink" />
                      Definido pela liderança superior (não pode ser alterado por anciãos)
                    </p>
                  )}

                  <p className="text-xs text-ink-muted mt-0.5">
                    {progDate.toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'America/Sao_Paulo',
                    })}{' '}
                    • {prog.slotsCount} partes/vagas
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {prog.departments.map((d) => (
                      <span key={d.id} className="text-[11px] bg-bg border border-line px-2 py-0.5 rounded-control text-ink-muted font-medium">
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center space-x-2">
                    {isCloningThis ? (
                      <div className="flex items-center space-x-2 p-2 bg-bg rounded-control border border-line">
                        <input
                          type="date"
                          value={cloneDate}
                          onChange={(e) => setCloneDate(e.target.value)}
                          className="px-2.5 py-1.5 bg-surface border border-line rounded-control text-xs text-ink"
                        />
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleCloneProgram(prog.id)}
                          className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-control hover:bg-primary/90 min-h-touch flex items-center"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setCloningProgramId(null)}
                          className="text-xs text-ink-muted hover:text-ink font-semibold px-2 min-h-touch flex items-center"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCloningProgramId(prog.id);
                          setCloneDate('');
                        }}
                        className="px-3.5 py-2 border border-line text-ink hover:border-primary font-semibold rounded-control text-xs sm:text-sm min-h-touch transition-colors inline-flex items-center gap-1.5"
                      >
                        <ArrowsClockwise size={14} /> Clonar programa
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação (Único ou Recorrente em Massa) */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Novo Compromisso ou Programa"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-surface rounded-surface border border-line max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <h2 className="font-display font-bold text-xl text-ink">Novo Compromisso / Programa</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-ink-muted hover:text-ink p-2 min-h-touch min-w-touch flex items-center justify-center rounded-control transition-colors"
                aria-label="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Abas do Modal: Programa Único vs Recorrente em Massa */}
            <div className="flex border-b border-line mb-5">
              <button
                type="button"
                onClick={() => setCreateModalTab('single')}
                className={`flex-1 py-2.5 text-center text-xs sm:text-sm font-bold border-b-2 transition-all inline-flex items-center justify-center gap-2 min-h-touch ${
                  createModalTab === 'single'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <Calendar size={16} weight={createModalTab === 'single' ? 'fill' : 'regular'} />
                Programa Único
              </button>
              <button
                type="button"
                onClick={() => setCreateModalTab('recurrent')}
                className={`flex-1 py-2.5 text-center text-xs sm:text-sm font-bold border-b-2 transition-all inline-flex items-center justify-center gap-2 min-h-touch ${
                  createModalTab === 'recurrent'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <ArrowsClockwise size={16} weight={createModalTab === 'recurrent' ? 'bold' : 'regular'} />
                Programação em Massa / Recorrência
              </button>
            </div>

            {/* Formulário: Programa Único */}
            {createModalTab === 'single' ? (
              <form onSubmit={handleCreateProgram} className="space-y-4 flex-1">
                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                    Título do Programa *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Culto de Celebração Dominical"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                    Departamentos Envolvidos *
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {departments.map((dept) => (
                      <button
                        key={dept.id}
                        type="button"
                        onClick={() => handleDeptToggle(dept.id)}
                        className={`px-3 py-1.5 rounded-control text-xs font-semibold border transition-all min-h-touch ${
                          selectedDeptIds.includes(dept.id)
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-surface text-ink border-line hover:border-primary/50'
                        }`}
                      >
                        {dept.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slots / Cronograma */}
                <div className="pt-2 border-t border-line">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-ink-muted uppercase">
                      Cronograma e Funções
                    </span>
                    <button
                      type="button"
                      onClick={handleAddSlot}
                      className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1 min-h-touch"
                    >
                      <Plus size={14} weight="bold" /> Adicionar parte
                    </button>
                  </div>

                  <div className="space-y-3">
                    {slots.map((slot, index) => {
                      const dept = departments.find((d) => d.id === slot.departmentId);

                      return (
                        <div key={index} className="p-3.5 bg-bg/50 rounded-control border border-line space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Título da parte / função"
                              value={slot.title}
                              onChange={(e) => handleSlotChange(index, 'title', e.target.value)}
                              className="px-2.5 py-1.5 bg-surface border border-line rounded-control text-xs text-ink"
                            />
                            <select
                              value={slot.departmentId}
                              onChange={(e) => handleSlotChange(index, 'departmentId', e.target.value)}
                              className="px-2.5 py-1.5 bg-surface border border-line rounded-control text-xs text-ink"
                            >
                              {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <span className="text-[10px] text-ink-muted block">Início</span>
                              <input
                                type="time"
                                required
                                value={slot.startsAtTime}
                                onChange={(e) => handleSlotChange(index, 'startsAtTime', e.target.value)}
                                className="w-full px-2 py-1 bg-surface border border-line rounded-control text-xs text-ink tabular-nums"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-ink-muted block">Término</span>
                              <input
                                type="time"
                                required
                                value={slot.endsAtTime}
                                onChange={(e) => handleSlotChange(index, 'endsAtTime', e.target.value)}
                                className="w-full px-2 py-1 bg-surface border border-line rounded-control text-xs text-ink tabular-nums"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-ink-muted block">Função</span>
                              <select
                                value={slot.functionId || ''}
                                onChange={(e) => handleSlotChange(index, 'functionId', e.target.value)}
                                className="w-full px-2 py-1 bg-surface border border-line rounded-control text-xs text-ink"
                              >
                                <option value="">Qualquer</option>
                                {dept?.functions.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-end justify-between">
                              <div>
                                <span className="text-[10px] text-ink-muted block">Vagas</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={slot.requiredCount}
                                  onChange={(e) => handleSlotChange(index, 'requiredCount', e.target.value)}
                                  className="w-14 px-2 py-1 bg-surface border border-line rounded-control text-xs text-ink tabular-nums"
                                />
                              </div>
                              {slots.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSlot(index)}
                                  className="text-xs text-danger hover:underline font-semibold pb-1 inline-flex items-center gap-1"
                                >
                                  <Trash size={14} /> Remover
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-line text-ink-muted hover:text-ink text-sm font-semibold rounded-control min-h-touch"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 bg-primary text-white text-sm font-bold rounded-control hover:bg-primary/95 transition-all shadow-sm min-h-touch"
                  >
                    {loading ? 'Salvando...' : 'Salvar Programa'}
                  </button>
                </div>
              </form>
            ) : (
              /* Formulário: Programação Recorrente / Em Massa */
              <form onSubmit={handleCreateRecurrentPrograms} className="space-y-4 flex-1">
                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                    Título Modelo dos Programas *
                  </label>
                  <input
                    type="text"
                    required
                    value={recurrentTitle}
                    onChange={(e) => setRecurrentTitle(e.target.value)}
                    placeholder="Ex: Culto Divino de Sábado, Semana de Oração, Culto de Quarta"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                {/* Modo de Recorrência */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                      Tipo de Repetição *
                    </label>
                    <select
                      value={recurrenceMode}
                      onChange={(e) => setRecurrenceMode(e.target.value as 'WEEKLY_DAYS' | 'DAILY_RANGE')}
                      className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink font-medium"
                    >
                      <option value="WEEKLY_DAYS">Dias Específicos da Semana (ex: Sábados)</option>
                      <option value="DAILY_RANGE">Período Contínuo (Todos os dias)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                      Horário Padrão do Culto *
                    </label>
                    <input
                      type="time"
                      required
                      value={recurrentTime}
                      onChange={(e) => setRecurrentTime(e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink tabular-nums"
                    />
                  </div>
                </div>

                {/* Seleção de Dias da Semana (se WEEKLY_DAYS) */}
                {recurrenceMode === 'WEEKLY_DAYS' && (
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                      Repetir nestes dias da semana *
                    </label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {WEEKDAY_OPTIONS.map((w) => (
                        <button
                          key={w.day}
                          type="button"
                          onClick={() => handleWeekdayToggle(w.day)}
                          className={`px-3 py-1.5 rounded-control text-xs font-semibold border transition-all min-h-touch ${
                            selectedWeekdays.includes(w.day)
                              ? 'bg-primary text-white border-primary shadow-sm'
                              : 'bg-surface text-ink border-line hover:border-primary/50'
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Período: Data Inicial e Data Final */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                      Data Inicial do Período *
                    </label>
                    <input
                      type="date"
                      required
                      value={recurrentStartDate}
                      onChange={(e) => setRecurrentStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                      Data Final do Período *
                    </label>
                    <input
                      type="date"
                      required
                      value={recurrentEndDate}
                      onChange={(e) => setRecurrentEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-line rounded-control text-sm text-ink"
                    />
                  </div>
                </div>

                {/* Banner de Prévia de Ocorrências Calculadas */}
                <div className="p-3 rounded-control bg-primary/10 border border-primary/20 text-xs text-ink flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <ChartBar size={16} className="text-primary flex-shrink-0" />
                    <span>
                      Ocorrências detectadas no período: <strong className="text-primary font-bold tabular-nums">{recurrencePreviewDates.length} programa(s)</strong>
                    </span>
                  </span>
                  {recurrencePreviewDates.length > 0 && (
                    <span className="text-[11px] text-ink-muted tabular-nums">
                      ({recurrencePreviewDates[0]?.toLocaleDateString('pt-BR')} até {recurrencePreviewDates[recurrencePreviewDates.length - 1]?.toLocaleDateString('pt-BR')})
                    </span>
                  )}
                </div>

                {/* Departamentos Envolvidos */}
                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                    Departamentos que Devem Participar *
                  </label>
                  <p className="text-[11px] text-ink-muted mb-2">
                    Os líderes destes departamentos receberão avisos automáticos para configurar o cronograma das suas equipes.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {departments.map((dept) => (
                      <button
                        key={dept.id}
                        type="button"
                        onClick={() => handleRecurrentDeptToggle(dept.id)}
                        className={`px-3 py-1.5 rounded-control text-xs font-semibold border transition-all min-h-touch ${
                          recurrentDeptIds.includes(dept.id)
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-surface text-ink border-line hover:border-primary/50'
                        }`}
                      >
                        {dept.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vagas Modelo por Programa */}
                <div className="pt-2 border-t border-line">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-ink-muted uppercase">
                      Estrutura de Vagas / Funções Replicadas
                    </span>
                    <button
                      type="button"
                      onClick={handleAddRecurrentSlot}
                      className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1 min-h-touch"
                    >
                      <Plus size={14} weight="bold" /> Adicionar vaga no modelo
                    </button>
                  </div>

                  <div className="space-y-3">
                    {recurrentSlots.map((slot, index) => {
                      const dept = departments.find((d) => d.id === slot.departmentId);

                      return (
                        <div key={index} className="p-3.5 bg-bg/50 rounded-control border border-line space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Título da parte / função (ex: Louvor, Recepção)"
                              value={slot.title}
                              onChange={(e) => handleRecurrentSlotChange(index, 'title', e.target.value)}
                              className="px-2.5 py-1.5 bg-surface border border-line rounded-control text-xs text-ink"
                            />
                            <select
                              value={slot.departmentId}
                              onChange={(e) => handleRecurrentSlotChange(index, 'departmentId', e.target.value)}
                              className="px-2.5 py-1.5 bg-surface border border-line rounded-control text-xs text-ink"
                            >
                              {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <span className="text-[10px] text-ink-muted block">Início</span>
                              <input
                                type="time"
                                required
                                value={slot.startsAtTime}
                                onChange={(e) => handleRecurrentSlotChange(index, 'startsAtTime', e.target.value)}
                                className="w-full px-2 py-1 bg-surface border border-line rounded-control text-xs text-ink tabular-nums"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-ink-muted block">Término</span>
                              <input
                                type="time"
                                required
                                value={slot.endsAtTime}
                                onChange={(e) => handleRecurrentSlotChange(index, 'endsAtTime', e.target.value)}
                                className="w-full px-2 py-1 bg-surface border border-line rounded-control text-xs text-ink tabular-nums"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-ink-muted block">Função</span>
                              <select
                                value={slot.functionId || ''}
                                onChange={(e) => handleRecurrentSlotChange(index, 'functionId', e.target.value)}
                                className="w-full px-2 py-1 bg-surface border border-line rounded-control text-xs text-ink"
                              >
                                <option value="">Qualquer</option>
                                {dept?.functions.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-end justify-between">
                              <div>
                                <span className="text-[10px] text-ink-muted block">Vagas</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={slot.requiredCount}
                                  onChange={(e) => handleRecurrentSlotChange(index, 'requiredCount', e.target.value)}
                                  className="w-14 px-2 py-1 bg-surface border border-line rounded-control text-xs text-ink tabular-nums"
                                />
                              </div>
                              {recurrentSlots.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRecurrentSlot(index)}
                                  className="text-xs text-danger hover:underline font-semibold pb-1 inline-flex items-center gap-1"
                                >
                                  <Trash size={14} /> Remover
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-line text-ink-muted hover:text-ink text-sm font-semibold rounded-control min-h-touch"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || recurrencePreviewDates.length === 0}
                    className="px-5 py-2 bg-primary text-white text-sm font-bold rounded-control hover:bg-primary/95 transition-all shadow-sm disabled:opacity-50 min-h-touch"
                  >
                    {loading ? 'Gerando Lote...' : `Criar ${recurrencePreviewDates.length} Programas em Massa`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
