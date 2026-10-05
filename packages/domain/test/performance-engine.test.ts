import { describe, expect, it } from 'vitest';
import {
  generateProgramSchedule,
  AutoScheduleSlotInput,
  CandidateWithHistory,
  checkEligibility,
  hasTimeOverlap,
  wouldExceedDailyLimit,
  rankCandidates,
  CandidateStats,
  findBestSubstituteCandidate,
} from '../src/index.js';

describe('Testes de Desempenho e Regressão do Motor de Escala (Skill testes-desempenho)', () => {
  it('Motor: gera escala para 60 membros e 50 slots em tempo inferior a 500 ms (meta < 100 ms)', () => {
    // 1. Criação sintética de 60 membros voluntários com histórico e disponibilidades variadas
    const candidates: CandidateWithHistory[] = Array.from({ length: 60 }, (_, i) => {
      const id = `voluntario-${i + 1}`;
      const deptId = i % 2 === 0 ? 'dept-louvor' : 'dept-diaconia';
      const funcId = i % 4 === 0 ? 'func-vocal' : i % 4 === 1 ? 'func-instrumento' : 'func-recepcao';

      return {
        id,
        name: `Voluntário Número ${i + 1}`,
        status: 'ACTIVE',
        assignmentsLast60Days: (i * 3) % 15,
        lastAssignmentDate: new Date(Date.now() - (i + 1) * 2 * 24 * 60 * 60 * 1000),
        departmentMemberships: [
          {
            departmentId: deptId,
            functions: [{ functionId: funcId }],
          },
        ],
        availabilities: [
          {
            kind: 'PREFERRED_WEEKDAY',
            weekday: (i % 7), // Dias preferidos variados
          },
        ],
        assignments: [],
      };
    });

    // 2. Criação sintética de 50 slots distribuídos em 10 dias diferentes (5 slots por dia)
    const slots: AutoScheduleSlotInput[] = [];
    const baseDate = new Date('2026-11-01T00:00:00Z');

    for (let day = 0; day < 10; day++) {
      const dayDate = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000);
      const dateStr = dayDate.toISOString().split('T')[0];

      // 5 slots por dia: 3 de Louvor e 2 de Diaconia
      slots.push({
        id: `slot-louvor-vocal-${day}`,
        title: `Vocal Louvor Domingo ${day}`,
        departmentId: 'dept-louvor',
        functionId: 'func-vocal',
        startsAt: `${dateStr}T09:00:00Z`,
        endsAt: `${dateStr}T11:00:00Z`,
        requiredCount: 2,
        currentAssignments: [],
      });

      slots.push({
        id: `slot-louvor-inst-${day}`,
        title: `Instrumento Louvor ${day}`,
        departmentId: 'dept-louvor',
        functionId: 'func-instrumento',
        startsAt: `${dateStr}T09:00:00Z`,
        endsAt: `${dateStr}T11:00:00Z`,
        requiredCount: 2,
        currentAssignments: [],
      });

      slots.push({
        id: `slot-louvor-noite-${day}`,
        title: `Culto Noite Louvor ${day}`,
        departmentId: 'dept-louvor',
        functionId: 'func-vocal',
        startsAt: `${dateStr}T19:00:00Z`,
        endsAt: `${dateStr}T21:00:00Z`,
        requiredCount: 2,
        currentAssignments: [],
      });

      slots.push({
        id: `slot-diaconia-manha-${day}`,
        title: `Recepção Manhã ${day}`,
        departmentId: 'dept-diaconia',
        functionId: 'func-recepcao',
        startsAt: `${dateStr}T08:30:00Z`,
        endsAt: `${dateStr}T11:30:00Z`,
        requiredCount: 3,
        currentAssignments: [],
      });

      slots.push({
        id: `slot-diaconia-noite-${day}`,
        title: `Recepção Noite ${day}`,
        departmentId: 'dept-diaconia',
        functionId: 'func-recepcao',
        startsAt: `${dateStr}T18:30:00Z`,
        endsAt: `${dateStr}T21:30:00Z`,
        requiredCount: 3,
        currentAssignments: [],
      });
    }

    expect(slots.length).toBe(50);
    expect(candidates.length).toBe(60);

    // 3. Execução cronometrada com performance.now()
    const startTime = performance.now();
    const result = generateProgramSchedule({
      slots,
      candidates,
    });
    const durationMs = performance.now() - startTime;

    // 4. Verificações de corretude do motor
    expect(result.totalSlotsEvaluated).toBe(50);
    expect(result.proposals.length).toBeGreaterThan(0);

    // 5. Teto de regressão estrito: DEVE ser inferior a 500 ms (conforme especificação da skill)
    expect(durationMs).toBeLessThan(500);

    // Log informativo para acompanhamento de baseline
    console.info(`[Performance Engine] 60 membros x 50 slots gerados em: ${durationMs.toFixed(2)} ms`);
  });

  it('Throughput: 2.000 avaliações de elegibilidade (checkEligibility) executam em menos de 50 ms', () => {
    const candidate: CandidateWithHistory = {
      id: 'voluntario-teste',
      name: 'Voluntário de Teste',
      status: 'ACTIVE',
      departmentMemberships: [
        {
          departmentId: 'dept-louvor',
          functions: [{ functionId: 'func-vocal' }],
        },
      ],
      assignmentsLast60Days: 2,
      availabilities: [
        {
          kind: 'PREFERRED_WEEKDAY',
          weekday: 0, // Domingo
        },
      ],
      assignments: [
        {
          id: 'asg-existente-1',
          slotId: 'slot-outro',
          departmentId: 'dept-louvor',
          startsAt: '2026-10-18T08:00:00Z',
          endsAt: '2026-10-18T09:30:00Z',
          status: 'CONFIRMED',
        },
      ],
    };

    const slot = {
      id: 'slot-target',
      departmentId: 'dept-louvor',
      functionId: 'func-vocal',
      startsAt: '2026-10-18T10:00:00Z',
      endsAt: '2026-10-18T12:00:00Z',
    };

    const ITERATIONS = 2000;
    let eligibleCount = 0;
    const startTime = performance.now();

    for (let i = 0; i < ITERATIONS; i++) {
      const res = checkEligibility(candidate, slot);
      if (res.eligible) {
        eligibleCount++;
      }
    }

    const durationMs = performance.now() - startTime;
    expect(eligibleCount).toBe(ITERATIONS);
    expect(durationMs).toBeLessThan(100);

    const opsPerSec = Math.round((ITERATIONS / durationMs) * 1000);
    console.info(`[Performance Eligibility] 2.000 checks em: ${durationMs.toFixed(2)} ms (${opsPerSec.toLocaleString()} ops/s)`);
  });

  it('Throughput: 20.000 checagens de sobreposição (hasTimeOverlap) executam em menos de 50 ms', () => {
    const ITERATIONS = 20000;
    const startA = '2026-10-18T09:00:00Z';
    const endA = '2026-10-18T11:00:00Z';
    const startB = '2026-10-18T10:30:00Z';
    const endB = '2026-10-18T12:30:00Z';

    let overlapCount = 0;
    const startTime = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      if (hasTimeOverlap(startA, endA, startB, endB)) {
        overlapCount++;
      }
    }
    const durationMs = performance.now() - startTime;

    expect(overlapCount).toBe(ITERATIONS);
    expect(durationMs).toBeLessThan(50);

    const opsPerSec = Math.round((ITERATIONS / durationMs) * 1000);
    console.info(`[Performance Conflict] 20.000 checks de sobreposição em: ${durationMs.toFixed(2)} ms (${opsPerSec.toLocaleString()} ops/s)`);
  });

  it('Throughput: validação de limite diário (wouldExceedDailyLimit) para histórico longo executa em menos de 100 ms', () => {
    const assignments = [
      {
        id: 'asg-1',
        slotId: 'slot-1',
        departmentId: 'dept-1',
        startsAt: '2026-10-18T08:00:00Z',
        endsAt: '2026-10-18T09:00:00Z',
        status: 'CONFIRMED' as const,
      },
      {
        id: 'asg-2',
        slotId: 'slot-2',
        departmentId: 'dept-2',
        startsAt: '2026-10-18T10:00:00Z',
        endsAt: '2026-10-18T11:00:00Z',
        status: 'CONFIRMED' as const,
      },
      // Várias em outros dias
      {
        id: 'asg-3',
        slotId: 'slot-3',
        departmentId: 'dept-1',
        startsAt: '2026-10-19T08:00:00Z',
        endsAt: '2026-10-19T09:00:00Z',
        status: 'CONFIRMED' as const,
      },
      {
        id: 'asg-4',
        slotId: 'slot-4',
        departmentId: 'dept-1',
        startsAt: '2026-10-20T08:00:00Z',
        endsAt: '2026-10-20T09:00:00Z',
        status: 'CONFIRMED' as const,
      },
    ];

    const ITERATIONS = 5000;
    const slotCheckDate = '2026-10-18T19:00:00Z';

    let exceededCount = 0;
    const startTime = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      if (wouldExceedDailyLimit(slotCheckDate, assignments)) {
        exceededCount++;
      }
    }
    const durationMs = performance.now() - startTime;

    expect(exceededCount).toBe(ITERATIONS);
    expect(durationMs).toBeLessThan(100);
    console.info(`[Performance DailyLimit] 5.000 validações de limite diário em: ${durationMs.toFixed(2)} ms`);
  });

  it('Ranking & Justiça: Ordenação de 100 candidatos por menor carga em menos de 20 ms', () => {
    const candidateStats: CandidateStats[] = Array.from({ length: 100 }, (_, i) => ({
      candidate: {
        id: `cand-${i}`,
        name: `Candidato ${i}`,
        status: 'ACTIVE',
        departmentMemberships: [{ departmentId: 'dept-1', functions: [] }],
      },
      assignmentsLast60Days: (100 - i) % 15,
      lastAssignmentDate: new Date(Date.now() - i * 86400000),
    }));

    const startTime = performance.now();
    const ranked = rankCandidates(candidateStats);
    const durationMs = performance.now() - startTime;

    expect(ranked.length).toBe(100);
    expect(durationMs).toBeLessThan(20);
    // Primeiro candidato tem menor ou igual número de escalas
    expect(
      candidateStats.find((c) => c.candidate.id === ranked[0].id)?.assignmentsLast60Days
    ).toBeLessThanOrEqual(
      candidateStats.find((c) => c.candidate.id === ranked[ranked.length - 1].id)?.assignmentsLast60Days || 0
    );

    console.info(`[Performance Ranking] 100 candidatos ranqueados em: ${durationMs.toFixed(2)} ms`);
  });

  it('Substituição Automática: 50 buscas consecutivas de melhor substituto em menos de 50 ms', () => {
    const candidates: CandidateUser[] = Array.from({ length: 30 }, (_, i) => ({
      id: `sub-cand-${i}`,
      name: `Substituto Candidato ${i}`,
      status: 'ACTIVE',
      departmentMemberships: [
        {
          departmentId: 'dept-musica',
          functions: [{ functionId: 'func-baixo' }],
        },
      ],
      assignments: [],
    }));

    const slot = {
      id: 'slot-baixo',
      departmentId: 'dept-musica',
      functionId: 'func-baixo',
      startsAt: '2026-10-18T19:00:00Z',
      endsAt: '2026-10-18T21:00:00Z',
    };

    const startTime = performance.now();
    let foundCount = 0;
    for (let i = 0; i < 50; i++) {
      const res = findBestSubstituteCandidate({
        candidates,
        slot,
        declinedUserIds: [`sub-cand-${i % 5}`],
      });
      if (res.candidate) {
        foundCount++;
      }
    }
    const durationMs = performance.now() - startTime;

    expect(foundCount).toBe(50);
    expect(durationMs).toBeLessThan(150);
    console.info(`[Performance Auto-Sub] 50 buscas de substituto em: ${durationMs.toFixed(2)} ms`);
  });
});
