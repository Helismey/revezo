import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const FORBIDDEN_AUDIT_ACTIONS = new Set([
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

function createProtectedAuditModel(modelDelegate: any) {
  return new Proxy(modelDelegate, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && FORBIDDEN_AUDIT_ACTIONS.has(prop)) {
        return async () => {
          throw new Error(
            `AuditLog é somente-inserção (Regra 19). A ação '${prop}' é estritamente proibida.`
          );
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function wrapClientWithAuditGuard<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'auditLog') {
        const delegate = Reflect.get(target, prop, receiver);
        return createProtectedAuditModel(delegate);
      }
      if (prop === '$transaction') {
        const origTx = Reflect.get(target, prop, receiver) as Function;
        return async function (arg: any, ...rest: any[]) {
          if (typeof arg === 'function') {
            return origTx.call(
              target,
              async (txClient: any) => arg(wrapClientWithAuditGuard(txClient)),
              ...rest
            );
          }
          return origTx.call(target, arg, ...rest);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function createPrismaClient(): PrismaClient {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  return wrapClientWithAuditGuard(baseClient) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Mantém o singleton em globalThis inclusive em lambdas serverless aquecidas (prevenindo exaustão de pool de conexões)
globalForPrisma.prisma = prisma;

