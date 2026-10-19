'use client';

import React, { useState } from 'react';
import { Printer, X, Check, Warning } from '@/components/Icons';
import { SerializedProgram } from '@/app/escalas/EscalasClient';

interface SchedulePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  programs: SerializedProgram[];
  currentProgramId: string;
  churchName?: string;
}

export function SchedulePrintModal({
  isOpen,
  onClose,
  programs,
  currentProgramId,
  churchName = 'Revezo',
}: SchedulePrintModalProps) {
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  if (!isOpen) return null;

  // Filtra programas conforme escopo
  const filteredPrograms =
    scope === 'current'
      ? programs.filter((p) => p.id === currentProgramId)
      : programs;

  // Extrai lista única de departamentos disponíveis
  const allDepartments = Array.from(
    new Map(
      programs.flatMap((p) =>
        p.slots.map((s) => [s.departmentId, s.departmentName])
      )
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const handlePrint = () => {
    window.print();
  };

  const currentDateFormatted = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-ink/60 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-modal-title"
    >
      {/* Estilos dedicados para impressão em folha A4 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body {
            background: #fff !important;
            color: #000 !important;
            font-size: 11pt !important;
          }
          /* Esconde todo o layout do app */
          body * {
            visibility: hidden;
          }
          /* Exibe exclusivamente o mural */
          #printable-mural-area,
          #printable-mural-area * {
            visibility: visible;
          }
          #printable-mural-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            color: #000 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          .program-page-block {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 24px;
          }
        }
      `}</style>

      <div className="bg-surface w-full max-w-4xl rounded-surface border border-line shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Barra superior de controles na tela (Oculta na impressão) */}
        <div className="p-4 sm:p-5 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg/50 no-print">
          <div>
            <h2 id="print-modal-title" className="font-display font-bold text-lg text-ink flex items-center gap-2">
              <Printer size={20} className="text-primary" />
              Impressão de Escala para Mural (Folha A4)
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Formato limpo e profissional ideal para afixar no mural da congregação.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-primary text-white rounded-control text-xs sm:text-sm font-semibold hover:bg-primary-dark transition-all flex items-center gap-1.5 shadow-subtle min-h-touch"
            >
              <Printer size={16} weight="bold" />
              Imprimir Mural A4
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-ink-muted hover:text-ink rounded-control hover:bg-line/40 transition-colors"
              title="Fechar"
              aria-label="Fechar modal de impressão"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filtros de Impressão na tela (Oculta na impressão) */}
        <div className="p-4 bg-surface border-b border-line grid grid-cols-1 sm:grid-cols-2 gap-3 no-print text-xs">
          <div>
            <label className="font-semibold text-ink block mb-1">Escopo de impressão:</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScope('current')}
                className={`flex-1 py-1.5 px-3 rounded-control border text-center font-medium transition-all ${
                  scope === 'current'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-line text-ink-muted hover:text-ink'
                }`}
              >
                Apenas o culto selecionado
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`flex-1 py-1.5 px-3 rounded-control border text-center font-medium transition-all ${
                  scope === 'all'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-line text-ink-muted hover:text-ink'
                }`}
              >
                Todos os cultos cadastrados ({programs.length})
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="filter-dept-mural" className="font-semibold text-ink block mb-1">
              Filtrar ministério:
            </label>
            <select
              id="filter-dept-mural"
              aria-label="Filtrar ministério"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full py-1.5 px-3 rounded-control border border-line bg-surface text-ink text-xs focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="ALL">Todos os Ministérios / Departamentos</option>
              {allDepartments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Área Visual da Folha A4 (Preview na tela e área impressa real) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-line/20">
          <div
            id="printable-mural-area"
            className="bg-white text-gray-900 mx-auto max-w-[210mm] min-h-[297mm] p-6 sm:p-8 rounded-sm shadow-md border border-gray-200 print:border-none print:shadow-none print:p-0"
          >
            {/* Cabeçalho Institucional */}
            <div className="border-b-2 border-gray-900 pb-4 mb-6 flex items-start justify-between">
              <div>
                <span className="text-xs uppercase tracking-widest text-gray-500 font-bold block">
                  {churchName}
                </span>
                <h1 className="text-2xl font-bold font-serif text-gray-900 tracking-tight mt-0.5">
                  Escala Geral de Ministérios
                </h1>
                <p className="text-xs text-gray-600 mt-1">
                  Mural Oficial de Voluntários e Escalas
                </p>
              </div>

              <div className="text-right text-[11px] text-gray-500 font-mono">
                <span>Emitido em: {currentDateFormatted}</span>
              </div>
            </div>

            {/* Listagem de Programas e Cultos */}
            {filteredPrograms.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-12">
                Nenhum programa ou culto localizado para impressão.
              </p>
            ) : (
              <div className="space-y-6">
                {filteredPrograms.map((prog) => {
                  const slots = prog.slots.filter(
                    (s) => selectedDept === 'ALL' || s.departmentId === selectedDept
                  );

                  if (slots.length === 0) return null;

                  const progDate = new Date(prog.date);
                  const dateLabel = progDate.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  });

                  return (
                    <div key={prog.id} className="program-page-block border border-gray-300 rounded-sm overflow-hidden">
                      {/* Subcabeçalho do Culto */}
                      <div className="bg-gray-100 px-4 py-2.5 border-b border-gray-300 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-gray-900 text-sm tracking-wide uppercase">
                            {prog.title}
                          </span>
                          <span className="text-xs text-gray-600 ml-2 capitalize">
                            • {dateLabel}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-gray-600 font-mono">
                          {slots.length} vaga(s)
                        </span>
                      </div>

                      {/* Tabela de Voluntários */}
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-gray-300 bg-gray-50 text-gray-700 font-semibold">
                            <th className="py-2 px-3 w-28">Horário</th>
                            <th className="py-2 px-3 w-36">Ministério</th>
                            <th className="py-2 px-3 w-40">Função</th>
                            <th className="py-2 px-3">Voluntário(a) Escalado(a)</th>
                            <th className="py-2 px-3 w-28 text-center">Status</th>
                            <th className="py-2 px-3 w-24 text-center border-l border-gray-200">Visto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {slots.map((slot) => {
                            const startsAt = new Date(slot.startsAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            const endsAt = new Date(slot.endsAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });

                            const hasAssignment = slot.assignments.length > 0;

                            return (
                              <tr key={slot.id} className="hover:bg-gray-50/50">
                                <td className="py-2.5 px-3 font-mono text-[11px] text-gray-600 whitespace-nowrap">
                                  {startsAt} - {endsAt}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-gray-900">
                                  {slot.departmentName}
                                </td>
                                <td className="py-2.5 px-3 text-gray-700">
                                  {slot.functionName || slot.title}
                                </td>
                                <td className="py-2.5 px-3">
                                  {hasAssignment ? (
                                    <div className="space-y-1">
                                      {slot.assignments.map((asg) => (
                                        <div key={asg.id} className="font-semibold text-gray-900">
                                          {asg.userName}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-amber-700 font-semibold italic flex items-center gap-1">
                                      <Warning size={12} className="inline text-amber-600" />
                                      [ Vaga Aberta ]
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {hasAssignment ? (
                                    slot.assignments.some((a) => a.status === 'CONFIRMED') ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                                        <Check size={11} className="text-emerald-700" /> Confirmado
                                      </span>
                                    ) : (
                                      <span className="inline-block text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                        Pendente
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-block text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                                      Vago
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center border-l border-gray-200 text-gray-300">
                                  [ &nbsp; &nbsp; &nbsp; ]
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rodapé Institucional */}
            <div className="mt-8 pt-4 border-t border-gray-300 text-[11px] text-gray-500 flex items-center justify-between">
              <span>
                "Servi ao Senhor com alegria!" — Salmos 100:2
              </span>
              <span>
                Documento gerado pelo sistema Revezo
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
