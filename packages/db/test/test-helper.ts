import { prisma } from '../src/client.js';
import { hashPassword } from '@revezo/domain';

export const TEST_SECRET = 'teste-nao-usar-em-producao-000000000000000000';

export async function resetDatabase() {
  // Trunca todas as tabelas em cascata para garantir isolamento limpo entre execuções
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "AuditLog", 
      "SwapRequest", 
      "NotificationLog", 
      "PushSubscription", 
      "ActionToken", 
      "RefreshToken", 
      "Assignment", 
      "ProgramSlot", 
      "ProgramDepartment", 
      "Program", 
      "MemberFunction", 
      "DepartmentMember", 
      "DepartmentFunction", 
      "Department", 
      "PastorChurch", 
      "User", 
      "Church", 
      "ChurchSettings", 
      "FeatureFlag" 
    CASCADE;
  `);
}

let seedCounter = 1;

export function getNextDeterministicId(): number {
  return seedCounter++;
}

export async function createTestChurch(name = 'Igreja Central de Testes') {
  const seq = getNextDeterministicId();
  return await prisma.church.create({
    data: {
      name: `${name} ${seq}`,
      slug: `igreja-teste-${seq}`,
      primaryColor: '#0F4C5C',
      secondaryColor: '#F2B632',
      phone: '+556230009999',
    },
  });
}

export async function createTestUser(params: {
  churchId?: string;
  name?: string;
  email?: string;
  globalRole?: 'ADMIN_MASTER' | 'PASTOR' | 'ELDER' | 'USER';
  status?: 'ACTIVE' | 'PENDING' | 'REJECTED' | 'INACTIVE';
  phonePrimary?: string;
}) {
  const seq = getNextDeterministicId();
  const passwordHash = hashPassword('Teste123!Forte');

  return await prisma.user.create({
    data: {
      name: params.name || `Voluntario Teste ${seq}`,
      email: params.email || `voluntario.${seq}@igreja.local`,
      passwordHash,
      churchId: params.churchId,
      globalRole: params.globalRole || 'USER',
      status: params.status || 'ACTIVE',
      phonePrimary: params.phonePrimary || `+556298888${String(seq).padStart(4, '0')}`,
      preferredChannel: 'WHATSAPP',
      termsAcceptedAt: new Date('2026-01-01T12:00:00Z'),
      termsVersion: 'v1.0',
    },
  });
}

export async function createTestDepartment(churchId: string, name = 'Louvor') {
  const seq = getNextDeterministicId();
  return await prisma.department.create({
    data: {
      churchId,
      name: `${name} ${seq}`,
    },
  });
}

export async function createTestProgramWithSlot(params: {
  churchId: string;
  departmentId: string;
  title?: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const seq = getNextDeterministicId();
  const program = await prisma.program.create({
    data: {
      churchId: params.churchId,
      title: params.title || `Culto de Teste ${seq}`,
      date: params.startsAt,
      departments: {
        create: {
          departmentId: params.departmentId,
        },
      },
      slots: {
        create: {
          departmentId: params.departmentId,
          title: `Slot Escala ${seq}`,
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          requiredCount: 1,
        },
      },
    },
    include: {
      slots: true,
    },
  });

  return {
    program,
    slot: program.slots[0],
  };
}
