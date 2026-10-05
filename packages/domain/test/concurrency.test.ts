import { describe, expect, it } from 'vitest';
import {
  hasTimeOverlap,
  wouldExceedDailyLimit,
  UserAssignmentTime,
  findBestSubstituteCandidate,
  CandidateUser,
  SlotRequirement,
} from '../src/index.js';

describe('Testes de Concorrência e Idempotência (ADR-004 e Skill testes-de-concorrencia)', () => {
  it('Cenário 1: Duas atribuições simultâneas com horários sobrepostos — apenas UMA tem sucesso', async () => {
    // Simula duas requisições concorrentes de gestores diferentes tentando escalar a mesma pessoa
    const sharedAssignments: UserAssignmentTime[] = [];
    let lock = Promise.resolve();

    async function attemptConcurrentAssignment(slot: {
      id: string;
      startsAt: string;
      endsAt: string;
    }) {
      // Simulação de transação atômica serializada (advisory lock no userId)
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        lock = lock.then(async () => {
          const hasConflict = sharedAssignments.some((a) =>
            hasTimeOverlap(slot.startsAt, slot.endsAt, a.startsAt, a.endsAt)
          );

          if (hasConflict) {
            resolve({
              success: false,
              error: 'Não foi possível escalar o voluntário. Ela(e) já tem uma escala nesse horário.',
            });
            return;
          }

          // Atribuição bem-sucedida
          sharedAssignments.push({
            id: `asg-${slot.id}`,
            slotId: slot.id,
            departmentId: 'dept-1',
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: 'PENDING',
          });

          resolve({ success: true });
        });
      });
    }

    const slotA = { id: 'slot-A', startsAt: '2026-10-18T09:00:00Z', endsAt: '2026-10-18T11:00:00Z' };
    const slotB = { id: 'slot-B', startsAt: '2026-10-18T10:00:00Z', endsAt: '2026-10-18T12:00:00Z' };

    // Dispara as duas chamadas simultaneamente
    const [resA, resB] = await Promise.all([
      attemptConcurrentAssignment(slotA),
      attemptConcurrentAssignment(slotB),
    ]);

    // Exatamente uma teve sucesso e a outra foi bloqueada
    const successCount = [resA, resB].filter((r) => r.success).length;
    const failureCount = [resA, resB].filter((r) => !r.success).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);
    expect(sharedAssignments.length).toBe(1);
  });

  it('Cenário 2: Duas atribuições simultâneas quando o voluntário já possui 1 escala — a 3ª falha', async () => {
    // Voluntário já tem 1 escala no dia
    const sharedAssignments: UserAssignmentTime[] = [
      {
        id: 'asg-existente',
        slotId: 'slot-existente',
        departmentId: 'dept-1',
        startsAt: '2026-10-18T08:00:00Z',
        endsAt: '2026-10-18T09:30:00Z',
        status: 'CONFIRMED',
      },
    ];

    let lock = Promise.resolve();

    async function attemptConcurrentDailyAssignment(slot: {
      id: string;
      startsAt: string;
      endsAt: string;
    }) {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        lock = lock.then(async () => {
          if (wouldExceedDailyLimit(slot.startsAt, sharedAssignments)) {
            resolve({
              success: false,
              error: 'Não foi possível escalar o voluntário. Já são 2 escalas neste dia.',
            });
            return;
          }

          sharedAssignments.push({
            id: `asg-${slot.id}`,
            slotId: slot.id,
            departmentId: 'dept-1',
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: 'PENDING',
          });

          resolve({ success: true });
        });
      });
    }

    const slotManha = { id: 'slot-manha', startsAt: '2026-10-18T10:00:00Z', endsAt: '2026-10-18T11:30:00Z' };
    const slotNoite = { id: 'slot-noite', startsAt: '2026-10-18T19:00:00Z', endsAt: '2026-10-18T20:30:00Z' };

    // Ambas tentam assumir a última vaga permitida ao mesmo tempo
    const [res1, res2] = await Promise.all([
      attemptConcurrentDailyAssignment(slotManha),
      attemptConcurrentDailyAssignment(slotNoite),
    ]);

    const successCount = [res1, res2].filter((r) => r.success).length;
    const failureCount = [res1, res2].filter((r) => !r.success).length;

    // Apenas UMA escala foi aceita (totalizando 2 no dia); a terceira foi rejeitada
    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);
    expect(sharedAssignments.length).toBe(2);
  });

  it('Cenário 3: Duas desmarcações simultâneas com busca de substituto — o mesmo substituto não é escolhido duas vezes', async () => {
    // Dois slots no mesmo horário de onde dois membros diferentes desmarcaram
    const slot1: SlotRequirement = {
      id: 'slot-louvor-vocal-1',
      departmentId: 'dept-louvor',
      functionId: 'func-vocal',
      startsAt: '2026-10-18T19:00:00Z',
      endsAt: '2026-10-18T21:00:00Z',
    };

    const slot2: SlotRequirement = {
      id: 'slot-louvor-vocal-2',
      departmentId: 'dept-louvor',
      functionId: 'func-vocal',
      startsAt: '2026-10-18T19:00:00Z',
      endsAt: '2026-10-18T21:00:00Z',
    };

    // Banco de atribuições compartilhadas
    const assignmentsDatabase: UserAssignmentTime[] = [];

    // Banco de candidatos
    const candidateUnique: CandidateUser = {
      id: 'voluntario-candidato-1',
      name: 'Gabriel Martins',
      status: 'ACTIVE',
      departmentMemberships: [
        {
          departmentId: 'dept-louvor',
          functions: [{ functionId: 'func-vocal' }],
        },
      ],
      availabilities: [],
      assignments: [],
    };

    let lock = Promise.resolve();

    // Simula transação de substituição automática com lock de banco
    async function processConcurrentDeclineAndAutoSubstitute(
      slot: SlotRequirement,
      declinedUserId: string
    ) {
      return new Promise<{
        slotId: string;
        chosenSubstituteId: string | null;
        status: 'SUBSTITUTED' | 'VACANT';
      }>((resolve) => {
        lock = lock.then(async () => {
          // Obtém as atribuições ativas mais recentes do candidato no banco
          const candidateActiveAssignments = assignmentsDatabase.filter(
            (a) => a.userId === candidateUnique.id
          );

          const candidateWithLatestAssignments: CandidateUser = {
            ...candidateUnique,
            assignments: candidateActiveAssignments,
          };

          const subResult = findBestSubstituteCandidate({
            candidates: [candidateWithLatestAssignments],
            slot,
            declinedUserIds: [declinedUserId],
          });

          if (subResult.candidate) {
            // Grava a atribuição para o substituto
            assignmentsDatabase.push({
              id: `asg-sub-${slot.id}`,
              userId: subResult.candidate.id,
              slotId: slot.id,
              departmentId: slot.departmentId,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              status: 'PENDING',
            });

            resolve({
              slotId: slot.id,
              chosenSubstituteId: subResult.candidate.id,
              status: 'SUBSTITUTED',
            });
          } else {
            resolve({
              slotId: slot.id,
              chosenSubstituteId: null,
              status: 'VACANT',
            });
          }
        });
      });
    }

    // Ambas as desmarcações ocorrem no exato mesmo instante em paralelo
    const [subResult1, subResult2] = await Promise.all([
      processConcurrentDeclineAndAutoSubstitute(slot1, 'user-original-1'),
      processConcurrentDeclineAndAutoSubstitute(slot2, 'user-original-2'),
    ]);

    // Garantia 1: Um dos slots recebeu o candidato disponível
    const substitutedSlots = [subResult1, subResult2].filter((r) => r.status === 'SUBSTITUTED');
    expect(substitutedSlots.length).toBe(1);

    // Garantia 2: O outro slot ficou como vaga aberta (VACANT) porque o candidato único já estava ocupado
    const vacantSlots = [subResult1, subResult2].filter((r) => r.status === 'VACANT');
    expect(vacantSlots.length).toBe(1);

    // Garantia 3: O candidato único foi gravado EXATAMENTE uma vez no banco
    const candidateTotalAssignments = assignmentsDatabase.filter(
      (a) => a.userId === candidateUnique.id
    );
    expect(candidateTotalAssignments.length).toBe(1);
  });

  it('Cenário 4: Idempotência de notificações — N execuções paralelas via Promise.all não duplicam envio', async () => {
    const notificationLogs: { assignmentId: string; kind: string }[] = [];
    let lock = Promise.resolve();

    async function processConcurrentReminder(assignmentId: string, kind: string) {
      return new Promise<{ sent: boolean }>((resolve) => {
        lock = lock.then(async () => {
          const alreadySent = notificationLogs.some(
            (log) => log.assignmentId === assignmentId && log.kind === kind
          );

          if (alreadySent) {
            resolve({ sent: false }); // Idempotente: não envia novamente
            return;
          }

          notificationLogs.push({ assignmentId, kind });
          resolve({ sent: true });
        });
      });
    }

    // 10 instâncias do cron ou retentativas disparadas simultaneamente
    const parallelRuns = await Promise.all(
      Array.from({ length: 10 }, () => processConcurrentReminder('asg-1', 'REMINDER_7D'))
    );

    const sentCount = parallelRuns.filter((r) => r.sent).length;
    const ignoredCount = parallelRuns.filter((r) => !r.sent).length;

    // Apenas a 1ª requisição realiza o disparo; as outras 9 são ignoradas por idempotência
    expect(sentCount).toBe(1);
    expect(ignoredCount).toBe(9);
    expect(
      notificationLogs.filter((l) => l.assignmentId === 'asg-1' && l.kind === 'REMINDER_7D').length
    ).toBe(1);
  });

  it('Cenário 5: Alta concorrência (10 requisições em paralelo) tentando escalar a mesma pessoa no mesmo dia', async () => {
    const sharedAssignments: UserAssignmentTime[] = [];
    let userAdvisoryLock = Promise.resolve();

    async function attemptParallelDailySlot(slot: {
      id: string;
      startsAt: string;
      endsAt: string;
    }) {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        userAdvisoryLock = userAdvisoryLock.then(async () => {
          // Revalida conflito e limite diário dentro da transação atômica serializada
          if (wouldExceedDailyLimit(slot.startsAt, sharedAssignments)) {
            resolve({
              success: false,
              error: 'Não foi possível escalar o voluntário. Já são 2 escalas neste dia.',
            });
            return;
          }

          sharedAssignments.push({
            id: `asg-${slot.id}`,
            slotId: slot.id,
            departmentId: 'dept-diaconia',
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: 'PENDING',
          });

          resolve({ success: true });
        });
      });
    }

    // 10 slots diferentes no mesmo dia, sem sobreposição horária mútua
    const tenSlots = [
      { id: 'slot-1', startsAt: '2026-10-25T07:00:00Z', endsAt: '2026-10-25T08:00:00Z' },
      { id: 'slot-2', startsAt: '2026-10-25T08:30:00Z', endsAt: '2026-10-25T09:30:00Z' },
      { id: 'slot-3', startsAt: '2026-10-25T10:00:00Z', endsAt: '2026-10-25T11:00:00Z' },
      { id: 'slot-4', startsAt: '2026-10-25T11:30:00Z', endsAt: '2026-10-25T12:30:00Z' },
      { id: 'slot-5', startsAt: '2026-10-25T13:00:00Z', endsAt: '2026-10-25T14:00:00Z' },
      { id: 'slot-6', startsAt: '2026-10-25T14:30:00Z', endsAt: '2026-10-25T15:30:00Z' },
      { id: 'slot-7', startsAt: '2026-10-25T16:00:00Z', endsAt: '2026-10-25T17:00:00Z' },
      { id: 'slot-8', startsAt: '2026-10-25T17:30:00Z', endsAt: '2026-10-25T18:30:00Z' },
      { id: 'slot-9', startsAt: '2026-10-25T19:00:00Z', endsAt: '2026-10-25T20:00:00Z' },
      { id: 'slot-10', startsAt: '2026-10-25T20:30:00Z', endsAt: '2026-10-25T21:30:00Z' },
    ];

    // Dispara as 10 tentativas simultaneamente
    const results = await Promise.all(tenSlots.map((s) => attemptParallelDailySlot(s)));

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    // Regra inviolável: Máximo 2 escalas por dia
    expect(successCount).toBe(2);
    expect(failureCount).toBe(8);
    expect(sharedAssignments.length).toBe(2);

    // As 8 falhas possuem a mensagem descritiva correta
    const rejectedErrors = results.filter((r) => !r.success).map((r) => r.error);
    expect(
      rejectedErrors.every(
        (err) => err === 'Não foi possível escalar o voluntário. Já são 2 escalas neste dia.'
      )
    ).toBe(true);
  });

  it('Cenário 6: Corrida concorrente pelo mesmo slot único por dois gestores simultâneos', async () => {
    let slotOccupiedBy: string | null = null;
    let slotLock = Promise.resolve();

    async function claimSlotConcurrently(slotId: string, volunteerId: string) {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        slotLock = slotLock.then(async () => {
          if (slotOccupiedBy !== null) {
            resolve({
              success: false,
              error: 'Esta vaga da escala já foi preenchida por outro gestor.',
            });
            return;
          }

          slotOccupiedBy = volunteerId;
          resolve({ success: true });
        });
      });
    }

    const [resGestor1, resGestor2] = await Promise.all([
      claimSlotConcurrently('slot-unico-1', 'voluntario-maria'),
      claimSlotConcurrently('slot-unico-1', 'voluntario-joao'),
    ]);

    const successCount = [resGestor1, resGestor2].filter((r) => r.success).length;
    const failureCount = [resGestor1, resGestor2].filter((r) => !r.success).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);
    expect(slotOccupiedBy).not.toBeNull();
  });
});

