'use client';

import React, { useState } from 'react';
import { AlertBanner } from '@/components/AlertBanner';
import {
  DownloadSimple,
  ChartBar,
  Clock,
  CheckCircle,
  XCircle,
  ArrowsLeftRight,
  UserCheck,
  Funnel,
  ArrowsClockwise,
} from '@/components/Icons';

interface DepartmentOption {
  id: string;
  name: string;
}

interface VolunteerStat {
  userId: string;
  name: string;
  email: string;
  departmentNames: string[];
  totalScheduled: number;
  confirmed: number;
  declined: number;
  substituted: number;
  pending: number;
  lastServedAt: Date | string | null;
}

interface ReportData {
  period: {
    from: string;
    to: string;
  };
  totals: {
    totalAssignments: number;
    confirmedCount: number;
    declinedCount: number;
    substitutedCount: number;
    pendingCount: number;
    confirmationRate: number;
  };
  volunteers: VolunteerStat[];
}

export interface ScheduleHistoryEventItem {
  id: string;
  timestamp: string | Date;
  eventType: 'ASSIGNED' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED' | 'SWAP_REQUEST';
  actionLabel: string;
  actionCode: string;
  actor: {
    id: string | null;
    name: string;
    isSystem: boolean;
  };
  volunteer: {
    id: string;
    name: string;
    email: string;
  };
  substitute?: {
    id: string;
    name: string;
    email: string;
  } | null;
  slot: {
    id: string;
    title: string;
    startsAt: string | Date;
    endsAt: string | Date;
    programTitle: string;
    departmentName: string;
    functionName?: string | null;
  };
  details: {
    reason?: string | null;
    notes?: string | null;
    status?: string | null;
  };
}

interface HistoryData {
  events: ScheduleHistoryEventItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface HistoricoClientProps {
  isAdmin: boolean;
  departments: DepartmentOption[];
  initialReport: ReportData;
  initialHistory: HistoryData;
  initialDepartmentId: string;
}

export default function HistoricoClient({
  isAdmin,
  departments,
  initialReport,
  initialHistory,
  initialDepartmentId,
}: HistoricoClientProps) {
  // Aba ativa: 'participacao' | 'timeline'
  const [activeTab, setActiveTab] = useState<'participacao' | 'timeline'>('participacao');

  const [selectedDeptId, setSelectedDeptId] = useState(initialDepartmentId);
  const [periodDays, setPeriodDays] = useState<'30' | '90' | '180' | '365'>('90');
  const [report, setReport] = useState<ReportData>(initialReport);
  const [history, setHistory] = useState<HistoryData>(initialHistory);
  const [historyEventType, setHistoryEventType] = useState<string>('ALL');

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Calcula datas a partir dos dias selecionados
  function calculatePeriod(days: number) {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  async function fetchReport(deptId: string, daysStr: '30' | '90' | '180' | '365') {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = calculatePeriod(parseInt(daysStr, 10));
      const params = new URLSearchParams({
        from,
        to,
        ...(deptId ? { departmentId: deptId } : {}),
      });

      const res = await fetch(`/api/relatorios/participacao?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setReport(data.data);
      } else {
        setError(data.error || 'Erro ao carregar dados do relatório');
      }
    } catch {
      setError('Erro de conexão ao buscar histórico');
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistory(
    deptId: string,
    daysStr: '30' | '90' | '180' | '365',
    eventType: string,
    page = 1
  ) {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = calculatePeriod(parseInt(daysStr, 10));
      const params = new URLSearchParams({
        from,
        to,
        page: page.toString(),
        limit: '50',
        ...(deptId ? { departmentId: deptId } : {}),
        ...(eventType !== 'ALL' ? { eventType } : {}),
      });

      const res = await fetch(`/api/relatorios/historico-escalas?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setHistory(data);
      } else {
        setError(data.error || 'Erro ao carregar histórico de escalas');
      }
    } catch {
      setError('Erro de conexão ao buscar linha do tempo de escalas');
    } finally {
      setLoading(false);
    }
  }

  function handleDeptChange(deptId: string) {
    setSelectedDeptId(deptId);
    if (activeTab === 'participacao') {
      fetchReport(deptId, periodDays);
    } else {
      fetchHistory(deptId, periodDays, historyEventType, 1);
    }
  }

  function handlePeriodChange(days: '30' | '90' | '180' | '365') {
    setPeriodDays(days);
    if (activeTab === 'participacao') {
      fetchReport(selectedDeptId, days);
    } else {
      fetchHistory(selectedDeptId, days, historyEventType, 1);
    }
  }

  function handleEventTypeChange(eventType: string) {
    setHistoryEventType(eventType);
    fetchHistory(selectedDeptId, periodDays, eventType, 1);
  }

  function handleExportCsv() {
    const { from, to } = calculatePeriod(parseInt(periodDays, 10));
    if (activeTab === 'participacao') {
      const params = new URLSearchParams({
        from,
        to,
        format: 'csv',
        ...(selectedDeptId ? { departmentId: selectedDeptId } : {}),
      });
      window.open(`/api/relatorios/participacao?${params.toString()}`, '_blank');
      setExportNotice('Exportação da planilha de participação registrada na trilha de auditoria.');
    } else {
      const params = new URLSearchParams({
        from,
        to,
        format: 'csv',
        ...(selectedDeptId ? { departmentId: selectedDeptId } : {}),
        ...(historyEventType !== 'ALL' ? { eventType: historyEventType } : {}),
      });
      window.open(`/api/relatorios/historico-escalas?${params.toString()}`, '_blank');
      setExportNotice('Exportação do histórico detalhado de escalas registrada na trilha de auditoria.');
    }
    setTimeout(() => setExportNotice(null), 8000);
  }

  // Filtragem de voluntários por busca textual
  const filteredVolunteers = report.volunteers.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filtragem de eventos de histórico por busca textual
  const filteredHistoryEvents = history.events.filter(
    (ev) =>
      ev.volunteer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.volunteer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ev.substitute && ev.substitute.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ev.slot.programTitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function getHistoryEventIcon(eventType: string) {
    switch (eventType) {
      case 'CONFIRMED':
        return <CheckCircle size={16} className="text-success-ink" weight="bold" />;
      case 'DECLINED':
        return <XCircle size={16} className="text-danger-ink" weight="bold" />;
      case 'SUBSTITUTED':
        return <ArrowsLeftRight size={16} className="text-warning-ink" weight="bold" />;
      default:
        return <UserCheck size={16} className="text-primary" weight="bold" />;
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">
            Histórico e Participação
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Acompanhe o engajamento da equipe, comparecimento e a linha do tempo de quem foi escalado, confirmou ou foi substituído.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2.5 bg-surface border border-line text-ink font-semibold rounded-control text-sm hover:border-primary transition-colors flex items-center gap-2 self-start sm:self-auto min-h-touch shadow-sm"
        >
          <DownloadSimple size={18} className="text-primary flex-shrink-0" />
          {activeTab === 'participacao' ? 'Exportar Relatório (CSV)' : 'Exportar Histórico (CSV)'}
        </button>
      </div>

      {exportNotice && <AlertBanner type="sucesso" message={exportNotice} />}
      {error && <AlertBanner type="erro" message={error} />}

      {/* Navegação por Abas */}
      <div className="flex border-b border-line gap-2">
        <button
          onClick={() => {
            setActiveTab('participacao');
            fetchReport(selectedDeptId, periodDays);
          }}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'participacao'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <ChartBar size={18} />
          Relatório de Participação
        </button>
        <button
          onClick={() => {
            setActiveTab('timeline');
            fetchHistory(selectedDeptId, periodDays, historyEventType, 1);
          }}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'timeline'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Clock size={18} />
          Linha do Tempo de Escalas
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-surface p-4 rounded-surface border border-line flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Departamento */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
              Departamento
            </label>
            <select
              value={selectedDeptId}
              onChange={(e) => handleDeptChange(e.target.value)}
              className="bg-bg border border-line rounded-control px-3 py-2 text-sm text-ink font-medium focus:outline-none focus:border-primary"
            >
              {isAdmin && <option value="">Todos os Departamentos</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Período */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
              Período
            </label>
            <select
              value={periodDays}
              onChange={(e) => handlePeriodChange(e.target.value as any)}
              className="bg-bg border border-line rounded-control px-3 py-2 text-sm text-ink font-medium focus:outline-none focus:border-primary"
            >
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="180">Últimos 6 meses</option>
              <option value="365">Último ano</option>
            </select>
          </div>

          {/* Seletor de Tipo de Evento (Visível na aba de linha do tempo) */}
          {activeTab === 'timeline' && (
            <div>
              <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
                Tipo de Ação
              </label>
              <select
                value={historyEventType}
                onChange={(e) => handleEventTypeChange(e.target.value)}
                className="bg-bg border border-line rounded-control px-3 py-2 text-sm text-ink font-medium focus:outline-none focus:border-primary"
              >
                <option value="ALL">Todas as Ações</option>
                <option value="ASSIGNED">Escalados</option>
                <option value="CONFIRMED">Presenças Confirmadas</option>
                <option value="DECLINED">Desmarcações / Recusas</option>
                <option value="SUBSTITUTED">Substituições</option>
                <option value="SWAP">Pedidos de Troca</option>
              </select>
            </div>
          )}
        </div>

        {/* Busca por voluntário */}
        <div className="w-full sm:w-64">
          <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Buscar Voluntário
          </label>
          <input
            type="text"
            placeholder="Nome ou e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg border border-line rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* CONTEÚDO DA ABA 1: RELATÓRIO DE PARTICIPAÇÃO */}
      {activeTab === 'participacao' && (
        <div className="space-y-6">
          {/* Cards de Métricas e Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface p-5 rounded-surface border border-line">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block mb-1">
                Total de Escalas
              </span>
              <span className="font-display font-bold text-2xl sm:text-3xl text-ink">
                {report.totals.totalAssignments}
              </span>
              <span className="text-xs text-ink-muted block mt-1">escalas no período</span>
            </div>

            <div className="bg-surface p-5 rounded-surface border border-line">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block mb-1">
                Comparecimento
              </span>
              <span className="font-display font-bold text-2xl sm:text-3xl text-success-ink">
                {report.totals.confirmationRate}%
              </span>
              <span className="text-xs text-ink-muted block mt-1">
                {report.totals.confirmedCount} presenças confirmadas
              </span>
            </div>

            <div className="bg-surface p-5 rounded-surface border border-line">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block mb-1">
                Desmarcações
              </span>
              <span className="font-display font-bold text-2xl sm:text-3xl text-danger-ink">
                {report.totals.declinedCount}
              </span>
              <span className="text-xs text-ink-muted block mt-1">imprevistos informados</span>
            </div>

            <div className="bg-surface p-5 rounded-surface border border-line">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block mb-1">
                Substituições
              </span>
              <span className="font-display font-bold text-2xl sm:text-3xl text-warning-ink">
                {report.totals.substitutedCount}
              </span>
              <span className="text-xs text-ink-muted block mt-1">vagas realocadas</span>
            </div>
          </div>

          {/* Tabela de Participação por Voluntário */}
          <div className="bg-surface rounded-surface border border-line overflow-hidden shadow-sm">
            <div className="p-4 border-b border-line flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-ink">Engajamento por Voluntário</h2>
              <span className="text-xs text-ink-muted">
                {filteredVolunteers.length} voluntários com atividade
              </span>
            </div>

            {loading ? (
              <div className="text-center py-12 text-ink-muted text-sm">Atualizando dados...</div>
            ) : filteredVolunteers.length === 0 ? (
              <div className="text-center py-12 text-ink-muted text-sm">
                Nenhum registro encontrado para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-bg text-ink-muted uppercase text-[11px] font-bold tracking-wider border-b border-line">
                    <tr>
                      <th className="py-3 px-4">Voluntário</th>
                      <th className="py-3 px-4">Departamentos</th>
                      <th className="py-3 px-4 text-center">Total</th>
                      <th className="py-3 px-4 text-center text-success-ink">Confirmadas</th>
                      <th className="py-3 px-4 text-center text-danger-ink">Recusadas</th>
                      <th className="py-3 px-4 text-center text-warning-ink">Substituídas</th>
                      <th className="py-3 px-4 text-right">Taxa de Presença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredVolunteers.map((vol) => {
                      const rate =
                        vol.totalScheduled > 0
                          ? Math.round((vol.confirmed / vol.totalScheduled) * 100)
                          : 0;

                      return (
                        <tr key={vol.userId} className="hover:bg-bg/50 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-ink">
                            <div>{vol.name}</div>
                            <div className="text-xs text-ink-muted font-normal">{vol.email}</div>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-ink-muted">
                            {vol.departmentNames.join(', ')}
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-ink">
                            {vol.totalScheduled}
                          </td>
                          <td className="py-3.5 px-4 text-center font-semibold text-success-ink">
                            {vol.confirmed}
                          </td>
                          <td className="py-3.5 px-4 text-center font-semibold text-danger-ink">
                            {vol.declined}
                          </td>
                          <td className="py-3.5 px-4 text-center font-semibold text-warning-ink">
                            {vol.substituted}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-ink">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-control text-xs ${
                                rate >= 80
                                  ? 'bg-success-soft text-success-ink'
                                  : rate >= 50
                                  ? 'bg-warning-soft text-warning-ink'
                                  : 'bg-danger-soft text-danger-ink'
                              }`}
                            >
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: LINHA DO TEMPO DE ESCALAS */}
      {activeTab === 'timeline' && (
        <div className="bg-surface rounded-surface border border-line overflow-hidden shadow-sm">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-lg text-ink">
                Histórico Detalhado de Escalas
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Quem foi escalado, confirmou, recusou, foi substituído e por quem.
              </p>
            </div>
            <span className="text-xs bg-bg px-2.5 py-1 rounded text-ink-muted font-mono">
              Total: {history.pagination.totalCount} eventos
            </span>
          </div>

          {loading ? (
            <div className="text-center py-16 text-ink-muted text-sm">
              Carregando linha do tempo...
            </div>
          ) : filteredHistoryEvents.length === 0 ? (
            <div className="text-center py-16 text-ink-muted text-sm">
              Nenhum evento registrado para o período e departamento selecionados.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {filteredHistoryEvents.map((ev) => {
                const evDate = new Date(ev.timestamp);
                const slotDate = new Date(ev.slot.startsAt);

                return (
                  <div
                    key={ev.id}
                    className="p-4 hover:bg-bg/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-bg rounded-control border border-line mt-0.5">
                        {getHistoryEventIcon(ev.eventType)}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink">{ev.actionLabel}</span>
                          <span className="text-xs text-ink-muted">·</span>
                          <span className="text-xs font-mono text-ink-muted">
                            {evDate.toLocaleDateString('pt-BR')} às{' '}
                            {evDate.toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {/* Detalhes da Vaga e Programa */}
                        <div className="text-xs text-ink">
                          <span className="font-semibold text-primary">{ev.slot.programTitle}</span>
                          {' — '}
                          <span>{ev.slot.departmentName}</span>
                          {ev.slot.functionName && (
                            <span className="text-ink-muted"> ({ev.slot.functionName})</span>
                          )}
                          {' · '}
                          <span className="font-medium text-ink-muted">
                            {slotDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>

                        {/* Voluntário & Substituto */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          <span className="bg-bg px-2 py-0.5 rounded border border-line font-medium text-ink">
                            Voluntário: <strong>{ev.volunteer.name}</strong>
                          </span>

                          {ev.substitute && (
                            <span className="bg-warning-soft text-warning-ink px-2 py-0.5 rounded font-medium border border-warning-ink/20">
                              Substituto: <strong>{ev.substitute.name}</strong>
                            </span>
                          )}

                          <span className="text-ink-muted text-[11px]">
                            Ação realizada por:{' '}
                            <span className="font-semibold text-ink">{ev.actor.name}</span>
                          </span>
                        </div>

                        {/* Motivo ou parecer se houver */}
                        {ev.details.reason && (
                          <div className="text-xs text-danger-ink bg-danger-soft/60 px-2.5 py-1 rounded inline-block mt-1">
                            Motivo informado: &quot;{ev.details.reason}&quot;
                          </div>
                        )}
                        {ev.details.notes && (
                          <div className="text-xs text-ink-muted italic block">
                            Observações do gestor: {ev.details.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paginação da Linha do Tempo */}
          {history.pagination.totalPages > 1 && (
            <div className="p-4 border-t border-line flex items-center justify-between bg-bg/50">
              <button
                onClick={() =>
                  fetchHistory(
                    selectedDeptId,
                    periodDays,
                    historyEventType,
                    history.pagination.page - 1
                  )
                }
                disabled={history.pagination.page <= 1 || loading}
                className="px-3 py-1.5 bg-surface border border-line rounded text-xs font-semibold text-ink disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-xs text-ink-muted font-medium">
                Página {history.pagination.page} de {history.pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  fetchHistory(
                    selectedDeptId,
                    periodDays,
                    historyEventType,
                    history.pagination.page + 1
                  )
                }
                disabled={!history.pagination.hasMore || loading}
                className="px-3 py-1.5 bg-surface border border-line rounded text-xs font-semibold text-ink disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
