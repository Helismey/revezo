'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertBanner } from '@/components/AlertBanner';
import { maskPhoneNumber, maskEmail } from '@revezo/domain';
import {
  DownloadSimple,
  UploadSimple,
  Plus,
  Crown,
  Cross,
  Church,
  PencilSimple,
  Trash,
  X,
  Check,
  ChartBar,
  CaretLeft,
  UserCircle,
  ArrowsClockwise,
} from '@/components/Icons';

export interface MemberListItem {
  id: string;
  name: string;
  email: string;
  globalRole: string;
  phonePrimary: string | null;
  whatsapp: string | null;
  photoUrl: string | null;
  status: 'ACTIVE' | 'PENDING' | 'REJECTED' | 'INACTIVE';
  isMinor: boolean;
  guardianName: string | null;
  guardianPhone: string | null;
  birthDate?: string | null;
  notes?: string | null;
  memberships: {
    id: string;
    departmentId: string;
    departmentName: string;
    role?: 'MANAGER' | 'MEMBER';
    functions: { id: string; name: string }[];
  }[];
}

export interface DepartmentOption {
  id: string;
  name: string;
  functions: { id: string; name: string }[];
}

interface MembrosClientProps {
  initialMembers: MemberListItem[];
  departments: DepartmentOption[];
  isAdmin: boolean;
  isPastor?: boolean;
  isElder?: boolean;
  canAssignElder?: boolean;
  currentChurchId?: string | null;
  currentChurchName?: string;
  managedDepartmentIds: string[];
}

export function MembrosClient({
  initialMembers,
  departments,
  isAdmin,
  isPastor = false,
  isElder = false,
  canAssignElder = false,
  currentChurchId = null,
  currentChurchName = '',
  managedDepartmentIds,
}: MembrosClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Membros em estado reativo
  const [members, setMembers] = useState<MemberListItem[]>(initialMembers);

  // Sincroniza estado reativo quando initialMembers é atualizado pelo servidor
  React.useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'INACTIVE'>('ALL');
  const [filterMinorsOnly, setFilterMinorsOnly] = useState(false);

  // Modais
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Estados do Modal de Edição de Voluntário
  const [editingMember, setEditingMember] = useState<MemberListItem | null>(null);
  const [editTab, setEditTab] = useState<'pessoal' | 'departamentos'>('pessoal');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'PENDING' | 'INACTIVE' | 'REJECTED'>('ACTIVE');
  const [editGlobalRole, setEditGlobalRole] = useState<string>('USER');
  const [editIsMinor, setEditIsMinor] = useState(false);
  const [editGuardianName, setEditGuardianName] = useState('');
  const [editGuardianPhone, setEditGuardianPhone] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Estados da Aba 2 (Adicionar Departamento ao Membro)
  const [addDeptId, setAddDeptId] = useState('');
  const [addDeptRole, setAddDeptRole] = useState<'MEMBER' | 'MANAGER'>('MEMBER');
  const [addDeptFunctionIds, setAddDeptFunctionIds] = useState<string[]>([]);

  // Estados do formulário de Novo Voluntário
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createWhatsapp, setCreateWhatsapp] = useState('');
  const [createDeptId, setCreateDeptId] = useState('');
  const [createFunctionIds, setCreateFunctionIds] = useState<string[]>([]);
  const [createStatus, setCreateStatus] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [createIsMinor, setCreateIsMinor] = useState(false);
  const [createGuardianName, setCreateGuardianName] = useState('');
  const [createGuardianPhone, setCreateGuardianPhone] = useState('');

  // Estados da Importação de Planilha
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    totalRows: number;
    validRows: any[];
    invalidRows: { index: number; data: any; errors: string[] }[];
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
    newCount: number;
  } | null>(null);
  const [importDefaultStatus, setImportDefaultStatus] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [importUpdateExisting, setImportUpdateExisting] = useState(false);
  const [importSuccessResult, setImportSuccessResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Departamentos disponíveis para o usuário adicionar membros
  const assignableDepartments = isAdmin
    ? departments
    : departments.filter((d) => managedDepartmentIds.includes(d.id));

  // Funções do departamento atualmente selecionado no modal de criação
  const currentDeptFunctions =
    departments.find((d) => d.id === createDeptId)?.functions || [];

  // Funções disponíveis para novo departamento no modal de edição
  const addDeptAvailableFunctions =
    departments.find((d) => d.id === addDeptId)?.functions || [];

  // Departamentos que o voluntário ainda não participa
  const availableDepartmentsToAdd = assignableDepartments.filter(
    (d) => !editingMember?.memberships.some((m) => m.departmentId === d.id)
  );

  // Permissão para editar um membro (Admin, Pastor, Ancião ou Gestor de departamento do membro)
  const canEditMember = (member: MemberListItem) => {
    if (isAdmin || isPastor || isElder) return true;
    return member.memberships.some((m) => managedDepartmentIds.includes(m.departmentId));
  };

  // Filtragem local de membros
  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.memberships.some(
        (m) =>
          m.departmentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.functions.some((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );

    const matchesDept =
      selectedDeptFilter === 'ALL' ||
      member.memberships.some((m) => m.departmentId === selectedDeptFilter);

    const matchesStatus =
      selectedStatusFilter === 'ALL' || member.status === selectedStatusFilter;

    const matchesMinor = !filterMinorsOnly || member.isMinor;

    return matchesSearch && matchesDept && matchesStatus && matchesMinor;
  });

  // Abrir modal de edição de voluntário
  const handleOpenEdit = (member: MemberListItem) => {
    setEditingMember(member);
    setEditTab('pessoal');
    setEditName(member.name);
    setEditEmail(member.email);
    setEditPhone(member.phonePrimary || '');
    setEditWhatsapp(member.whatsapp || '');
    setEditStatus(member.status);
    setEditGlobalRole(member.globalRole);
    setEditIsMinor(member.isMinor);
    setEditGuardianName(member.guardianName || '');
    setEditGuardianPhone(member.guardianPhone || '');
    setEditBirthDate(member.birthDate || '');
    setEditNotes(member.notes || '');
    setAddDeptId('');
    setAddDeptRole('MEMBER');
    setAddDeptFunctionIds([]);
  };

  // Salvar edições do voluntário (dados cadastrais e cargo)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    setLoading(true);
    setMessage(null);

    // Hierarquia: Apenas Admin e Pastor podem atribuir cargos globais (Pastor pode nomear Pastor, Ancião, Voluntário)
    const canManageRole = isAdmin || isPastor;

    try {
      const res = await fetch('/api/membros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingMember.id,
          name: editName,
          email: editEmail,
          phonePrimary: editPhone || null,
          whatsapp: editWhatsapp || null,
          status: editStatus,
          globalRole: canManageRole ? editGlobalRole : undefined,
          isMinor: editIsMinor,
          guardianName: editIsMinor ? editGuardianName : null,
          guardianPhone: editIsMinor ? editGuardianPhone : null,
          birthDate: editBirthDate || null,
          notes: editNotes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao atualizar dados do voluntário.' });
        return;
      }

      let feedback = `Dados de "${editName}" atualizados com sucesso!`;
      if (data.reprocessedAssignmentsCount > 0) {
        feedback += ` ${data.reprocessedAssignmentsCount} escala(s) futura(s) reprocessada(s).`;
      }

      setMessage({ type: 'sucesso', text: feedback });

      const updatedMember: MemberListItem = {
        ...editingMember,
        name: editName,
        email: editEmail,
        phonePrimary: editPhone || null,
        whatsapp: editWhatsapp || null,
        status: editStatus,
        globalRole: canManageRole ? editGlobalRole : editingMember.globalRole,
        isMinor: editIsMinor,
        guardianName: editIsMinor ? editGuardianName : null,
        guardianPhone: editIsMinor ? editGuardianPhone : null,
        birthDate: editBirthDate || null,
        notes: editNotes || null,
      };

      setMembers((prev) => prev.map((m) => (m.id === updatedMember.id ? updatedMember : m)));
      setEditingMember(null);

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setMessage({ type: 'erro', text: 'Erro de comunicação ao salvar alterações.' });
    } finally {
      setLoading(false);
    }
  };

  // Desvincular membro de um departamento e reprocessar escalas futuras com substituição automática
  const handleUnlinkDepartment = async (departmentId: string, departmentName: string) => {
    if (!editingMember) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja desvincular "${editingMember.name}" do departamento "${departmentName}"?\n\n` +
        `ATENÇÃO: Todas as escalas futuras deste voluntário no departamento serão reprocessadas automaticamente:\n` +
        `• O sistema tentará alocar o melhor substituto disponível;\n` +
        `• Caso não haja substituto qualificado, a vaga será aberta em aberto para outros voluntários.`
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/departamentos/membros', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId,
          userId: editingMember.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao desvincular voluntário do departamento.' });
        return;
      }

      let feedback = `Voluntário desvinculado do departamento "${departmentName}" com sucesso.`;
      if (data.reprocessedCount > 0) {
        feedback += ` ${data.reprocessedCount} escala(s) futura(s) reprocessada(s) (${data.substitutedCount} com substituição automática, ${data.openedSlotsCount} aberta(s) como vaga).`;
      }

      setMessage({ type: 'sucesso', text: feedback });

      const updatedMemberships = editingMember.memberships.filter((m) => m.departmentId !== departmentId);
      const updatedMember: MemberListItem = { ...editingMember, memberships: updatedMemberships };

      setEditingMember(updatedMember);
      setMembers((prev) => prev.map((m) => (m.id === updatedMember.id ? updatedMember : m)));

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setMessage({ type: 'erro', text: 'Erro de comunicação ao desvincular do departamento.' });
    } finally {
      setLoading(false);
    }
  };

  // Adicionar departamento e funções ao voluntário selecionado
  const handleAddDepartmentToMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !addDeptId) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/departamentos/membros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: addDeptId,
          userId: editingMember.id,
          role: addDeptRole,
          functionIds: addDeptFunctionIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao vincular departamento.' });
        return;
      }

      const deptObj = departments.find((d) => d.id === addDeptId);
      const addedFunctions = deptObj?.functions.filter((f) => addDeptFunctionIds.includes(f.id)) || [];

      const newMembership = {
        id: data.memberId || `mem-${Date.now()}`,
        departmentId: addDeptId,
        departmentName: deptObj?.name || 'Departamento',
        role: addDeptRole,
        functions: addedFunctions,
      };

      const updatedMemberships = [...editingMember.memberships, newMembership];
      const updatedMember: MemberListItem = { ...editingMember, memberships: updatedMemberships };

      setEditingMember(updatedMember);
      setMembers((prev) => prev.map((m) => (m.id === updatedMember.id ? updatedMember : m)));
      setMessage({
        type: 'sucesso',
        text: `Voluntário vinculado ao departamento "${deptObj?.name}" com sucesso!`,
      });

      setAddDeptId('');
      setAddDeptRole('MEMBER');
      setAddDeptFunctionIds([]);

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setMessage({ type: 'erro', text: 'Erro de comunicação ao vincular ao departamento.' });
    } finally {
      setLoading(false);
    }
  };

  // Handler para nomear Ancião responsável
  const handleAssignElder = async (userId: string, memberName: string) => {
    if (!currentChurchId) {
      setMessage({ type: 'erro', text: 'Selecione uma congregação ativa primeiro.' });
      return;
    }

    const confirmed = window.confirm(
      `Deseja vincular "${memberName}" como Ancião responsável pela congregação ${currentChurchName || 'atual'}?`
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/membros/vincular-anciao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, churchId: currentChurchId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao vincular ancião.' });
        return;
      }

      setMessage({ type: 'sucesso', text: data.message || `${memberName} agora é Ancião desta congregação.` });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setMessage({ type: 'erro', text: 'Erro de comunicação ao vincular ancião.' });
    } finally {
      setLoading(false);
    }
  };

  // Handler de Criação Manual de Membro
  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/membros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          phonePrimary: createPhone || null,
          whatsapp: createWhatsapp || null,
          departmentId: createDeptId || null,
          functionIds: createFunctionIds,
          churchId: currentChurchId || null,
          status: createStatus,
          isMinor: createIsMinor,
          guardianName: createIsMinor ? createGuardianName : null,
          guardianPhone: createIsMinor ? createGuardianPhone : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao cadastrar voluntário.' });
        return;
      }

      setMessage({ type: 'sucesso', text: `Voluntário ${createName} cadastrado com sucesso!` });
      setShowCreateModal(false);
      resetCreateForm();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão com o servidor.' });
    } finally {
      setLoading(false);
    }
  };

  const resetCreateForm = () => {
    setCreateName('');
    setCreateEmail('');
    setCreatePhone('');
    setCreateWhatsapp('');
    setCreateDeptId('');
    setCreateFunctionIds([]);
    setCreateStatus('ACTIVE');
    setCreateIsMinor(false);
    setCreateGuardianName('');
    setCreateGuardianPhone('');
  };

  // Handler de Envio da Planilha para Prévia
  const handlePreviewImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setMessage(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await fetch('/api/membros/importar/preview', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao processar planilha.' });
        return;
      }

      setImportPreview(data);
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão ao enviar planilha.' });
    } finally {
      setLoading(false);
    }
  };

  // Handler de Confirmação da Importação
  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.validRows.length === 0) return;

    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/membros/importar/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: importPreview.validRows,
          defaultStatus: importDefaultStatus,
          updateExisting: importUpdateExisting,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao confirmar importação.' });
        return;
      }

      setImportSuccessResult(data);
      setMessage({
        type: 'sucesso',
        text: `Importação concluída: ${data.created} novo(s) voluntário(s), ${data.updated} atualizado(s).`,
      });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão ao concluir importação.' });
    } finally {
      setLoading(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportPreview(null);
    setImportSuccessResult(null);
  };

  return (
    <div className="space-y-6">
      {message && <AlertBanner type={message.type} message={message.text} />}

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Equipe e Voluntários</h1>
            {currentChurchName && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {currentChurchName}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Gestão de voluntários, equipes por departamento e importação/exportação.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {(isAdmin || isPastor || isElder) && (
            <a
              href="/api/membros/exportar"
              className="px-3.5 py-2 bg-surface text-ink border border-line font-medium rounded-control hover:bg-bg text-xs sm:text-sm min-h-touch inline-flex items-center justify-center transition"
            >
              <DownloadSimple size={16} className="mr-1.5" /> Exportar CSV
            </a>
          )}

          {(isAdmin || isPastor || isElder) && (
            <button
              type="button"
              onClick={() => {
                setShowImportModal(true);
                setImportSuccessResult(null);
                setImportPreview(null);
              }}
              className="px-3.5 py-2 bg-surface text-ink border border-line font-medium rounded-control hover:bg-bg text-xs sm:text-sm min-h-touch inline-flex items-center justify-center transition"
            >
              <UploadSimple size={16} className="mr-1.5" /> Importar Planilha
            </button>
          )}

          {(isAdmin || isPastor || isElder || managedDepartmentIds.length > 0) && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-control hover:opacity-95 text-xs sm:text-sm min-h-touch inline-flex items-center justify-center shadow-sm transition"
            >
              <Plus size={16} className="mr-1.5" /> Novo Voluntário
            </button>
          )}
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="bg-surface rounded-surface border border-line p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, e-mail, departamento ou função..."
              className="w-full px-3.5 py-2.5 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink min-h-touch"
            >
              <option value="ALL">Todos os Departamentos</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>

            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink min-h-touch"
            >
              <option value="ALL">Todos os Status</option>
              <option value="ACTIVE">Apenas Ativos</option>
              <option value="PENDING">Apenas Pendentes</option>
              <option value="INACTIVE">Apenas Inativos</option>
            </select>

            <label className="inline-flex items-center space-x-2 text-xs sm:text-sm text-ink-muted cursor-pointer px-2 py-1 select-none">
              <input
                type="checkbox"
                checked={filterMinorsOnly}
                onChange={(e) => setFilterMinorsOnly(e.target.checked)}
                className="rounded border-line text-primary focus:ring-primary h-4 w-4"
              />
              <span>Menores de 18 anos</span>
            </label>
          </div>
        </div>
      </div>

      {/* Lista de Voluntários */}
      <div className="bg-surface rounded-surface border border-line divide-y divide-line overflow-hidden shadow-sm">
        {filteredMembers.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-sm">
            Nenhum voluntário encontrado com os filtros aplicados.
          </div>
        ) : (
          filteredMembers.map((member) => {
            const canViewContacts =
              isAdmin ||
              isPastor ||
              isElder ||
              member.memberships.some((m) => managedDepartmentIds.includes(m.departmentId));

            return (
              <div
                key={member.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-bg/40 transition"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base overflow-hidden border border-line shrink-0">
                    {member.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={member.photoUrl}
                        alt={member.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      member.name.charAt(0)
                    )}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 flex-wrap">
                      <h3 className="font-semibold text-ink text-base">{member.name}</h3>
                      {member.globalRole === 'ADMIN_MASTER' && (
                        <span className="text-[11px] font-medium bg-danger-soft text-danger-ink px-2 py-0.5 rounded-control border border-danger/20 inline-flex items-center gap-1">
                          <Crown size={12} /> Admin Master
                        </span>
                      )}
                      {member.globalRole === 'PASTOR' && (
                        <span className="text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-control border border-primary/20 inline-flex items-center gap-1">
                          <Cross size={12} /> Pastor Master
                        </span>
                      )}
                      {member.globalRole === 'ELDER' && (
                        <span className="text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-control border border-primary/20 inline-flex items-center gap-1">
                          <Church size={12} /> Ancião
                        </span>
                      )}
                      {member.status === 'PENDING' && (
                        <span className="text-[11px] font-medium bg-warning-soft text-warning-ink px-2 py-0.5 rounded-control border border-warning/20">
                          Pendente
                        </span>
                      )}
                      {member.status === 'INACTIVE' && (
                        <span className="text-[11px] font-medium bg-line/40 text-ink-muted px-2 py-0.5 rounded-control border border-line">
                          Inativo
                        </span>
                      )}
                      {member.isMinor && (
                        <span className="text-[11px] font-medium bg-info-soft text-info px-2 py-0.5 rounded-control border border-info/20">
                          Menor de 18 anos
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {member.memberships.length === 0 ? (
                        <span className="text-xs text-ink-muted italic">Sem departamento associado</span>
                      ) : (
                        member.memberships.map((m) => (
                          <span
                            key={m.id}
                            className="text-xs bg-bg px-2 py-0.5 rounded-control text-ink-muted font-medium border border-line inline-flex items-center gap-1"
                          >
                            {m.role === 'MANAGER' && (
                              <span title="Gestor do Departamento">
                                <Crown size={12} className="text-warning-ink" />
                              </span>
                            )}
                            <span>{m.departmentName}</span>
                            {m.functions.length > 0 &&
                              ` (${m.functions.map((f) => f.name).join(', ')})`}
                          </span>
                        ))
                      )}
                    </div>

                    {member.isMinor && member.guardianName && canViewContacts && (
                      <p className="text-xs text-ink-muted mt-1">
                        Responsável: <span className="font-medium text-ink">{member.guardianName}</span>
                        {member.guardianPhone && ` (${member.guardianPhone})`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Informações de contato (Proteção LGPD) e Ações */}
                <div className="text-xs text-ink-muted sm:text-right space-y-1.5 shrink-0">
                  {canViewContacts ? (
                    <>
                      <p className="font-medium text-ink">{member.phonePrimary || 'Sem telefone'}</p>
                      <p>{member.email}</p>
                      {member.whatsapp && member.whatsapp !== member.phonePrimary && (
                        <p className="text-[11px]">WhatsApp: {member.whatsapp}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="italic text-ink-muted text-[11px]">Contatos protegidos (apenas gestores)</p>
                      <p>{maskEmail(member.email)} • {maskPhoneNumber(member.phonePrimary)}</p>
                    </>
                  )}

                  <div className="pt-2 flex flex-wrap items-center gap-2 sm:justify-end">
                    {canEditMember(member) && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(member)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-control bg-surface hover:bg-bg border border-line text-ink transition flex items-center gap-1.5 shadow-subtle min-h-touch"
                        title="Editar dados cadastrais, cargos e departamentos"
                      >
                        <PencilSimple size={14} /> Editar
                      </button>
                    )}

                    {canAssignElder && member.globalRole === 'USER' && member.status === 'ACTIVE' && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleAssignElder(member.id, member.name)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-control bg-primary/10 text-primary hover:bg-primary/20 transition flex items-center gap-1.5 border border-primary/20 min-h-touch"
                        title="Vincular voluntário como Ancião desta congregação"
                      >
                        <Church size={14} /> Tornar Ancião
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Novo Voluntário */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-surface border border-line max-w-lg w-full p-6 space-y-5 shadow-xl my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold font-display text-ink">Novo Voluntário</h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="text-ink-muted hover:text-ink text-sm font-semibold p-1 min-h-touch min-w-touch flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="ex: João da Silva"
                  className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  E-mail *
                </label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="joao@exemplo.com"
                  className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase mb-1">
                    Telefone Principal (+55...)
                  </label>
                  <input
                    type="text"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    placeholder="+5511999998888"
                    className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink uppercase mb-1">
                    WhatsApp (opcional)
                  </label>
                  <input
                    type="text"
                    value={createWhatsapp}
                    onChange={(e) => setCreateWhatsapp(e.target.value)}
                    placeholder="+5511999998888"
                    className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Departamento Inicial
                </label>
                <select
                  value={createDeptId}
                  onChange={(e) => {
                    setCreateDeptId(e.target.value);
                    setCreateFunctionIds([]);
                  }}
                  className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Nenhum departamento (geral)</option>
                  {assignableDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              {createDeptId && currentDeptFunctions.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase mb-1.5">
                    Funções no Departamento
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-bg p-3 rounded-control border border-line max-h-36 overflow-y-auto">
                    {currentDeptFunctions.map((func) => (
                      <label key={func.id} className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createFunctionIds.includes(func.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCreateFunctionIds([...createFunctionIds, func.id]);
                            } else {
                              setCreateFunctionIds(createFunctionIds.filter((id) => id !== func.id));
                            }
                          }}
                          className="rounded border-line text-primary focus:ring-primary h-4 w-4"
                        />
                        <span>{func.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Proteção LGPD: Voluntário Menor de Idade */}
              <div className="bg-bg/60 p-3.5 rounded-control border border-line space-y-3">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createIsMinor}
                    onChange={(e) => setCreateIsMinor(e.target.checked)}
                    className="rounded border-line text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-ink">
                    Voluntário menor de 18 anos
                  </span>
                </label>

                {createIsMinor && (
                  <div className="space-y-3 pt-2 border-t border-line text-xs">
                    <p className="text-ink-muted">
                      Em conformidade com a LGPD, o cadastro de voluntários menores de idade requer o registro dos dados de contato do responsável legal.
                    </p>

                    <div>
                      <label className="block font-semibold text-ink mb-1">
                        Nome do Responsável Legal *
                      </label>
                      <input
                        type="text"
                        required={createIsMinor}
                        value={createGuardianName}
                        onChange={(e) => setCreateGuardianName(e.target.value)}
                        placeholder="Nome do pai, mãe ou responsável legal"
                        className="w-full px-3 py-2 rounded-control border border-line bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-ink mb-1">
                        Telefone do Responsável Legal (+55...) *
                      </label>
                      <input
                        type="text"
                        required={createIsMinor}
                        value={createGuardianPhone}
                        onChange={(e) => setCreateGuardianPhone(e.target.value)}
                        placeholder="+5511999998888"
                        className="w-full px-3 py-2 rounded-control border border-line bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Status Inicial
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                    <input
                      type="radio"
                      name="createStatus"
                      value="ACTIVE"
                      checked={createStatus === 'ACTIVE'}
                      onChange={() => setCreateStatus('ACTIVE')}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Ativo (Pronto para escalas)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                    <input
                      type="radio"
                      name="createStatus"
                      value="PENDING"
                      checked={createStatus === 'PENDING'}
                      onChange={() => setCreateStatus('PENDING')}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Pendente de Aprovação</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="px-4 py-2 border border-line text-ink rounded-control hover:bg-bg text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white rounded-control hover:opacity-95 text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Cadastrar Voluntário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Importar Planilha */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-surface border border-line max-w-2xl w-full p-6 space-y-5 shadow-xl my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold font-display text-ink">Importar Voluntários por Planilha</h2>
              <button
                type="button"
                onClick={closeImportModal}
                className="text-ink-muted hover:text-ink text-sm font-semibold p-1 min-h-touch min-w-touch flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sucesso após conclusão */}
            {importSuccessResult ? (
              <div className="space-y-4 py-4 text-center">
                <div className="w-12 h-12 bg-success-soft text-success rounded-full flex items-center justify-center mx-auto">
                  <Check size={24} />
                </div>
                <h3 className="text-lg font-bold text-ink">Importação Finalizada!</h3>
                <div className="text-sm text-ink-muted space-y-1">
                  <p><strong>{importSuccessResult.created}</strong> novo(s) voluntário(s) cadastrado(s).</p>
                  <p><strong>{importSuccessResult.updated}</strong> voluntário(s) atualizado(s).</p>
                  <p><strong>{importSuccessResult.skipped}</strong> registro(s) mantido(s) sem alterações.</p>
                  {importSuccessResult.errors.length > 0 && (
                    <p className="text-amber-600">
                      {importSuccessResult.errors.length} erro(s) encontrados durante a gravação.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={closeImportModal}
                  className="px-5 py-2.5 bg-primary text-white rounded-control font-semibold text-sm hover:opacity-95 transition min-h-touch"
                >
                  Fechar
                </button>
              </div>
            ) : !importPreview ? (
              /* Passo 1: Seleção de Arquivo */
              <form onSubmit={handlePreviewImport} className="space-y-4">
                <div className="border-2 border-dashed border-line hover:border-primary rounded-surface p-6 text-center transition">
                  <input
                    type="file"
                    id="spreadsheetFile"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <label htmlFor="spreadsheetFile" className="cursor-pointer block space-y-2">
                    <ChartBar size={36} className="text-primary mx-auto mb-1" />
                    <span className="text-sm font-medium text-ink block">
                      {importFile ? importFile.name : 'Clique para selecionar ou arraste o arquivo CSV ou Excel'}
                    </span>
                    <span className="text-xs text-ink-muted block">
                      Formatos aceitos: .csv ou .xlsx (máximo 5 MB e 1000 linhas)
                    </span>
                  </label>
                </div>

                <div className="bg-bg/60 p-4 rounded-control border border-line text-xs text-ink-muted space-y-1.5">
                  <p className="font-semibold text-ink">Colunas aceitas na planilha:</p>
                  <p>• <strong>Nome</strong>: Nome completo do voluntário (obrigatório)</p>
                  <p>• <strong>E-mail</strong>: E-mail para contato e login (obrigatório)</p>
                  <p>• <strong>Telefone</strong> / <strong>WhatsApp</strong>: Formato internacional (+55...)</p>
                  <p>• <strong>Departamento</strong> / <strong>Função</strong>: Nome exato conforme cadastrado</p>
                  <p>• <strong>Menor</strong>: &quot;Sim&quot; ou &quot;Não&quot; (se sim, preencher <strong>Responsável</strong> e <strong>Telefone do Responsável</strong>)</p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="px-4 py-2 border border-line text-ink rounded-control hover:bg-bg text-sm font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!importFile || loading}
                    className="px-4 py-2 bg-primary text-white rounded-control hover:opacity-95 text-sm font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Analisando arquivo...' : 'Analisar e Ver Prévia'}
                  </button>
                </div>
              </form>
            ) : (
              /* Passo 2: Prévia e Validação */
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-bg p-3 rounded-control border border-line">
                    <span className="text-xs text-ink-muted block">Total de Linhas</span>
                    <span className="text-lg font-bold text-ink">{importPreview.totalRows}</span>
                  </div>
                  <div className="bg-green-500/10 p-3 rounded-control border border-green-500/20">
                    <span className="text-xs text-green-700 dark:text-green-300 block">Válidas</span>
                    <span className="text-lg font-bold text-green-700 dark:text-green-300">
                      {importPreview.validCount}
                    </span>
                  </div>
                  <div className="bg-amber-500/10 p-3 rounded-control border border-amber-500/20">
                    <span className="text-xs text-amber-700 dark:text-amber-300 block">Já Cadastrados</span>
                    <span className="text-lg font-bold text-amber-700 dark:text-amber-300">
                      {importPreview.duplicateCount}
                    </span>
                  </div>
                  <div className="bg-red-500/10 p-3 rounded-control border border-red-500/20">
                    <span className="text-xs text-red-700 dark:text-red-300 block">Inválidas</span>
                    <span className="text-lg font-bold text-red-700 dark:text-red-300">
                      {importPreview.invalidCount}
                    </span>
                  </div>
                </div>

                {/* Avisos de linhas com erro */}
                {importPreview.invalidCount > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-control text-xs text-red-700 dark:text-red-300 max-h-28 overflow-y-auto space-y-1">
                    <p className="font-semibold">Linhas com erro que serão ignoradas:</p>
                    {importPreview.invalidRows.map((inv) => (
                      <p key={inv.index}>
                        • Linha {inv.index}: {inv.errors.join(', ')}
                      </p>
                    ))}
                  </div>
                )}

                {/* Opções de Importação */}
                <div className="bg-bg p-3.5 rounded-control border border-line space-y-2 text-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="font-semibold text-ink">Status dos novos voluntários:</label>
                    <div className="flex gap-3">
                      <label className="flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="importDefaultStatus"
                          value="ACTIVE"
                          checked={importDefaultStatus === 'ACTIVE'}
                          onChange={() => setImportDefaultStatus('ACTIVE')}
                          className="text-primary focus:ring-primary"
                        />
                        <span className="text-ink">Ativo</span>
                      </label>
                      <label className="flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="importDefaultStatus"
                          value="PENDING"
                          checked={importDefaultStatus === 'PENDING'}
                          onChange={() => setImportDefaultStatus('PENDING')}
                          className="text-primary focus:ring-primary"
                        />
                        <span className="text-ink">Pendente</span>
                      </label>
                    </div>
                  </div>

                  {importPreview.duplicateCount > 0 && (
                    <label className="flex items-center space-x-2 pt-2 border-t border-line cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importUpdateExisting}
                        onChange={(e) => setImportUpdateExisting(e.target.checked)}
                        className="rounded border-line text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="text-ink">
                        Atualizar dados dos {importPreview.duplicateCount} voluntários já existentes (telefone, WhatsApp, etc.)
                      </span>
                    </label>
                  )}
                </div>

                {/* Tabela de Amostra das Linhas Válidas */}
                <div className="border border-line rounded-control overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-bg border-b border-line text-ink-muted">
                      <tr>
                        <th className="p-2">Nome</th>
                        <th className="p-2">E-mail</th>
                        <th className="p-2">Depto / Função</th>
                        <th className="p-2 text-right">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {importPreview.validRows.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-bg/40">
                          <td className="p-2 font-medium text-ink">
                            {row.name}
                            {row.isMinor && (
                              <span className="ml-1 text-[10px] text-blue-600 bg-blue-50 px-1 py-0.2 rounded">
                                Menor
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-ink-muted">{row.email}</td>
                          <td className="p-2 text-ink-muted">
                            {row.departmentName || '-'}{' '}
                            {row.functionName ? `(${row.functionName})` : ''}
                          </td>
                          <td className="p-2 text-right">
                            {row.isExisting ? (
                              <span className="text-amber-600 font-medium">Existente</span>
                            ) : (
                              <span className="text-green-600 font-medium">Novo</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setImportPreview(null)}
                    className="px-3 py-1.5 border border-line text-ink rounded-control hover:bg-bg text-xs font-medium inline-flex items-center min-h-touch"
                  >
                    <CaretLeft size={14} className="mr-1" /> Trocar Arquivo
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeImportModal}
                      className="px-3.5 py-2 border border-line text-ink rounded-control hover:bg-bg text-xs font-medium min-h-touch"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={loading || importPreview.validCount === 0}
                      onClick={handleConfirmImport}
                      className="px-4 py-2 bg-primary text-white rounded-control hover:opacity-95 text-xs font-semibold disabled:opacity-50 min-h-touch"
                    >
                      {loading
                        ? 'Gravando no banco...'
                        : `Confirmar e Gravar ${importPreview.validCount} Voluntário(s)`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Editar Voluntário (Com Abas de Dados Pessoais e Cargos/Departamentos) */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-surface border border-line max-w-2xl w-full p-6 space-y-5 shadow-xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base overflow-hidden border border-line shrink-0">
                  {editingMember.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={editingMember.photoUrl} alt={editingMember.name} className="w-full h-full object-cover" />
                  ) : (
                    editingMember.name.charAt(0)
                  )}
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold font-display text-ink flex items-center gap-2">
                    Editar: {editingMember.name}
                  </h2>
                  <p className="text-xs text-ink-muted">Gestão cadastral, cargos eclesiásticos e vínculos departamentais</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="text-ink-muted hover:text-ink text-sm font-semibold p-1 min-h-touch min-w-touch flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-line gap-2">
              <button
                type="button"
                onClick={() => setEditTab('pessoal')}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold border-b-2 transition -mb-px inline-flex items-center gap-1.5 ${
                  editTab === 'pessoal'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <UserCircle size={16} /> Dados Pessoais & Eclesiásticos
              </button>
              <button
                type="button"
                onClick={() => setEditTab('departamentos')}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-1.5 ${
                  editTab === 'departamentos'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <Church size={16} />
                <span>Cargos e Departamentos Vinculados</span>
                <span className="text-[11px] px-1.5 py-0.2 rounded-control bg-bg border border-line text-ink">
                  {editingMember.memberships.length}
                </span>
              </button>
            </div>

            {/* Tab 1: Dados Pessoais & Eclesiásticos */}
            {editTab === 'pessoal' && (
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink uppercase mb-1">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink uppercase mb-1">
                      E-mail *
                    </label>
                    <input
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink uppercase mb-1">
                      Telefone Principal
                    </label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+5511999998888"
                      className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink uppercase mb-1">
                      WhatsApp
                    </label>
                    <input
                      type="text"
                      value={editWhatsapp}
                      onChange={(e) => setEditWhatsapp(e.target.value)}
                      placeholder="+5511999998888"
                      className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink uppercase mb-1">
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={editBirthDate}
                      onChange={(e) => setEditBirthDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                {/* Status do Membro */}
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase mb-1.5">
                    Status da Conta
                  </label>
                  <div className="flex flex-wrap gap-4 bg-bg p-3 rounded-control border border-line">
                    <label className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                      <input
                        type="radio"
                        name="editStatus"
                        value="ACTIVE"
                        checked={editStatus === 'ACTIVE'}
                        onChange={() => setEditStatus('ACTIVE')}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="font-medium text-green-700 dark:text-green-300">Ativo</span>
                    </label>
                    <label className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                      <input
                        type="radio"
                        name="editStatus"
                        value="PENDING"
                        checked={editStatus === 'PENDING'}
                        onChange={() => setEditStatus('PENDING')}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="font-medium text-amber-700 dark:text-amber-300">Pendente</span>
                    </label>
                    <label className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                      <input
                        type="radio"
                        name="editStatus"
                        value="INACTIVE"
                        checked={editStatus === 'INACTIVE'}
                        onChange={() => setEditStatus('INACTIVE')}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">Inativo (Desativar sem excluir histórico)</span>
                    </label>
                  </div>
                </div>

                {/* Cargo Eclesiástico / Papel Global com Regras Hierárquicas */}
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase mb-1.5">
                    Cargo Eclesiástico / Nível de Acesso
                  </label>
                  {(isAdmin || isPastor) ? (
                    <div className="space-y-1.5">
                      <select
                        value={editGlobalRole}
                        onChange={(e) => setEditGlobalRole(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-touch"
                      >
                        <option value="USER">Voluntário (Acesso padrão)</option>
                        <option value="ELDER">Ancião</option>
                        <option value="PASTOR">Pastor</option>
                        {isAdmin && <option value="ADMIN_MASTER">Administrador Master</option>}
                      </select>
                      <p className="text-[11px] text-ink-muted">
                        {isAdmin
                          ? 'Como Administrador Master, você pode atribuir qualquer cargo no sistema.'
                          : 'Como Pastor, você pode definir qualquer cargo do seu nível para baixo (inclusive nomear outro Pastor, Ancião ou Voluntário).'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-bg rounded-control border border-line text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">Cargo Atual:</span>
                        <span className="font-medium text-ink inline-flex items-center gap-1.5">
                          {editGlobalRole === 'ADMIN_MASTER' && (
                            <>
                              <Crown size={14} className="text-danger-ink" /> Administrador Master
                            </>
                          )}
                          {editGlobalRole === 'PASTOR' && (
                            <>
                              <Cross size={14} className="text-primary" /> Pastor
                            </>
                          )}
                          {editGlobalRole === 'ELDER' && (
                            <>
                              <Church size={14} className="text-primary" /> Ancião
                            </>
                          )}
                          {editGlobalRole === 'USER' && (
                            <>
                              <UserCircle size={14} className="text-ink-muted" /> Voluntário
                            </>
                          )}
                        </span>
                      </div>
                      <span className="text-[11px] text-ink-muted italic">
                        {isElder
                          ? 'Anciãos só podem atribuir cargos para níveis estritamente abaixo do seu (não podem nomear outros Anciãos).'
                          : 'Apenas Pastores ou Administradores podem alterar cargos globais.'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Menor de Idade (LGPD) */}
                <div className="bg-bg/60 p-3.5 rounded-control border border-line space-y-3">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editIsMinor}
                      onChange={(e) => setEditIsMinor(e.target.checked)}
                      className="rounded border-line text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="text-xs sm:text-sm font-semibold text-ink">
                      Voluntário menor de 18 anos
                    </span>
                  </label>

                  {editIsMinor && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-line text-xs">
                      <div>
                        <label className="block font-semibold text-ink mb-1">
                          Nome do Responsável Legal *
                        </label>
                        <input
                          type="text"
                          required={editIsMinor}
                          value={editGuardianName}
                          onChange={(e) => setEditGuardianName(e.target.value)}
                          placeholder="Nome do responsável"
                          className="w-full px-3 py-2 rounded-control border border-line bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-ink mb-1">
                          Telefone do Responsável (+55...) *
                        </label>
                        <input
                          type="text"
                          required={editIsMinor}
                          value={editGuardianPhone}
                          onChange={(e) => setEditGuardianPhone(e.target.value)}
                          placeholder="+5511999998888"
                          className="w-full px-3 py-2 rounded-control border border-line bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Observações Internas */}
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase mb-1">
                    Observações Internas da Liderança
                  </label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Anotações sobre disponibilidade, restrições ou observações pastorais..."
                    className="w-full px-3 py-2 text-sm rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setEditingMember(null)}
                    className="px-4 py-2 border border-line text-ink rounded-control hover:bg-bg text-sm font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-primary text-white rounded-control hover:opacity-95 text-sm font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2: Cargos e Departamentos Vinculados */}
            {editTab === 'departamentos' && (
              <div className="space-y-5">
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-control text-xs text-ink space-y-1">
                  <p className="font-semibold text-primary flex items-center gap-1.5">
                    <ArrowsClockwise size={16} /> Reprocessamento Autônomo de Escalas
                  </p>
                  <p className="text-ink-muted">
                    Ao desvincular um membro de um departamento, o sistema localiza automaticamente todas as escalas futuras dele e busca o melhor voluntário substituto elegível. Caso não haja substituto, a vaga é aberta em aberto no departamento.
                  </p>
                </div>

                {/* Lista de Departamentos Atuais */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-ink uppercase">
                    Departamentos Atuais ({editingMember.memberships.length})
                  </h3>

                  {editingMember.memberships.length === 0 ? (
                    <div className="p-4 bg-bg rounded-control border border-line text-center text-xs text-ink-muted">
                      Este voluntário ainda não está vinculado a nenhum departamento.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {editingMember.memberships.map((membership) => {
                        const canManageThisDept =
                          isAdmin ||
                          isPastor ||
                          isElder ||
                          managedDepartmentIds.includes(membership.departmentId);

                        return (
                          <div
                            key={membership.id}
                            className="p-3 bg-bg rounded-control border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-sm text-ink">{membership.departmentName}</h4>
                                {membership.role === 'MANAGER' ? (
                                  <span className="text-[10px] font-medium bg-warning-soft text-warning-ink px-2 py-0.5 rounded-control border border-warning/20 inline-flex items-center gap-1">
                                    <Crown size={12} /> Gestor / Líder
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium bg-surface text-ink-muted px-2 py-0.5 rounded-control border border-line inline-flex items-center gap-1">
                                    <UserCircle size={12} /> Voluntário
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-1 text-xs">
                                {membership.functions.length > 0 ? (
                                  membership.functions.map((f) => (
                                    <span
                                      key={f.id}
                                      className="px-2 py-0.5 rounded bg-surface border border-line text-ink-muted text-[11px]"
                                    >
                                      {f.name}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-ink-muted italic text-[11px]">Nenhuma função específica vinculada</span>
                                )}
                              </div>
                            </div>

                            {canManageThisDept ? (
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => handleUnlinkDepartment(membership.departmentId, membership.departmentName)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-control bg-danger-soft text-danger-ink hover:bg-danger/20 border border-danger/20 transition self-start sm:self-center inline-flex items-center gap-1.5 min-h-touch"
                                title="Desvincular e reprocessar escalas futuras automaticamente"
                              >
                                <Trash size={14} /> Desvincular
                              </button>
                            ) : (
                              <span className="text-[11px] text-ink-muted italic self-start sm:self-center">
                                Apenas gestor deste departamento
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Adicionar a Novo Departamento */}
                {availableDepartmentsToAdd.length > 0 && (
                  <form onSubmit={handleAddDepartmentToMember} className="p-4 bg-surface rounded-control border border-line space-y-3">
                    <h3 className="text-xs font-semibold text-ink uppercase flex items-center gap-1">
                      <Plus size={14} /> Vincular a Outro Departamento
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1">
                          Departamento
                        </label>
                        <select
                          value={addDeptId}
                          onChange={(e) => {
                            setAddDeptId(e.target.value);
                            setAddDeptFunctionIds([]);
                          }}
                          required
                          className="w-full px-3 py-2 text-xs rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="">Selecione um departamento...</option>
                          {availableDepartmentsToAdd.map((dept) => (
                            <option key={dept.id} value={dept.id}>
                              {dept.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1">
                          Papel no Departamento
                        </label>
                        <select
                          value={addDeptRole}
                          onChange={(e) => setAddDeptRole(e.target.value as 'MEMBER' | 'MANAGER')}
                          className="w-full px-3 py-2 text-xs rounded-control border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="MEMBER">Voluntário</option>
                          <option value="MANAGER">Gestor / Líder de Departamento</option>
                        </select>
                      </div>
                    </div>

                    {addDeptId && addDeptAvailableFunctions.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1">
                          Funções no Departamento
                        </label>
                        <div className="grid grid-cols-2 gap-2 bg-bg p-2.5 rounded-control border border-line max-h-32 overflow-y-auto">
                          {addDeptAvailableFunctions.map((func) => (
                            <label key={func.id} className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                              <input
                                type="checkbox"
                                checked={addDeptFunctionIds.includes(func.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAddDeptFunctionIds([...addDeptFunctionIds, func.id]);
                                  } else {
                                    setAddDeptFunctionIds(addDeptFunctionIds.filter((id) => id !== func.id));
                                  }
                                }}
                                className="rounded border-line text-primary focus:ring-primary h-4 w-4"
                              />
                              <span>{func.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={loading || !addDeptId}
                        className="px-4 py-2 bg-primary text-white rounded-control hover:opacity-95 text-xs font-semibold disabled:opacity-50"
                      >
                        {loading ? 'Vinculando...' : '+ Vincular ao Departamento'}
                      </button>
                    </div>
                  </form>
                )}

                <div className="flex justify-end pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setEditingMember(null)}
                    className="px-4 py-2 border border-line text-ink rounded-control hover:bg-bg text-sm font-medium"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
