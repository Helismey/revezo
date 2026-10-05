'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  DownloadSimple,
  Funnel,
  CheckCircle,
  XCircle,
  Warning,
  Clock,
  ArrowsClockwise,
  Info,
  X,
} from '@/components/Icons';
import { AlertBanner } from '@/components/AlertBanner';

export interface AuditItem {
  id: string;
  churchId?: string | null;
  churchName?: string | null;
  actorId?: string | null;
  actor?: { id: string; name: string; email: string } | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetUser?: { id: string; name: string; email: string } | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILED' | string;
  ip?: string | null;
  meta?: any;
  createdAt: string | Date;
}

export interface AuditoriaClientProps {
  initialItems: AuditItem[];
  initialPagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export default function AuditoriaClient({
  initialItems,
  initialPagination,
}: AuditoriaClientProps) {
  const [items, setItems] = useState<AuditItem[]>(initialItems);
  const [pagination, setPagination] = useState(initialPagination);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Filtros
  const [searchUser, setSearchUser] = useState('');
  const [actionCategory, setActionCategory] = useState('ALL');
  const [resultFilter, setResultFilter] = useState('ALL');
  const [periodOption, setPeriodOption] = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('30d');

  // Modal de Detalhes
  const [selectedLog, setSelectedLog] = useState<AuditItem | null>(null);

  function calculateDates(period: '24h' | '7d' | '30d' | '90d' | 'all') {
    if (period === 'all') return { from: undefined, to: undefined };
    const now = new Date();
    const hours =
      period === '24h' ? 24 : period === '7d' ? 7 * 24 : period === '30d' ? 30 * 24 : 90 * 24;
    const from = new Date(Date.now() - hours * 60 * 60 * 1000);
    return {
      from: from.toISOString(),
      to: now.toISOString(),
    };
  }

  function getActionPrefix(cat: string): string | undefined {
    switch (cat) {
      case 'AUTH':
        return 'LOGIN_';
      case 'PASSWORD':
        return 'PASSWORD_';
      case 'ASSIGNMENT':
        return 'ASSIGNMENT_';
      case 'SWAP':
        return 'SWAP_';
      case 'MEMBER':
        return 'MEMBER_';
      case 'LGPD':
        return 'LGPD';
      case 'EXPORT':
        return 'DATA_EXPORTED';
      default:
        return undefined;
    }
  }

  async function fetchLogs(page = 1) {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = calculateDates(periodOption);
      const actionPrefix = getActionPrefix(actionCategory);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(searchUser.trim() ? { searchUser: searchUser.trim() } : {}),
        ...(actionPrefix ? { action: actionPrefix } : {}),
        ...(resultFilter !== 'ALL' ? { result: resultFilter } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });

      const res = await fetch(`/api/auditoria?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items);
        setPagination(data.pagination);
      } else {
        setError(data.error || 'Falha ao buscar logs de auditoria');
      }
    } catch {
      setError('Erro de conexão ao consultar trilha de auditoria');
    } finally {
      setLoading(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchLogs(1);
  }

  function handleExportCsv() {
    const { from, to } = calculateDates(periodOption);
    const actionPrefix = getActionPrefix(actionCategory);

    const params = new URLSearchParams({
      format: 'csv',
      ...(searchUser.trim() ? { searchUser: searchUser.trim() } : {}),
      ...(actionPrefix ? { action: actionPrefix } : {}),
      ...(resultFilter !== 'ALL' ? { result: resultFilter } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });

    window.open(`/api/auditoria?${params.toString()}`, '_blank');
    setExportNotice(
      'Exportação de dados iniciada. Esta ação foi registrada permanentemente na trilha de auditoria (Regra 19).'
    );
    setTimeout(() => setExportNotice(null), 8000);
  }

  // Rótulos amigáveis para ações do sistema
  function getActionBadge(action: string) {
    let color = 'bg-ink/5 text-ink border-line';
    let label = action;

    if (action.includes('CONFIRM')) {
      color = 'bg-success-soft text-success-ink border-success-ink/20';
    } else if (action.includes('DECLINE') || action.includes('DENIED') || action.includes('FAILED')) {
      color = 'bg-danger-soft text-danger-ink border-danger-ink/20';
    } else if (action.includes('SWAP') || action.includes('SUBSTITUT')) {
      color = 'bg-warning-soft text-warning-ink border-warning-ink/20';
    } else if (action.includes('CREATED') || action.includes('LOGIN') || action.includes('APPROVED')) {
      color = 'bg-primary-soft text-primary-ink border-primary/20';
    } else if (action.includes('EXPORT') || action.includes('LGPD')) {
      color = 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border-purple-300/30';
    }

    return (
      <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold border ${color}`}>
        {label}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-primary-soft text-primary rounded-control">
              <ShieldCheck size={24} weight="bold" />
            </span>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">
              Trilha de Auditoria
            </h1>
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Registro imutável (somente-inserção) de eventos de segurança, autenticação e alterações no sistema.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2.5 bg-surface border border-line text-ink font-semibold rounded-control text-sm hover:border-primary transition-colors flex items-center gap-2 self-start sm:self-auto min-h-touch shadow-sm"
        >
          <DownloadSimple size={18} className="text-primary flex-shrink-0" />
          Exportar Auditoria (CSV)
        </button>
      </div>

      {exportNotice && <AlertBanner type="sucesso" message={exportNotice} />}
      {error && <AlertBanner type="erro" message={error} />}

      {/* Painel de Filtros */}
      <form
        onSubmit={handleFilterSubmit}
        className="bg-surface p-4 rounded-surface border border-line shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2 font-display font-semibold text-sm text-ink pb-2 border-b border-line">
          <Funnel size={16} className="text-primary" /> Filtros de Auditoria
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Busca por Usuário */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
              Usuário (Ator ou Alvo)
            </label>
            <input
              type="text"
              placeholder="Nome ou e-mail..."
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              className="w-full bg-bg border border-line rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-primary"
            />
          </div>

          {/* Categoria de Ação */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
              Categoria da Ação
            </label>
            <select
              value={actionCategory}
              onChange={(e) => setActionCategory(e.target.value)}
              className="w-full bg-bg border border-line rounded-control px-3 py-2 text-sm text-ink font-medium focus:outline-none focus:border-primary"
            >
              <option value="ALL">Todas as Ações</option>
              <option value="AUTH">Login e Sessão</option>
              <option value="PASSWORD">Recuperação de Senha</option>
              <option value="ASSIGNMENT">Escalas e Presenças</option>
              <option value="SWAP">Trocas e Substituições</option>
              <option value="MEMBER">Gestão de Membros</option>
              <option value="EXPORT">Exportação de Dados</option>
              <option value="LGPD">Privacidade e LGPD</option>
            </select>
          </div>

          {/* Resultado */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
              Resultado
            </label>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="w-full bg-bg border border-line rounded-control px-3 py-2 text-sm text-ink font-medium focus:outline-none focus:border-primary"
            >
              <option value="ALL">Todos os Resultados</option>
              <option value="SUCCESS">Sucesso (SUCCESS)</option>
              <option value="DENIED">Negado (DENIED)</option>
              <option value="FAILED">Falha (FAILED)</option>
            </select>
          </div>

          {/* Período */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
              Período
            </label>
            <select
              value={periodOption}
              onChange={(e) => setPeriodOption(e.target.value as any)}
              className="w-full bg-bg border border-line rounded-control px-3 py-2 text-sm text-ink font-medium focus:outline-none focus:border-primary"
            >
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="all">Todo o Histórico</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary text-white font-semibold rounded-control text-sm hover:bg-primary-dark transition-colors flex items-center gap-2 min-h-touch"
          >
            <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} />
            Aplicar Filtros
          </button>
        </div>
      </form>

      {/* Tabela de Eventos */}
      <div className="bg-surface rounded-surface border border-line overflow-hidden shadow-sm">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-base text-ink">Registros de Auditoria</h2>
            <span className="text-xs bg-bg px-2 py-0.5 rounded text-ink-muted font-mono">
              Total: {pagination.totalCount}
            </span>
          </div>
          <span className="text-xs text-ink-muted">
            Página {pagination.page} de {Math.max(1, pagination.totalPages)}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-ink-muted text-sm">Carregando auditoria...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-ink-muted text-sm">
            Nenhum evento registrado com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg text-ink-muted uppercase text-[11px] font-bold tracking-wider border-b border-line">
                <tr>
                  <th className="py-3 px-4">Data e Hora</th>
                  <th className="py-3 px-4">Ação</th>
                  <th className="py-3 px-4">Ator</th>
                  <th className="py-3 px-4">Alvo</th>
                  <th className="py-3 px-4 text-center">Resultado</th>
                  <th className="py-3 px-4 font-mono text-xs">IP</th>
                  <th className="py-3 px-4 text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((log) => {
                  const date = new Date(log.createdAt);
                  return (
                    <tr key={log.id} className="hover:bg-bg/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-ink-muted whitespace-nowrap">
                        <div>{date.toLocaleDateString('pt-BR')}</div>
                        <div className="text-[10px] text-ink-muted">{date.toLocaleTimeString('pt-BR')}</div>
                      </td>
                      <td className="py-3 px-4">{getActionBadge(log.action)}</td>
                      <td className="py-3 px-4">
                        {log.actor ? (
                          <div>
                            <div className="font-medium text-ink text-xs">{log.actor.name}</div>
                            <div className="text-[11px] text-ink-muted">{log.actor.email}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted italic">Sistema (Automático)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-ink-muted">
                        {log.targetType ? (
                          <div>
                            <span className="font-semibold text-ink">{log.targetType}</span>
                            {log.targetUser ? (
                              <div className="text-[11px] text-ink-muted">
                                {log.targetUser.name}
                              </div>
                            ) : log.targetId ? (
                              <div className="font-mono text-[10px] text-ink-muted truncate max-w-[120px]">
                                {log.targetId}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            log.result === 'SUCCESS'
                              ? 'bg-success-soft text-success-ink'
                              : log.result === 'DENIED'
                              ? 'bg-warning-soft text-warning-ink'
                              : 'bg-danger-soft text-danger-ink'
                          }`}
                        >
                          {log.result === 'SUCCESS' ? (
                            <CheckCircle size={12} weight="bold" />
                          ) : log.result === 'DENIED' ? (
                            <Warning size={12} weight="bold" />
                          ) : (
                            <XCircle size={12} weight="bold" />
                          )}
                          {log.result}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-ink-muted whitespace-nowrap">
                        {log.ip || '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 text-xs font-semibold text-primary bg-primary-soft hover:bg-primary/20 rounded transition-colors inline-flex items-center gap-1"
                        >
                          <Info size={14} /> Metadados
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-line flex items-center justify-between bg-bg/50">
            <button
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="px-3 py-1.5 bg-surface border border-line rounded text-xs font-semibold text-ink disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs text-ink-muted font-medium">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <button
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={!pagination.hasMore || loading}
              className="px-3 py-1.5 bg-surface border border-line rounded text-xs font-semibold text-ink disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {/* Modal de Inspeção de Metadados Sanitizados */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-surface border border-line shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-line flex items-center justify-between bg-bg">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-primary" />
                <h3 className="font-display font-bold text-sm text-ink">
                  Metadados do Evento de Auditoria
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-ink-muted hover:text-ink transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-bg p-3 rounded border border-line">
                <div>
                  <span className="text-ink-muted block text-[10px] uppercase font-bold">Ação</span>
                  <span className="font-mono font-semibold text-ink">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-ink-muted block text-[10px] uppercase font-bold">Data/Hora</span>
                  <span className="text-ink">
                    {new Date(selectedLog.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted block text-[10px] uppercase font-bold">Ator</span>
                  <span className="text-ink">
                    {selectedLog.actor ? `${selectedLog.actor.name} (${selectedLog.actor.email})` : 'Sistema'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted block text-[10px] uppercase font-bold">IP de Origem</span>
                  <span className="font-mono text-ink">{selectedLog.ip || 'Não registrado'}</span>
                </div>
              </div>

              <div>
                <span className="text-ink-muted block text-[10px] uppercase font-bold mb-1">
                  Metadados JSON (Higienizados conforme LGPD / Regra 19)
                </span>
                <pre className="p-3 bg-bg border border-line rounded font-mono text-[11px] text-ink overflow-x-auto max-h-60">
                  {selectedLog.meta
                    ? JSON.stringify(selectedLog.meta, null, 2)
                    : '// Nenhum metadado adicional registrado'}
                </pre>
              </div>

              <div className="text-[11px] text-ink-muted flex items-center gap-1.5 pt-1">
                <Clock size={14} className="text-primary" />
                Este registro é imutável e retido para conformidade técnica e LGPD.
              </div>
            </div>

            <div className="p-3 border-t border-line bg-bg flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-surface border border-line rounded text-xs font-semibold text-ink hover:bg-bg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
