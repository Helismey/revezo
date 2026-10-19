'use client';

import React, { useState } from 'react';
import { AlertBanner } from '@/components/AlertBanner';
import { ConfirmDialog } from '@/components/Modal';

export interface DepartmentMemberInfo {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: 'MANAGER' | 'MEMBER';
  functions: { id: string; name: string }[];
}

export interface DepartmentDetail {
  id: string;
  name: string;
  functions: { id: string; name: string }[];
  membersCount: number;
  members: DepartmentMemberInfo[];
}

export interface ActiveUserOption {
  id: string;
  name: string;
  email: string;
}

interface DepartamentosClientProps {
  departments: DepartmentDetail[];
  activeUsers: ActiveUserOption[];
  isAdmin: boolean;
  managedDepartmentIds: string[];
}

export function DepartamentosClient({
  departments,
  activeUsers,
  isAdmin,
  managedDepartmentIds,
}: DepartamentosClientProps) {
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [activeDeptIdForFunction, setActiveDeptIdForFunction] = useState<string | null>(null);
  const [newFunctionName, setNewFunctionName] = useState('');

  // Estados para modal de adicionar membro à equipe
  const [addMemberDeptId, setAddMemberDeptId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'MANAGER' | 'MEMBER'>('MEMBER');
  const [selectedFunctionIds, setSelectedFunctionIds] = useState<string[]>([]);

  // Estados para modal de editar membro da equipe
  const [editingMember, setEditingMember] = useState<{
    departmentId: string;
    userId: string;
    userName: string;
    role: 'MANAGER' | 'MEMBER';
    functionIds: string[];
  } | null>(null);

  const [message, setMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const canManageDept = (deptId: string) => isAdmin || managedDepartmentIds.includes(deptId);

  // Criar Departamento
  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/departamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeptName }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao criar departamento.' });
        return;
      }

      setMessage({ type: 'sucesso', text: 'Departamento criado com sucesso!' });
      setShowDeptModal(false);
      setNewDeptName('');
      window.location.reload();
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão.' });
    } finally {
      setLoading(false);
    }
  };

  // Criar Função Interna
  const handleCreateFunction = async (departmentId: string) => {
    if (!newFunctionName.trim()) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/departamentos/funcoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId,
          name: newFunctionName,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao criar função.' });
        return;
      }

      setMessage({ type: 'sucesso', text: 'Função criada com sucesso!' });
      setActiveDeptIdForFunction(null);
      setNewFunctionName('');
      window.location.reload();
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão.' });
    } finally {
      setLoading(false);
    }
  };

  // Adicionar Membro à Equipe do Departamento
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMemberDeptId || !selectedUserId) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/departamentos/membros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: addMemberDeptId,
          userId: selectedUserId,
          role: selectedRole,
          functionIds: selectedFunctionIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao adicionar voluntário à equipe.' });
        return;
      }

      setMessage({ type: 'sucesso', text: 'Voluntário vinculado ao departamento com sucesso!' });
      setAddMemberDeptId(null);
      setSelectedUserId('');
      setSelectedRole('MEMBER');
      setSelectedFunctionIds([]);
      window.location.reload();
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão ao salvar voluntário.' });
    } finally {
      setLoading(false);
    }
  };

  // Salvar Edição de Membro
  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/departamentos/membros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: editingMember.departmentId,
          userId: editingMember.userId,
          role: editingMember.role,
          functionIds: editingMember.functionIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao atualizar dados do membro.' });
        return;
      }

      setMessage({ type: 'sucesso', text: 'Funções e atribuições atualizadas com sucesso!' });
      setEditingMember(null);
      window.location.reload();
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão ao atualizar membro.' });
    } finally {
      setLoading(false);
    }
  };

  // Remover Membro do Departamento
  const [pendingRemoveMember, setPendingRemoveMember] = useState<{
    departmentId: string;
    userId: string;
    userName: string;
  } | null>(null);

  const handleRemoveMember = async (departmentId: string, userId: string) => {
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/departamentos/membros', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId, userId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'erro', text: data.error || 'Erro ao desvincular voluntário.' });
        return;
      }

      setMessage({ type: 'sucesso', text: 'Voluntário desvinculado com sucesso.' });
      setPendingRemoveMember(null);
      window.location.reload();
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão ao desvincular membro.' });
    } finally {
      setLoading(false);
    }
  };

  const activeDeptForAdd = departments.find((d) => d.id === addMemberDeptId);
  const activeDeptForEdit = editingMember
    ? departments.find((d) => d.id === editingMember.departmentId)
    : null;

  return (
    <div className="space-y-6">
      {message && <AlertBanner type={message.type} message={message.text} />}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Departamentos e Equipes</h1>
          <p className="text-sm text-ink-muted mt-1">
            Organize os ministérios da igreja, suas funções especializadas e os voluntários de cada equipe.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowDeptModal(true)}
            className="px-4 py-2.5 bg-primary text-white font-semibold rounded-control hover:opacity-95 text-sm min-h-touch"
          >
            + Novo Departamento
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {departments.map((dept) => {
          const userCanManage = canManageDept(dept.id);
          const currentMemberUserIds = dept.members.map((m) => m.userId);

          return (
            <div
              key={dept.id}
              className="bg-surface rounded-surface border border-line p-5 shadow-sm space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Cabeçalho do Departamento */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display font-bold text-xl text-ink">{dept.name}</h3>
                    <span className="text-xs text-ink-muted">
                      {dept.members.length} voluntário(s) na equipe
                    </span>
                  </div>

                  {userCanManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDeptIdForFunction(
                          activeDeptIdForFunction === dept.id ? null : dept.id
                        );
                        setNewFunctionName('');
                      }}
                      className="text-xs text-primary font-semibold hover:underline"
                    >
                      + Nova Função
                    </button>
                  )}
                </div>

                {/* Formulário inline para nova função */}
                {activeDeptIdForFunction === dept.id && (
                  <div className="flex items-center space-x-2 pt-2 p-2.5 bg-bg rounded-control border border-line">
                    <input
                      type="text"
                      placeholder="Nome da função (ex: Teclado)"
                      value={newFunctionName}
                      onChange={(e) => setNewFunctionName(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-surface border border-field-border rounded-control text-xs text-ink"
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleCreateFunction(dept.id)}
                      className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-control hover:opacity-95 disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                )}

                {/* Funções do Departamento */}
                <div>
                  <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider block mb-1.5">
                    Funções Internas
                  </span>
                  {dept.functions.length === 0 ? (
                    <p className="text-xs text-ink-muted italic">Nenhuma função cadastrada.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {dept.functions.map((f) => (
                        <span
                          key={f.id}
                          className="text-xs bg-bg px-2.5 py-1 rounded-control text-ink font-medium border border-line"
                        >
                          {f.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Equipe / Voluntários Vinculados */}
                <div className="border-t border-line pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                      Equipe do Departamento
                    </span>
                    {userCanManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddMemberDeptId(dept.id);
                          setSelectedUserId('');
                          setSelectedRole('MEMBER');
                          setSelectedFunctionIds([]);
                        }}
                        className="text-xs text-primary font-semibold hover:underline"
                      >
                        + Vincular Voluntário
                      </button>
                    )}
                  </div>

                  {dept.members.length === 0 ? (
                    <p className="text-xs text-ink-muted italic">
                      Nenhum voluntário vinculado a este departamento.
                    </p>
                  ) : (
                    <div className="space-y-2 divide-y divide-line">
                      {dept.members.map((member) => (
                        <div
                          key={member.id}
                          className="pt-2 first:pt-0 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-semibold text-ink">{member.userName}</span>
                              {member.role === 'MANAGER' && (
                                <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded">
                                  GESTOR
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {member.functions.length > 0 ? (
                                member.functions.map((f) => (
                                  <span key={f.id} className="text-[11px] text-ink-muted">
                                    • {f.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-ink-muted italic">
                                  Sem função definida
                                </span>
                              )}
                            </div>
                          </div>

                          {userCanManage && (
                            <div className="flex items-center space-x-2 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingMember({
                                    departmentId: dept.id,
                                    userId: member.userId,
                                    userName: member.userName,
                                    role: member.role,
                                    functionIds: member.functions.map((f) => f.id),
                                  })
                                }
                                className="text-xs text-primary hover:underline font-semibold"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingRemoveMember({
                                    departmentId: dept.id,
                                    userId: member.userId,
                                    userName: member.userName,
                                  })
                                }
                                className="text-xs text-ink-muted hover:text-danger font-semibold"
                                title="Desvincular do departamento"
                              >
                                Remover
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Novo Departamento */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
          <div className="bg-surface rounded-surface border border-line max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h2 className="font-display font-bold text-lg text-ink">Novo Departamento</h2>

            <form onSubmit={handleCreateDept} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                  Nome do Departamento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Comunicação e Mídia"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-field-border rounded-control text-sm text-ink"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-3.5 py-1.5 border border-line text-xs font-semibold text-ink-muted rounded-control"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-control hover:opacity-95"
                >
                  {loading ? 'Criando...' : 'Criar Departamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Voluntário à Equipe */}
      {addMemberDeptId && activeDeptForAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
          <div className="bg-surface rounded-surface border border-line max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="font-display font-bold text-lg text-ink">
              Adicionar à Equipe: {activeDeptForAdd.name}
            </h2>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                  Selecione o Voluntário Ativo *
                </label>
                <select
                  required
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-field-border rounded-control text-sm text-ink"
                >
                  <option value="">Selecione um voluntário...</option>
                  {activeUsers
                    .filter((u) => !activeDeptForAdd.members.some((m) => m.userId === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                </select>
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                    Papel no Departamento
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as 'MANAGER' | 'MEMBER')}
                    className="w-full px-3 py-2 bg-surface border border-field-border rounded-control text-sm text-ink"
                  >
                    <option value="MEMBER">Voluntário / Membro</option>
                    <option value="MANAGER">Gestor do Departamento</option>
                  </select>
                </div>
              )}

              {activeDeptForAdd.functions.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                    Funções que desempenha
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {activeDeptForAdd.functions.map((f) => {
                      const isSelected = selectedFunctionIds.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setSelectedFunctionIds((prev) =>
                              prev.includes(f.id)
                                ? prev.filter((id) => id !== f.id)
                                : [...prev, f.id]
                            );
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-control border transition-colors ${
                            isSelected
                              ? 'bg-primary text-white border-primary'
                              : 'bg-bg text-ink-muted border-line'
                          }`}
                        >
                          {f.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setAddMemberDeptId(null)}
                  className="px-3.5 py-2 border border-line text-xs font-semibold text-ink-muted rounded-control"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedUserId}
                  className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-control hover:opacity-95 disabled:opacity-50"
                >
                  {loading ? 'Adicionando...' : 'Adicionar Voluntário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Membro da Equipe */}
      {editingMember && activeDeptForEdit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Editar ${editingMember.userName}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40"
        >
          <div className="bg-surface rounded-surface border border-line max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="font-display font-bold text-lg text-ink">
              Editar: {editingMember.userName}
            </h2>
            <p className="text-xs text-ink-muted">
              Departamento: <strong>{activeDeptForEdit.name}</strong>
            </p>

            <form onSubmit={handleUpdateMember} className="space-y-4">
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                    Papel no Departamento
                  </label>
                  <select
                    value={editingMember.role}
                    onChange={(e) =>
                      setEditingMember((prev) =>
                        prev
                          ? { ...prev, role: e.target.value as 'MANAGER' | 'MEMBER' }
                          : null
                      )
                    }
                    className="w-full px-3 py-2 bg-surface border border-field-border rounded-control text-sm text-ink"
                  >
                    <option value="MEMBER">Voluntário / Membro</option>
                    <option value="MANAGER">Gestor do Departamento</option>
                  </select>
                </div>
              )}

              {activeDeptForEdit.functions.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase mb-1">
                    Funções Internas
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {activeDeptForEdit.functions.map((f) => {
                      const isSelected = editingMember.functionIds.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setEditingMember((prev) => {
                              if (!prev) return null;
                              const funcs = prev.functionIds.includes(f.id)
                                ? prev.functionIds.filter((id) => id !== f.id)
                                : [...prev.functionIds, f.id];
                              return { ...prev, functionIds: funcs };
                            });
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-control border transition-colors ${
                            isSelected
                              ? 'bg-primary text-white border-primary'
                              : 'bg-bg text-ink-muted border-line'
                          }`}
                        >
                          {f.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-3.5 py-2 border border-line text-xs font-semibold text-ink-muted rounded-control"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-control hover:opacity-95"
                >
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingRemoveMember)}
        onClose={() => setPendingRemoveMember(null)}
        onConfirm={() => {
          if (pendingRemoveMember) {
            handleRemoveMember(pendingRemoveMember.departmentId, pendingRemoveMember.userId);
          }
        }}
        title="Desvincular voluntário"
        description={
          pendingRemoveMember
            ? `Deseja realmente desvincular ${pendingRemoveMember.userName} deste departamento?`
            : ''
        }
        confirmLabel="Sim, desvincular"
        loading={loading}
      />
    </div>
  );
}
