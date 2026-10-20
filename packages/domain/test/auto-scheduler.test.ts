import { describe, expect, it } from 'vitest';
import {
  generateProgramSchedule,
  AutoScheduleSlotInput,
  CandidateWithHistory,
} from '../src/index.js';

describe('Motor de Escala: Geração Automática (generateProgramSchedule)', () => {
  const baseSlot: AutoScheduleSlotInput = {
    id: 'slot-1',
    title: 'Louvor - Vocal',
    departmentId: 'dept-louvor',
    functionId: 'func-vocal',
    startsAt: '2026-10-18T09:00:00Z',
    endsAt: '2026-10-18T10:30:00Z',
    requiredCount: 1,
    currentAssignments: [],
  };

  const volunteerA: CandidateWithHistory = {
    id: 'user-a',
    name: 'Ana Silva',
    status: 'ACTIVE',
    departmentMemberships: [
      {
        departmentId: 'dept-louvor',
        functions: [{ functionId: 'func-vocal' }],
      },
    ],
    assignments: [],
    assignmentsLast60Days: 5,
    lastAssignmentDate: new Date('2026-10-10T09:00:00Z'),
  };

  const volunteerB: CandidateWithHistory = {
    id: 'user-b',
    name: 'Bernardo Souza',
    status: 'ACTIVE',
    departmentMemberships: [
      {
        departmentId: 'dept-louvor',
        functions: [{ functionId: 'func-vocal' }],
      },
    ],
    assignments: [],
    assignmentsLast60Days: 1, // Serviu menos recentemente -> Deve ter prioridade
    lastAssignmentDate: new Date('2026-09-15T09:00:00Z'),
  };

  it('preenche slot escolhendo o voluntário com menor carga recente pelo algoritmo de justiça', () => {
    const result = generateProgramSchedule({
      slots: [baseSlot],
      candidates: [volunteerA, volunteerB],
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.candidate.id).toBe('user-b');
    expect(result.proposals[0]?.candidate.name).toBe('Bernardo Souza');
    expect(result.proposals[0]?.candidate.assignmentsLast60Days).toBe(1);
    expect(result.proposals[0]?.reason).toBe('1 escala(s) nos últimos 60 dias');
    expect(result.unfilledSlots).toHaveLength(0);
    expect(result.totalSlotsEvaluated).toBe(1);
    expect(result.totalFilled).toBe(1);
  });

  it('atribui mensagem de alta prioridade de rodízio quando o voluntário tem 0 escalas nos últimos 60 dias', () => {
    const volunteerZero: CandidateWithHistory = {
      id: 'user-zero',
      name: 'Zero Escalas',
      status: 'ACTIVE',
      departmentMemberships: [
        {
          departmentId: 'dept-louvor',
          functions: [{ functionId: 'func-vocal' }],
        },
      ],
      assignmentsLast60Days: 0,
    };

    const result = generateProgramSchedule({
      slots: [baseSlot],
      candidates: [volunteerZero],
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.reason).toBe(
      'Nenhuma escala nos últimos 60 dias (alta prioridade de rodízio)'
    );
    expect(result.proposals[0]?.candidate.assignmentsLast60Days).toBe(0);
  });

  it('ordena os slots cronologicamente antes de preencher e atualiza carga e data em múltiplos slots', () => {
    const slotTarde: AutoScheduleSlotInput = {
      ...baseSlot,
      id: 'slot-tarde',
      title: 'Louvor Tarde',
      startsAt: '2026-10-18T15:00:00Z',
      endsAt: '2026-10-18T16:30:00Z',
    };
    const slotManha: AutoScheduleSlotInput = {
      ...baseSlot,
      id: 'slot-manha',
      title: 'Louvor Manhã',
      startsAt: '2026-10-18T09:00:00Z',
      endsAt: '2026-10-18T10:30:00Z',
    };

    const candA: CandidateWithHistory = {
      ...volunteerA,
      id: 'user-a',
      assignmentsLast60Days: 0,
      lastAssignmentDate: null,
    };
    const candB: CandidateWithHistory = {
      ...volunteerB,
      id: 'user-b',
      assignmentsLast60Days: 0,
      lastAssignmentDate: null,
    };

    const result = generateProgramSchedule({
      slots: [slotTarde, slotManha],
      candidates: [candA, candB],
    });

    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0]?.slotId).toBe('slot-manha');
    expect(result.proposals[0]?.candidate.id).toBe('user-a');
    expect(result.proposals[0]?.reason).toBe(
      'Nenhuma escala nos últimos 60 dias (alta prioridade de rodízio)'
    );

    expect(result.proposals[1]?.slotId).toBe('slot-tarde');
    expect(result.proposals[1]?.candidate.id).toBe('user-b');
  });

  it('preenche múltiplas vagas no mesmo slot sem repetir a mesma pessoa e registra vagas faltantes (missingCount)', () => {
    const multiSlot: AutoScheduleSlotInput = {
      ...baseSlot,
      id: 'slot-multi',
      requiredCount: 3,
      currentAssignments: [{ userId: 'user-a' }],
    };

    const result = generateProgramSchedule({
      slots: [multiSlot],
      candidates: [volunteerA, volunteerB],
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.candidate.id).toBe('user-b');
    expect(result.totalFilled).toBe(1);
    expect(result.unfilledSlots).toHaveLength(1);
    expect(result.unfilledSlots[0]?.missingCount).toBe(1);
    expect(result.unfilledSlots[0]?.diagnosis).toContain('recusou');
  });

  it('considera escalas já existentes (c.assignments) do candidato antes de iniciar a geração', () => {
    const candidateWithExistingConflict: CandidateWithHistory = {
      ...volunteerB,
      assignmentsLast60Days: 0,
      assignments: [
        {
          id: 'existing-asg-1',
          startsAt: '2026-10-18T09:00:00Z',
          endsAt: '2026-10-18T10:30:00Z',
          status: 'CONFIRMED',
        },
      ],
    };

    const result = generateProgramSchedule({
      slots: [baseSlot],
      candidates: [candidateWithExistingConflict],
    });

    expect(result.proposals).toHaveLength(0);
    expect(result.unfilledSlots).toHaveLength(1);
    expect(result.unfilledSlots[0]?.diagnosis).toContain('conflito de horário');
  });

  it('respeita o teto diário de no máximo 2 escalas por pessoa em simulação de múltiplos slots no mesmo dia', () => {
    // 3 slots no mesmo dia: 08:00-09:30, 10:00-11:30, 18:00-19:30
    const slot1: AutoScheduleSlotInput = {
      ...baseSlot,
      id: 'slot-manha-1',
      startsAt: '2026-10-18T08:00:00Z',
      endsAt: '2026-10-18T09:30:00Z',
    };
    const slot2: AutoScheduleSlotInput = {
      ...baseSlot,
      id: 'slot-manha-2',
      startsAt: '2026-10-18T10:00:00Z',
      endsAt: '2026-10-18T11:30:00Z',
    };
    const slot3: AutoScheduleSlotInput = {
      ...baseSlot,
      id: 'slot-noite',
      startsAt: '2026-10-18T18:00:00Z',
      endsAt: '2026-10-18T19:30:00Z',
    };

    // Apenas Bernardo cadastrado
    const singleVolunteer = { ...volunteerB, assignmentsLast60Days: 0 };

    const result = generateProgramSchedule({
      slots: [slot1, slot2, slot3],
      candidates: [singleVolunteer],
    });

    // Deve preencher exatamente 2 slots (teto diário máximo) e deixar o 3º slot aberto
    expect(result.proposals).toHaveLength(2);
    expect(result.unfilledSlots).toHaveLength(1);
    expect(result.unfilledSlots[0]?.slotId).toBe('slot-noite');
    expect(result.unfilledSlots[0]?.diagnosis).toContain('limite diário de 2 escalas');
  });

  it('evita conflito de horário sobreposto e não escala a mesma pessoa ao mesmo tempo', () => {
    const slotConcorrente1: AutoScheduleSlotInput = {
      ...baseSlot,
      id: 'slot-1',
      startsAt: '2026-10-18T09:00:00Z',
      endsAt: '2026-10-18T11:00:00Z',
    };
    const slotConcorrente2: AutoScheduleSlotInput = {
      ...baseSlot,
      id: 'slot-2',
      startsAt: '2026-10-18T10:00:00Z', // Sobrepõe slot-1
      endsAt: '2026-10-18T12:00:00Z',
    };

    const singleVolunteer = { ...volunteerB, assignmentsLast60Days: 0 };

    const result = generateProgramSchedule({
      slots: [slotConcorrente1, slotConcorrente2],
      candidates: [singleVolunteer],
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.unfilledSlots).toHaveLength(1);
    expect(result.unfilledSlots[0]?.diagnosis).toContain('conflito de horário');
  });

  it('não altera nem sobrescreve slots que já estão com a quantidade necessária preenchida', () => {
    const fullSlot: AutoScheduleSlotInput = {
      ...baseSlot,
      requiredCount: 1,
      currentAssignments: [{ userId: 'user-a' }],
    };

    const result = generateProgramSchedule({
      slots: [fullSlot],
      candidates: [volunteerA, volunteerB],
    });

    expect(result.proposals).toHaveLength(0);
    expect(result.unfilledSlots).toHaveLength(0);
    expect(result.totalFilled).toBe(0);
  });
});
