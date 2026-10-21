'use client';

import React, { useState } from 'react';
import { AlertBanner } from '@/components/AlertBanner';
import { Church, UsersThree, SquaresFour, CalendarBlank, MapPin, Phone, CheckCircle, ArrowsLeftRight, Gear, Cross, X } from '@/components/Icons';

export interface PastorOption {
  id: string;
  name: string;
  email: string;
}

export interface ChurchListItem {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  active: boolean;
  address?: {
    logradouro: string;
    numero: string;
    complemento?: string | null;
    bairro: string;
    cidade: string;
    uf: string;
    cep?: string | null;
  } | null;
  pastors: PastorOption[];
  counts: {
    members: number;
    departments: number;
    programs: number;
  };
}

interface IgrejasClientProps {
  initialChurches: ChurchListItem[];
  availablePastors: PastorOption[];
  activeChurchId?: string;
  userRole: string;
  userId: string;
}

const ESTADOS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function IgrejasClient({
  initialChurches,
  availablePastors,
  activeChurchId: currentActiveId,
  userRole,
  userId,
}: IgrejasClientProps) {
  const [churches, setChurches] = useState<ChurchListItem[]>(initialChurches);
  const [activeChurchId, setActiveChurchId] = useState<string | undefined>(currentActiveId);
  const [showModal, setShowModal] = useState(false);
  const [editingChurch, setEditingChurch] = useState<ChurchListItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);

  // Campos do formulário
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1E40AF');
  const [secondaryColor, setSecondaryColor] = useState('#F59E0B');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('GO');
  const [cep, setCep] = useState('');
  const [selectedPastorIds, setSelectedPastorIds] = useState<string[]>([]);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  const isMaster = userRole === 'ADMIN_MASTER';

  const resetForm = () => {
    setEditingChurch(null);
    setName('');
    setSlug('');
    setPhone('');
    setPrimaryColor('#1E40AF');
    setSecondaryColor('#F59E0B');
    setLogradouro('');
    setNumero('');
    setComplemento('');
    setBairro('');
    setCidade('');
    setUf('GO');
    setCep('');
    setSelectedPastorIds([]);
    setIsSlugManuallyEdited(false);
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEditModal = (church: ChurchListItem) => {
    setEditingChurch(church);
    setName(church.name);
    setSlug(church.slug);
    setPhone(church.phone || '');
    setPrimaryColor(church.primaryColor);
    setSecondaryColor(church.secondaryColor);
    setLogradouro(church.address?.logradouro || '');
    setNumero(church.address?.numero || '');
    setComplemento(church.address?.complemento || '');
    setBairro(church.address?.bairro || '');
    setCidade(church.address?.cidade || '');
    setUf(church.address?.uf || 'GO');
    setCep(church.address?.cep || '');
    setSelectedPastorIds(church.pastors.map((p) => p.id));
    setIsSlugManuallyEdited(true);
    setShowModal(true);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!isSlugManuallyEdited && !editingChurch) {
      setSlug(generateSlug(val));
    }
  };

  const handlePastorToggle = (pId: string) => {
    setSelectedPastorIds((prev) =>
      prev.includes(pId) ? prev.filter((id) => id !== pId) : [...prev, pId]
    );
  };

  const handleSwitchChurch = async (churchId: string) => {
    setSwitchingId(churchId);
    setMessage(null);
    try {
      const res = await fetch('/api/igrejas/alternar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveChurchId(churchId);
        setMessage({ type: 'sucesso', text: 'Congregação ativa alterada com sucesso! Recarregando...' });
        setTimeout(() => {
          window.location.reload();
        }, 600);
      } else {
        setMessage({ type: 'erro', text: data.error || 'Erro ao alternar congregação' });
      }
    } catch {
      setMessage({ type: 'erro', text: 'Erro de conexão ao alternar congregação' });
    } finally {
      setSwitchingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const hasAddress = logradouro || numero || bairro || cidade;
    const addressPayload = hasAddress
      ? {
          logradouro: logradouro.trim(),
          numero: numero.trim(),
          complemento: complemento.trim() || null,
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          uf: uf.trim().toUpperCase(),
          cep: cep.trim() || null,
        }
      : null;

    try {
      if (editingChurch) {
        // Atualização
        const res = await fetch('/api/igrejas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            churchId: editingChurch.id,
            name: name.trim(),
            slug: slug.trim(),
            phone: phone.trim() || null,
            primaryColor,
            secondaryColor,
            address: addressPayload,
            pastorIds: isMaster ? selectedPastorIds : undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Erro ao atualizar congregação');
        }

        setChurches((prev) =>
          prev.map((c) =>
            c.id === editingChurch.id
              ? {
                  ...c,
                  name: data.church.name,
                  slug: data.church.slug,
                  phone: data.church.phone,
                  primaryColor: data.church.primaryColor,
                  secondaryColor: data.church.secondaryColor,
                  address: data.church.address,
                  pastors: isMaster
                    ? availablePastors.filter((p) => selectedPastorIds.includes(p.id))
                    : c.pastors,
                }
              : c
          )
        );

        setMessage({ type: 'sucesso', text: `Congregação '${name}' atualizada com sucesso!` });
        setShowModal(false);
      } else {
        // Criação
        const res = await fetch('/api/igrejas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            slug: slug.trim(),
            phone: phone.trim() || null,
            primaryColor,
            secondaryColor,
            address: addressPayload,
            pastorIds: isMaster ? selectedPastorIds : undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Erro ao cadastrar congregação');
        }

        const newChurchItem: ChurchListItem = {
          id: data.church.id,
          name: data.church.name,
          slug: data.church.slug,
          phone: data.church.phone,
          logoUrl: data.church.logoUrl,
          primaryColor: data.church.primaryColor,
          secondaryColor: data.church.secondaryColor,
          active: data.church.active,
          address: data.church.address,
          pastors: isMaster
            ? availablePastors.filter((p) => selectedPastorIds.includes(p.id))
            : [{ id: userId, name: 'Você (Pastor)', email: '' }],
          counts: {
            members: 0,
            departments: 0,
            programs: 0,
          },
        };

        setChurches((prev) => [...prev, newChurchItem]);
        setMessage({ type: 'sucesso', text: `Congregação '${name}' cadastrada com sucesso!` });
        setShowModal(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar requisição';
      setMessage({ type: 'erro', text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Congregações</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {churches.length} {churches.length === 1 ? 'igreja' : 'igrejas'}
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Gerencie congregações, identidade visual, endereços e a equipe pastoral responsável.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-primary-dark transition-colors"
        >
          <Church size={18} weight="bold" />
          <span>Nova Congregação</span>
        </button>
      </div>

      {/* Alerta de Feedback */}
      {message && (
        <AlertBanner
          type={message.type}
          message={message.text}
        />
      )}

      {/* Grid de Congregações */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {churches.map((church) => {
          const isActive = church.id === activeChurchId;

          return (
            <div
              key={church.id}
              className={`bg-surface rounded-xl border transition-all duration-200 shadow-sm flex flex-col justify-between overflow-hidden ${
                isActive ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-border-hover'
              }`}
            >
              <div>
                {/* Faixa decorativa com as cores da igreja */}
                <div
                  className="h-3 w-full"
                  style={{
                    background: `linear-gradient(90deg, ${church.primaryColor} 0%, ${church.secondaryColor} 100%)`,
                  }}
                />

                <div className="p-5 space-y-4">
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display font-bold text-lg text-ink line-clamp-1">
                          {church.name}
                        </h2>
                      </div>
                      <span className="text-xs text-ink-muted font-mono">
                        /{church.slug}
                      </span>
                    </div>

                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle size={12} weight="fill" />
                        <span>Ativa</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-elevated text-ink-muted border border-border">
                        {church.active ? 'Habilitada' : 'Inativa'}
                      </span>
                    )}
                  </div>

                  {/* Informações de Endereço e Contato */}
                  <div className="text-xs text-ink-muted space-y-1.5 pt-1 border-t border-border">
                    {church.address ? (
                      <div className="flex items-start gap-1.5">
                        <MapPin size={15} className="text-ink-muted shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          {church.address.logradouro}, {church.address.numero}
                          {church.address.bairro ? ` - ${church.address.bairro}` : ''}, {church.address.cidade}/{church.address.uf}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-ink-muted/60 italic">
                        <MapPin size={14} />
                        <span>Endereço não informado</span>
                      </div>
                    )}

                    {church.phone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone size={14} className="text-ink-muted shrink-0" />
                        <span>{church.phone}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Pastores Responsáveis */}
                  <div className="pt-2 border-t border-border">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                      Pastores Vinculados
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {church.pastors.length > 0 ? (
                        church.pastors.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-control bg-bg text-ink border border-line"
                          >
                            <Cross size={12} className="text-primary flex-shrink-0" />
                            <span>{p.name}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-ink-muted/70 italic">
                          Nenhum pastor vinculado
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Estatísticas Rápidas */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border text-center">
                    <div className="bg-surface-elevated/50 p-2 rounded-lg">
                      <div className="flex items-center justify-center gap-1 text-ink-muted text-xs">
                        <UsersThree size={14} />
                      </div>
                      <span className="font-bold text-sm text-ink">{church.counts.members}</span>
                      <p className="text-[10px] text-ink-muted">Membros</p>
                    </div>

                    <div className="bg-surface-elevated/50 p-2 rounded-lg">
                      <div className="flex items-center justify-center gap-1 text-ink-muted text-xs">
                        <SquaresFour size={14} />
                      </div>
                      <span className="font-bold text-sm text-ink">{church.counts.departments}</span>
                      <p className="text-[10px] text-ink-muted">Depts</p>
                    </div>

                    <div className="bg-surface-elevated/50 p-2 rounded-lg">
                      <div className="flex items-center justify-center gap-1 text-ink-muted text-xs">
                        <CalendarBlank size={14} />
                      </div>
                      <span className="font-bold text-sm text-ink">{church.counts.programs}</span>
                      <p className="text-[10px] text-ink-muted">Programas</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ações do Card */}
              <div className="p-4 bg-surface-elevated/30 border-t border-border flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenEditModal(church)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink bg-surface border border-border rounded-lg hover:bg-surface-elevated transition-colors"
                >
                  <Gear size={14} />
                  <span>Editar</span>
                </button>

                {isActive ? (
                  <span className="text-xs font-medium text-primary px-2 py-1">
                    Selecionada no Seletor
                  </span>
                ) : (
                  <button
                    onClick={() => handleSwitchChurch(church.id)}
                    disabled={switchingId === church.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <ArrowsLeftRight size={14} />
                    <span>{switchingId === church.id ? 'Alternando...' : 'Alternar para esta'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Criação / Edição de Congregação */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-surface rounded-2xl border border-border shadow-xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="font-display font-bold text-xl text-ink">
                  {editingChurch ? 'Editar Congregação' : 'Nova Congregação'}
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Preencha os dados e a identidade visual da congregação.
                </p>
              </div>

              <button
                onClick={() => setShowModal(false)}
                aria-label="Fechar" className="text-ink-muted hover:text-ink p-1 min-h-touch min-w-touch flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Dados Básicos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Nome da Congregação *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={handleNameChange}
                    placeholder="Ex: Igreja Esperança Viva - Setor Sul"
                    className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Slug Identificador (URL) *
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      setIsSlugManuallyEdited(true);
                    }}
                    placeholder="ex: esperanca-viva-setor-sul"
                    className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-ink font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Telefone de Contato
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+55 62 98888-7777"
                    className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Endereço */}
              <div className="border-t border-border pt-3 space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
                  Endereço da Igreja
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-ink mb-1">Logradouro (Rua / Av.)</label>
                    <input
                      type="text"
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value)}
                      placeholder="Av. Central"
                      className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">Número</label>
                    <input
                      type="text"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      placeholder="123"
                      className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">Complemento</label>
                    <input
                      type="text"
                      value={complemento}
                      onChange={(e) => setComplemento(e.target.value)}
                      placeholder="Sala 2, Bloco B"
                      className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">Bairro</label>
                    <input
                      type="text"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      placeholder="Centro"
                      className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">CEP</label>
                    <input
                      type="text"
                      value={cep}
                      onChange={(e) => setCep(e.target.value)}
                      placeholder="74000-000"
                      className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-ink mb-1">Cidade</label>
                    <input
                      type="text"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      placeholder="Goiânia"
                      className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">Estado (UF)</label>
                    <select
                      value={uf}
                      onChange={(e) => setUf(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {ESTADOS_BRASIL.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Identidade Visual */}
              <div className="border-t border-border pt-3 space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
                  Identidade Visual e Cores
                </span>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">Cor Primária</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-9 h-9 p-0.5 border border-border rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-mono border border-border rounded bg-surface text-ink"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">Cor Secundária</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-9 h-9 p-0.5 border border-border rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-mono border border-border rounded bg-surface text-ink"
                      />
                    </div>
                  </div>
                </div>

                {/* Prévia da Barra de Identidade Visual */}
                <div className="p-3 bg-surface-elevated/40 border border-border rounded-lg flex items-center justify-between">
                  <span className="text-xs text-ink-muted font-medium">Prévia da Identidade Visual:</span>
                  <div
                    className="h-4 w-32 rounded-full shadow-inner"
                    style={{
                      background: `linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                    }}
                  />
                </div>
              </div>

              {/* Equipe Pastoral Responsável (Visível apenas para ADMIN_MASTER) */}
              {isMaster && (
                <div className="border-t border-border pt-3 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
                    Equipe Pastoral Responsável
                  </span>
                  <p className="text-xs text-ink-muted">
                    Selecione quais pastores terão permissão de gestão nesta congregação:
                  </p>

                  <div className="max-h-32 overflow-y-auto space-y-1.5 p-2 bg-surface-elevated/30 border border-border rounded-lg">
                    {availablePastors.length > 0 ? (
                      availablePastors.map((pastor) => (
                        <label
                          key={pastor.id}
                          className="flex items-center gap-2 text-xs text-ink cursor-pointer hover:bg-surface-elevated/50 p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPastorIds.includes(pastor.id)}
                            onChange={() => handlePastorToggle(pastor.id)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="font-medium">{pastor.name}</span>
                          <span className="text-ink-muted text-[11px]">({pastor.email})</span>
                        </label>
                      ))
                    ) : (
                      <span className="text-xs text-ink-muted italic">
                        Nenhum pastor ativo cadastrado no sistema.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {!isMaster && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-ink-muted italic">
                    ℹ️ Como Pastor criador, esta nova congregação será automaticamente vinculada à sua gestão pastoral.
                  </p>
                </div>
              )}

              {/* Botões do Rodapé */}
              <div className="border-t border-border pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-ink bg-surface border border-border rounded-lg hover:bg-surface-elevated transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : editingChurch ? 'Salvar Alterações' : 'Criar Congregação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
