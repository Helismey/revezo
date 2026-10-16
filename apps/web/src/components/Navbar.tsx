'use client';

import React from 'react';
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
  Warning,
  PaperPlaneTilt,
  ArrowsLeftRight,
  ChartBar,
  Church,
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
  Church,
};

import { ChurchSelector } from './ChurchSelector';

interface NavbarProps {
  churchName: string;
  currentChurch?: { id: string; name: string; slug: string } | null;
  availableChurches?: { id: string; name: string; slug: string }[];
  canSwitchChurch?: boolean;
  userName: string;
  userRole: string;
  items: MenuItem[];
  badgeCounts: MenuBadgeCounts;
  onLogout: () => Promise<void>;
}

export function Navbar({
  churchName,
  currentChurch,
  availableChurches = [],
  canSwitchChurch = false,
  userName,
  userRole,
  items,
  badgeCounts,
  onLogout,
}: NavbarProps) {
  const pathname = usePathname();

  const formatRole = (role: string) => {
    switch (role) {
      case 'ADMIN_MASTER':
        return 'Administrador';
      case 'PASTOR':
        return 'Pastor Master';
      case 'ELDER':
        return 'Ancião';
      case 'MANAGER':
        return 'Gestor';
      default:
        return 'Voluntário';
    }
  };

  const getBadgeValue = (badgeKind?: string): number | undefined => {
    if (badgeKind === 'pending-approvals') return badgeCounts.pendingApprovals;
    if (badgeKind === 'open-slots') return badgeCounts.openSlots;
    if (badgeKind === 'unconfirmed') return badgeCounts.unconfirmed;
    return undefined;
  };

  const meuEspacoItems = items.filter((i) => i.group === 'meu-espaco');
  const gestaoItems = items.filter((i) => i.group === 'gestao');
  const administracaoItems = items.filter((i) => i.group === 'administracao');

  return (
    <>
      {/* Barra superior fixa desktop e mobile */}
      <header className="sticky top-0 z-40 bg-surface border-b border-line shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-control bg-primary flex items-center justify-center text-white font-bold font-display text-lg shrink-0">
              {churchName.charAt(0)}
            </div>
            <div>
              <ChurchSelector
                currentChurch={currentChurch || { id: '', name: churchName, slug: '' }}
                availableChurches={availableChurches}
                canSwitch={canSwitchChurch}
              />
              <span className="text-xs text-ink-muted block mt-0.5">Escala de Voluntários</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <span className="block text-sm font-semibold text-ink leading-tight">{userName}</span>
              <span className="text-xs text-ink-muted uppercase tracking-wider font-semibold">
                {formatRole(userRole)}
              </span>
            </div>
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
            >
              <button
                type="submit"
                className="text-xs font-semibold px-3 py-2 rounded-control border border-line text-ink-muted hover:text-danger hover:border-danger transition-colors min-h-touch flex items-center"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Barra lateral desktop */}
      <aside className="hidden md:flex flex-col w-64 fixed left-0 top-16 bottom-0 bg-surface border-r border-line p-4 overflow-y-auto">
        {meuEspacoItems.length > 0 && (
          <div className="mb-6">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider px-3 mb-2 block">
              Meu espaço
            </span>
            <div className="space-y-1">
              {meuEspacoItems.map((item) => (
                <NavItem key={item.id} item={item} active={pathname === item.href} badgeCount={getBadgeValue(item.badge)} />
              ))}
            </div>
          </div>
        )}

        {gestaoItems.length > 0 && (
          <div className="mb-6">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider px-3 mb-2 block">
              Gestão
            </span>
            <div className="space-y-1">
              {gestaoItems.map((item) => (
                <NavItem key={item.id} item={item} active={pathname === item.href} badgeCount={getBadgeValue(item.badge)} />
              ))}
            </div>
          </div>
        )}

        {administracaoItems.length > 0 && (
          <div className="mb-6">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider px-3 mb-2 block">
              Administração
            </span>
            <div className="space-y-1">
              {administracaoItems.map((item) => (
                <NavItem key={item.id} item={item} active={pathname === item.href} badgeCount={getBadgeValue(item.badge)} />
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function NavItem({ item, active, badgeCount }: { item: MenuItem; active: boolean; badgeCount?: number }) {
  const IconComponent = ICON_MAP[item.icon] ?? House;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between px-3 py-2.5 rounded-control text-sm font-medium transition-colors ${
        active
          ? 'bg-primary/10 text-primary border-l-4 border-primary font-semibold'
          : 'text-ink hover:bg-bg hover:text-ink'
      }`}
    >
      <div className="flex items-center space-x-3">
        <IconComponent
          size={20}
          weight={active ? 'fill' : 'regular'}
          className={`w-5 h-5 ${active ? 'text-primary' : 'text-ink-muted'}`}
        />
        <span>{item.label}</span>
      </div>

      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          className={`px-2 py-0.5 text-xs font-bold rounded-full ${
            item.badge === 'open-slots'
              ? 'bg-warning text-ink'
              : item.badge === 'pending-approvals'
              ? 'bg-info-soft text-primary'
              : 'bg-warning-soft text-warning-ink'
          }`}
        >
          {badgeCount}
        </span>
      )}
    </Link>
  );
}
