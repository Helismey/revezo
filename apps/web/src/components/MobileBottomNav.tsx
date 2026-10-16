'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuItem, MenuBadgeCounts } from '@revezo/domain';
import { isCapacitorNative, removeSecureToken } from '@/lib/capacitor-adapter';
import { clearClientUserCache } from './PwaRegister';
import {
  House,
  CalendarCheck,
  ListChecks,
  UsersThree,
  ListBullets,
  SquaresFour,
  UserCheck,
  Gear,
  ClipboardText,
  UserCircle,
  DotsThree,
  SignOut,
  Warning,
  PaperPlaneTilt,
  ArrowsLeftRight,
  ChartBar,
  type IconProps,
} from './Icons';

const ICON_MAP: Record<string, React.ComponentType<IconProps>> = {
  House,
  CalendarCheck,
  ListChecks,
  UsersThree,
  ListBullets,
  SquaresFour,
  UserCheck,
  Gear,
  ClipboardText,
  UserCircle,
  Warning,
  PaperPlaneTilt,
  ArrowsLeftRight,
  ChartBar,
};

interface MobileBottomNavProps {
  primaryItems: MenuItem[];
  moreItems: MenuItem[];
  badgeCounts: MenuBadgeCounts;
  onLogout: () => Promise<void>;
}

export function MobileBottomNav({ primaryItems, moreItems, badgeCounts, onLogout }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const getBadgeValue = (badgeKind?: string): number | undefined => {
    if (badgeKind === 'pending-approvals') return badgeCounts.pendingApprovals;
    if (badgeKind === 'open-slots') return badgeCounts.openSlots;
    if (badgeKind === 'unconfirmed') return badgeCounts.unconfirmed;
    return undefined;
  };

  const moreBadgeSum = moreItems.reduce((acc, item) => {
    const val = getBadgeValue(item.badge);
    return acc + (val ?? 0);
  }, 0);

  return (
    <>
      {/* Barra de navegação inferior (apenas mobile) */}
      <nav
        aria-label="Navegação móvel principal"
        className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-line flex items-center justify-around z-40 px-2"
      >
        {primaryItems.map((item) => {
          const active = pathname === item.href;
          const IconComponent = ICON_MAP[item.icon] ?? House;
          const badge = getBadgeValue(item.badge);

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center flex-1 h-full min-h-touch relative ${
                active ? 'text-primary font-bold' : 'text-ink-muted'
              }`}
            >
              <div className="relative">
                <IconComponent
                  size={24}
                  weight={active ? 'fill' : 'regular'}
                  className="w-6 h-6"
                />
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 bg-warning text-ink text-[10px] font-bold rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 leading-none">{item.label}</span>
              {active && <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full" />}
            </Link>
          );
        })}

        {/* Botão Mais */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 h-full min-h-touch relative ${
            sheetOpen ? 'text-primary font-bold' : 'text-ink-muted'
          }`}
          aria-expanded={sheetOpen}
          aria-label="Mais opções de menu"
        >
          <div className="relative">
            <DotsThree size={24} weight={sheetOpen ? 'fill' : 'regular'} className="w-6 h-6" />
            {moreBadgeSum > 0 && (
              <span className="absolute -top-1 -right-2 w-4 h-4 bg-warning text-ink text-[10px] font-bold rounded-full flex items-center justify-center">
                {moreBadgeSum}
              </span>
            )}
          </div>
          <span className="text-[11px] mt-1 leading-none">Mais</span>
        </button>
      </nav>

      {/* Folha inferior (Bottom Sheet) com opções adicionais */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Overlay escuro */}
          <div
            className="fixed inset-0 bg-ink/40 transition-opacity"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />

          {/* Conteúdo da folha */}
          <div className="relative bg-surface rounded-t-surface p-5 border-t border-line shadow-2xl max-h-[80vh] overflow-y-auto z-10">
            <div className="w-12 h-1.5 bg-line rounded-full mx-auto mb-4" />

            <h3 className="font-display font-bold text-base text-ink mb-3 px-2">Opções adicionais</h3>

            <div className="space-y-1">
              {moreItems.map((item) => {
                const active = pathname === item.href;
                const IconComponent = ICON_MAP[item.icon] ?? House;
                const badge = getBadgeValue(item.badge);

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={`flex items-center justify-between px-3 py-3 rounded-control min-h-touch transition-colors ${
                      active ? 'bg-primary/10 text-primary font-semibold' : 'text-ink hover:bg-bg'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <IconComponent
                        size={20}
                        weight={active ? 'fill' : 'regular'}
                        className={`w-5 h-5 ${active ? 'text-primary' : 'text-ink-muted'}`}
                      />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>

                    {badge !== undefined && badge > 0 && (
                      <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-warning text-ink">
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}

              <form
                action={onLogout}
                onSubmit={async () => {
                  clearClientUserCache();
                  if (isCapacitorNative()) {
                    try {
                      await removeSecureToken();
                    } catch {
                      // Ignora falha de limpeza local
                    }
                  }
                }}
                className="pt-2 border-t border-line mt-2"
              >
                <button
                  type="submit"
                  className="flex items-center space-x-3 w-full px-3 py-3 rounded-control text-danger hover:bg-danger-soft min-h-touch text-left"
                >
                  <SignOut size={20} weight="regular" className="w-5 h-5" />
                  <span className="text-sm font-semibold">Encerrar sessão</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
