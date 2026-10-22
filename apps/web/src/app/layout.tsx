import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Public_Sans } from 'next/font/google';
import './globals.css';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, clearSession, getActiveChurchContext } from '@/lib/auth-service';
import { getAuthorizedMenuItems, getMobileNavigation, MenuBadgeCounts } from '@revezo/domain';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { PwaRegister } from '@/components/PwaRegister';
import { CapacitorInit } from '@/components/CapacitorInit';
import { InstallPwaBanner } from '@/components/InstallPwaBanner';
import { ShieldCheck } from '@/components/Icons';
import { redirect } from 'next/navigation';

const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const fontBody = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Revezo',
  description: 'Sistema web de escalas de departamentos para igrejas',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Escala',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/logo-icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F4C5C',
};

async function logoutAction() {
  'use server';
  await clearSession();
  redirect('/login');
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 1. Contexto de congregação ativa e configurações visuais
  const churchContext = await getActiveChurchContext();
  const currentChurch = churchContext.church;
  const churchName = currentChurch?.name || 'Revezo';
  const primaryColor = currentChurch?.primaryColor || '#0F4C5C';
  const secondaryColor = currentChurch?.secondaryColor || '#F59E0B';

  // 2. Contexto de usuário autenticado
  const session = await getSession();
  const userContext = await getCurrentUserContext();

  const authorizedItems = userContext ? getAuthorizedMenuItems(userContext) : [];
  const { bottomBar, moreSheet } = userContext ? getMobileNavigation(userContext) : { bottomBar: [], moreSheet: [] };

  // 3. Contadores de Badges
  const badgeCounts: MenuBadgeCounts = {
    pendingApprovals: 0,
    openSlots: 0,
    unconfirmed: 0,
  };

  if (session && userContext) {
    try {
      const isManagerOrAdmin =
        userContext.globalRole === 'ADMIN_MASTER' ||
        userContext.globalRole === 'PASTOR' ||
        userContext.globalRole === 'ELDER' ||
        userContext.departmentMemberships.some((m) => m.role === 'MANAGER');

      const managedDeptIds =
        userContext.globalRole === 'ADMIN_MASTER' || userContext.globalRole === 'PASTOR' || userContext.globalRole === 'ELDER'
          ? undefined
          : userContext.departmentMemberships
              .filter((m) => m.role === 'MANAGER')
              .map((m) => m.departmentId);

      // Filtra cadastros pendentes da congregação ativa
      const pendingWhere =
        userContext.globalRole === 'ADMIN_MASTER'
          ? { status: 'PENDING' as const }
          : currentChurch?.id
          ? { status: 'PENDING' as const, churchId: currentChurch.id }
          : { status: 'PENDING' as const };

      const [pendingApprovals, futureSlots, unconfirmed] = await Promise.all([
        isManagerOrAdmin
          ? prisma.user.count({ where: pendingWhere })
          : Promise.resolve(0),
        isManagerOrAdmin
          ? prisma.programSlot.findMany({
              where: {
                startsAt: { gte: new Date() },
                ...(managedDeptIds ? { departmentId: { in: managedDeptIds } } : {}),
                ...(currentChurch?.id ? { program: { churchId: currentChurch.id } } : {}),
              },
              select: {
                requiredCount: true,
                _count: {
                  select: {
                    assignments: {
                      where: { status: { in: ['PENDING', 'CONFIRMED'] } },
                    },
                  },
                },
              },
            })
          : Promise.resolve([]),
        prisma.assignment.count({
          where: {
            userId: session.userId,
            status: 'PENDING',
          },
        }),
      ]);

      badgeCounts.pendingApprovals = pendingApprovals;
      badgeCounts.openSlots = futureSlots.filter(
        (s) => s._count.assignments < s.requiredCount
      ).length;
      badgeCounts.unconfirmed = unconfirmed;
    } catch {
      // Ignora erro de consulta em caso de falha de conexão inicial
    }
  }

  return (
    <html
      lang="pt-BR"
      className={`${fontDisplay.variable} ${fontBody.variable}`}
      style={
        {
          '--color-primary': primaryColor,
          '--color-secondary': secondaryColor,
        } as React.CSSProperties
      }
    >
      <body className={`${fontBody.className} min-h-screen flex flex-col bg-bg text-ink font-body antialiased`}>
        {session && (
          <Navbar
            churchName={churchName}
            currentChurch={currentChurch}
            availableChurches={churchContext.availableChurches}
            canSwitchChurch={churchContext.canSwitchChurch}
            userName={session.name}
            userRole={
              userContext?.departmentMemberships.some((m) => m.role === 'MANAGER')
                ? 'MANAGER'
                : userContext?.globalRole || session.globalRole
            }
            items={authorizedItems}
            badgeCounts={badgeCounts}
            onLogout={logoutAction}
          />
        )}

        <div className={`flex-1 flex flex-col ${session ? 'md:pl-64' : ''}`}>
          <main className={`flex-1 p-4 sm:p-6 lg:p-8 ${session ? 'pb-24 md:pb-8' : ''}`}>
            <div className="max-w-6xl mx-auto">
              <PwaRegister />
              <CapacitorInit />
              <InstallPwaBanner />
              {session && session.globalRole === 'ADMIN_MASTER' && !session.mfaEnabled && (
                <div className="mb-6 p-4 bg-danger-soft border border-danger/40 rounded-control flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-start space-x-3">
                    <ShieldCheck size={28} weight="fill" className="text-danger flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-danger-ink">Ação de Segurança Obrigatória</h4>
                      <p className="text-xs text-danger-ink">
                        Como Administrador Geral, a ativação da autenticação em duas etapas (2FA) é mandatória para a proteção do sistema.
                      </p>
                    </div>
                  </div>
                  <a
                    href="/perfil"
                    className="px-4 py-2 bg-danger text-white font-semibold text-xs rounded-control hover:opacity-95 whitespace-nowrap self-start sm:self-auto min-h-touch inline-flex items-center justify-center"
                  >
                    Ativar 2FA no Perfil →
                  </a>
                </div>
              )}
              {children}
            </div>
          </main>
        </div>

        {session && bottomBar.length > 0 && (
          <MobileBottomNav
            primaryItems={bottomBar}
            moreItems={moreSheet}
            badgeCounts={badgeCounts}
            onLogout={logoutAction}
          />
        )}
      </body>
    </html>
  );
}
