'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertBanner } from '@/components/AlertBanner';
import { PushNotificationManager } from '@/components/PushNotificationManager';
import { Warning } from '@/components/Icons';

interface MemberProfileData {
  id: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  birthDate?: string;
  gender?: string;
  maritalStatus?: string;
  phonePrimary?: string;
  phoneSecondary?: string;
  whatsapp?: string;
  address: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  emergencyContact: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  joinedAt?: string;
  preferredChannel: 'WHATSAPP' | 'EMAIL' | 'PUSH' | 'SMS';
  notes?: string;
  globalRole: string;
  status: string;
  optOutWhatsapp: boolean;
  optOutEmail: boolean;
  optOutPush: boolean;
  optOutSms: boolean;
  termsAcceptedAt?: string | null;
  termsVersion?: string | null;
  mfaEnabled?: boolean;
  recoveryCodesCount?: number;
  memberships: {
    departmentName: string;
    role: string;
    functions: string[];
  }[];
}

type TabKey = 'pessoal' | 'contato' | 'endereco' | 'seguranca' | 'privacidade';

function getSafeHttpsImageUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function PerfilClient({ initialData }: { initialData: MemberProfileData }) {
  const [activeTab, setActiveTab] = useState<TabKey>('pessoal');

  // Dados Pessoais
  const [name, setName] = useState(initialData.name);
  const [photoUrl, setPhotoUrl] = useState(initialData.photoUrl || '');
  const [birthDate, setBirthDate] = useState(initialData.birthDate || '');
  const [gender, setGender] = useState(initialData.gender || '');
  const [maritalStatus, setMaritalStatus] = useState(initialData.maritalStatus || '');
  const [joinedAt, setJoinedAt] = useState(initialData.joinedAt || '');
  const [notes, setNotes] = useState(initialData.notes || '');

  // Contato
  const [phonePrimary, setPhonePrimary] = useState(initialData.phonePrimary || '');
  const [phoneSecondary, setPhoneSecondary] = useState(initialData.phoneSecondary || '');
  const [whatsapp, setWhatsapp] = useState(initialData.whatsapp || '');
  const [preferredChannel, setPreferredChannel] = useState<'WHATSAPP' | 'EMAIL' | 'PUSH' | 'SMS'>(
    initialData.preferredChannel
  );

  // Notificações e Opt-outs
  const [optOutWhatsapp, setOptOutWhatsapp] = useState(initialData.optOutWhatsapp);
  const [optOutEmail, setOptOutEmail] = useState(initialData.optOutEmail);
  const [optOutPush, setOptOutPush] = useState(initialData.optOutPush);
  const [optOutSms, setOptOutSms] = useState(initialData.optOutSms);

  // Endereço
  const [street, setStreet] = useState(initialData.address?.street || '');
  const [number, setNumber] = useState(initialData.address?.number || '');
  const [complement, setComplement] = useState(initialData.address?.complement || '');
  const [neighborhood, setNeighborhood] = useState(initialData.address?.neighborhood || '');
  const [city, setCity] = useState(initialData.address?.city || '');
  const [state, setState] = useState(initialData.address?.state || '');
  const [postalCode, setPostalCode] = useState(initialData.address?.postalCode || '');

  // Contato de emergência
  const [emergencyName, setEmergencyName] = useState(initialData.emergencyContact?.name || '');
  const [emergencyRel, setEmergencyRel] = useState(initialData.emergencyContact?.relationship || '');
  const [emergencyPhone, setEmergencyPhone] = useState(initialData.emergencyContact?.phone || '');

  // MFA / 2FA
  const [mfaEnabled, setMfaEnabled] = useState(initialData.mfaEnabled || false);
  const [recoveryCodesCount, setRecoveryCodesCount] = useState(initialData.recoveryCodesCount || 0);

  // Modal de Setup de MFA
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupData, setSetupData] = useState<{
    secret: string;
    formattedSecret: string;
    otpauthUri: string;
    qrCodeDataUrl: string;
    plainRecoveryCodes: string[];
    recoveryCodeHashes: string[];
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [enablingMfa, setEnablingMfa] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Modal de Desativação de MFA
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disablingMfa, setDisablingMfa] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  // Modal de Exclusão de Dados (LGPD)
  const [eraseModalOpen, setEraseModalOpen] = useState(false);
  const [erasePassword, setErasePassword] = useState('');
  const [eraseReason, setEraseReason] = useState('');
  const [eraseLoading, setEraseLoading] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);

  // Estado da UI
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const safePhotoSrc = getSafeHttpsImageUrl(photoUrl);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);

    try {
      // Monta objeto de endereço se preenchido
      let addressPayload: any = null;
      if (street || number || city || state || postalCode) {
        addressPayload = {
          street: street.trim(),
          number: number.trim(),
          complement: complement.trim() || undefined,
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          postalCode: postalCode.trim(),
        };
      }

      // Monta objeto de emergência se preenchido
      let emergencyPayload: any = null;
      if (emergencyName || emergencyPhone) {
        emergencyPayload = {
          name: emergencyName.trim(),
          relationship: emergencyRel.trim(),
          phone: emergencyPhone.trim(),
        };
      }

      const payload = {
        name: name.trim(),
        photoUrl: photoUrl.trim() || null,
        birthDate: birthDate || null,
        gender: gender || null,
        maritalStatus: maritalStatus || null,
        phonePrimary: phonePrimary.trim(),
        phoneSecondary: phoneSecondary.trim() || null,
        whatsapp: whatsapp.trim() || null,
        address: addressPayload,
        emergencyContact: emergencyPayload,
        joinedAt: joinedAt || null,
        preferredChannel,
        notes: notes.trim() || null,
        optOutWhatsapp,
        optOutEmail,
        optOutPush,
        optOutSms,
      };

      const res = await fetch('/api/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage({
          type: 'erro',
          text: data.error || 'Não foi possível atualizar o perfil. Verifique os campos e tente novamente.',
        });
        return;
      }

      setMessage({
        type: 'sucesso',
        text: 'Seu perfil foi atualizado com sucesso!',
      });
    } catch {
      setMessage({
        type: 'erro',
        text: 'Erro de comunicação com o servidor. Verifique sua conexão e tente novamente.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/perfil/exportar');
      if (!response.ok) {
        throw new Error('Falha ao exportar dados.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revezo-meus-dados-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      setMessage({
        type: 'erro',
        text: 'Não foi possível gerar a cópia dos dados no momento. Tente novamente mais tarde.',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleStartMfaSetup = async () => {
    setSetupLoading(true);
    setSetupError(null);
    setVerificationCode('');
    setCopiedSecret(false);
    setCopiedCodes(false);

    try {
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSetupError(data.error || 'Não foi possível gerar a configuração de 2FA.');
        setSetupLoading(false);
        return;
      }
      setSetupData(data);
      setSetupModalOpen(true);
    } catch {
      setSetupError('Erro de conexão ao iniciar configuração.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConfirmEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData || verificationCode.trim().length !== 6) return;

    setEnablingMfa(true);
    setSetupError(null);

    try {
      const res = await fetch('/api/auth/mfa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: verificationCode.trim(),
          secret: setupData.secret,
          recoveryCodeHashes: setupData.recoveryCodeHashes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSetupError(data.error || 'Código incorreto. Confira seu aplicativo autenticador.');
        return;
      }

      setMfaEnabled(true);
      setRecoveryCodesCount(setupData.recoveryCodeHashes.length);
      setSetupModalOpen(false);
      setSetupData(null);
      setMessage({
        type: 'sucesso',
        text: 'Verificação em duas etapas (2FA) ativada com sucesso! Guarde seus códigos de recuperação.',
      });
    } catch {
      setSetupError('Erro de conexão ao ativar verificação em duas etapas.');
    } finally {
      setEnablingMfa(false);
    }
  };

  const handleConfirmDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) return;

    setDisablingMfa(true);
    setDisableError(null);

    try {
      const res = await fetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: disablePassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDisableError(data.error || 'Senha incorreta. Não foi possível desativar o 2FA.');
        return;
      }

      setMfaEnabled(false);
      setRecoveryCodesCount(0);
      setDisableModalOpen(false);
      setDisablePassword('');
      setMessage({
        type: 'sucesso',
        text: 'Verificação em duas etapas desativada.',
      });
    } catch {
      setDisableError('Erro de conexão ao desativar verificação em duas etapas.');
    } finally {
      setDisablingMfa(false);
    }
  };

  const handleConfirmEraseData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!erasePassword) return;

    setEraseLoading(true);
    setEraseError(null);

    try {
      const res = await fetch('/api/perfil/excluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: erasePassword,
          reason: eraseReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setEraseError(data.error || 'Não foi possível processar a exclusão dos dados.');
        return;
      }

      // Redireciona para login informando encerramento
      window.location.href = '/login';
    } catch {
      setEraseError('Erro de conexão ao solicitar exclusão dos dados.');
    } finally {
      setEraseLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2500);
  };

  const handleCopyCodes = () => {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.plainRecoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2500);
  };

  const handleDownloadCodes = () => {
    if (!setupData) return;
    const text = `CÓDIGOS DE RECUPERAÇÃO - ESCALA IGREJA\nConta: ${initialData.email}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nGuarde estes códigos em local seguro. Cada código pode ser usado uma única vez.\n\n` + setupData.plainRecoveryCodes.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `codigos-recuperacao-escala-${initialData.name.toLowerCase().replace(/\s+/g, '-')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Resumo do Perfil e Equipe */}
      <div className="bg-surface rounded-surface border border-line p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="relative w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-display font-bold text-2xl overflow-hidden border-2 border-line">
            {safePhotoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={safePhotoSrc}
                alt={name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h2 className="font-display font-bold text-xl text-ink">{name}</h2>
            <p className="text-sm text-ink-muted">{initialData.email}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-xs bg-bg px-2.5 py-0.5 rounded-control font-semibold text-ink-muted border border-line">
                {initialData.globalRole === 'ADMIN_MASTER'
                  ? 'Administrador Geral'
                  : 'Voluntário'}
              </span>
              {initialData.memberships.map((m, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-primary/10 text-primary px-2.5 py-0.5 rounded-control font-semibold"
                >
                  {m.departmentName}
                  {m.role === 'MANAGER' && ' (Gestor)'}
                  {m.functions.length > 0 && ` • ${m.functions.join(', ')}`}
                </span>
              ))}
            </div>
          </div>
        </div>

        <Link
          href="/disponibilidade"
          className="px-4 py-2 bg-primary/10 hover:bg-primary hover:text-white text-primary text-xs font-semibold rounded-control transition-colors min-h-touch flex items-center justify-center self-start sm:self-center shrink-0"
        >
          Minha Disponibilidade →
        </Link>
      </div>

      {message && <AlertBanner type={message.type} message={message.text} />}

      {/* Abas de Navegação */}
      <div className="flex border-b border-line gap-2 overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('pessoal')}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-control border-b-2 transition-colors min-h-touch ${
            activeTab === 'pessoal'
              ? 'border-primary text-primary bg-surface'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Dados Pessoais
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('contato')}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-control border-b-2 transition-colors min-h-touch ${
            activeTab === 'contato'
              ? 'border-primary text-primary bg-surface'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Contato & Notificações
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('endereco')}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-control border-b-2 transition-colors min-h-touch ${
            activeTab === 'endereco'
              ? 'border-primary text-primary bg-surface'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Endereço & Emergência
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('seguranca')}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-control border-b-2 transition-colors min-h-touch flex items-center space-x-1.5 ${
            activeTab === 'seguranca'
              ? 'border-primary text-primary bg-surface'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <span>Segurança & 2FA</span>
          {initialData.globalRole === 'ADMIN_MASTER' && !mfaEnabled && (
            <span className="w-2 h-2 rounded-full bg-danger inline-block" title="Ação recomendada para administradores" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('privacidade')}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-control border-b-2 transition-colors min-h-touch ${
            activeTab === 'privacidade'
              ? 'border-primary text-primary bg-surface'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Privacidade & LGPD
        </button>
      </div>

      {/* Formulário Principal */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* ABA: DADOS PESSOAIS */}
        {activeTab === 'pessoal' && (
          <div className="bg-surface rounded-surface border border-line p-5 sm:p-6 space-y-4 shadow-sm">
            <h3 className="font-display font-bold text-lg text-ink">Informações Básicas</h3>
            <p className="text-xs text-ink-muted">
              Seus dados pessoais para identificação na escala de voluntários.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  URL da Foto de Perfil
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/sua-foto.jpg"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
                <span className="text-[11px] text-ink-muted block">
                  Insira o link seguro (HTTPS) de sua foto para exibição no aplicativo.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Data de Nascimento
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Sexo
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                >
                  <option value="">Selecione...</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMININO">Feminino</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Estado Civil
                </label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                >
                  <option value="">Selecione...</option>
                  <option value="SOLTEIRO">Solteiro(a)</option>
                  <option value="CASADO">Casado(a)</option>
                  <option value="DIVORCIADO">Divorciado(a)</option>
                  <option value="VIUVO">Viúvo(a)</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Data de Batismo ou Entrada
                </label>
                <input
                  type="date"
                  value={joinedAt}
                  onChange={(e) => setJoinedAt(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Observações ou Restrições
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Restrições alimentares, alergias, necessidades de acessibilidade ou observações para a equipe."
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-[11px] text-ink-muted text-right block">
                  {notes.length}/500 caracteres
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ABA: CONTATO E NOTIFICAÇÕES */}
        {activeTab === 'contato' && (
          <div className="bg-surface rounded-surface border border-line p-5 sm:p-6 space-y-6 shadow-sm">
            <div>
              <h3 className="font-display font-bold text-lg text-ink">Telefones e WhatsApp</h3>
              <p className="text-xs text-ink-muted">
                Dados de contato usados para avisos e convocações da escala.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Telefone Principal (Celular) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="+5511999998888"
                  value={phonePrimary}
                  onChange={(e) => setPhonePrimary(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
                <span className="text-[11px] text-ink-muted block">
                  Formato internacional com código do país (ex.: +55...)
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  WhatsApp (se diferente do principal)
                </label>
                <input
                  type="text"
                  placeholder="+5511999998888"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Telefone Secundário / Residencial (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="+551133334444"
                  value={phoneSecondary}
                  onChange={(e) => setPhoneSecondary(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2 pt-2">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Canal Preferido de Lembrete
                </label>
                <select
                  value={preferredChannel}
                  onChange={(e) =>
                    setPreferredChannel(e.target.value as 'WHATSAPP' | 'EMAIL' | 'PUSH' | 'SMS')
                  }
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                >
                  <option value="WHATSAPP">WhatsApp (Recomendado)</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="PUSH">Notificação Push (App)</option>
                  <option value="SMS">SMS</option>
                </select>
              </div>
            </div>

            <div className="border-t border-line pt-5 space-y-3">
              <h4 className="font-semibold text-sm text-ink">Preferências de Envio (Opt-out)</h4>
              <p className="text-xs text-ink-muted">
                Você pode desligar canais específicos pelos quais não deseja receber avisos automáticos:
              </p>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!optOutWhatsapp}
                    onChange={(e) => setOptOutWhatsapp(!e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-ink">Receber avisos e lembretes por WhatsApp</span>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!optOutEmail}
                    onChange={(e) => setOptOutEmail(!e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-ink">Receber avisos e escalas por E-mail</span>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!optOutPush}
                    onChange={(e) => setOptOutPush(!e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-ink">Receber notificações Push no celular/navegador</span>
                </label>

                {!optOutPush && (
                  <div className="pt-2">
                    <PushNotificationManager />
                  </div>
                )}

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!optOutSms}
                    onChange={(e) => setOptOutSms(!e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-ink">Receber alertas de emergência por SMS</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ABA: ENDEREÇO E EMERGÊNCIA */}
        {activeTab === 'endereco' && (
          <div className="bg-surface rounded-surface border border-line p-5 sm:p-6 space-y-6 shadow-sm">
            <div>
              <h3 className="font-display font-bold text-lg text-ink">Endereço Residencial</h3>
              <p className="text-xs text-ink-muted">
                Utilizado para organização de caronas e contato pastoral em caso de necessidade.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  CEP
                </label>
                <input
                  type="text"
                  placeholder="00000-000"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Logradouro / Rua
                </label>
                <input
                  type="text"
                  placeholder="Rua, Avenida, Alameda..."
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Número
                </label>
                <input
                  type="text"
                  placeholder="123"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Complemento
                </label>
                <input
                  type="text"
                  placeholder="Apto 101, Bloco B..."
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Bairro
                </label>
                <input
                  type="text"
                  placeholder="Bairro"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Cidade
                </label>
                <input
                  type="text"
                  placeholder="Cidade"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                  Estado (UF)
                </label>
                <input
                  type="text"
                  maxLength={2}
                  placeholder="UF"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>
            </div>

            <div className="border-t border-line pt-5 space-y-4">
              <div>
                <h4 className="font-semibold text-sm text-ink">Contato de Emergência</h4>
                <p className="text-xs text-ink-muted">
                  Pessoa para contato rápido caso ocorra algum imprevisto ou emergência durante o serviço.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                    Nome do Contato
                  </label>
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                    Grau de Parentesco
                  </label>
                  <input
                    type="text"
                    placeholder="Cônjuge, Mãe, Pai, Irmão(ã)..."
                    value={emergencyRel}
                    onChange={(e) => setEmergencyRel(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                    Telefone de Emergência
                  </label>
                  <input
                    type="text"
                    placeholder="+5511999998888"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: SEGURANÇA E 2FA */}
        {activeTab === 'seguranca' && (
          <div className="bg-surface rounded-surface border border-line p-5 sm:p-6 space-y-6 shadow-sm">
            <div>
              <h3 className="font-display font-bold text-lg text-ink">
                Autenticação em Duas Etapas (2FA / TOTP)
              </h3>
              <p className="text-xs text-ink-muted">
                Proteja sua conta exigindo um código gerado no celular além da sua senha ao fazer login.
              </p>
            </div>

            {/* Aviso para ADMIN_MASTER caso MFA não esteja ativo */}
            {initialData.globalRole === 'ADMIN_MASTER' && !mfaEnabled && (
              <div className="p-4 bg-danger-soft border border-danger/30 rounded-control flex items-start space-x-3">
                <Warning size={20} className="text-danger flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-danger-ink">Ação recomendada para Administradores</h4>
                  <p className="text-xs text-danger-ink mt-0.5 leading-relaxed">
                    Por políticas de segurança e privacidade da igreja (LGPD), administradores com acesso geral devem ativar a verificação em duas etapas.
                  </p>
                </div>
              </div>
            )}

            {/* Card com status atual do MFA */}
            <div className="p-5 bg-bg rounded-control border border-line space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-ink">Status da proteção:</span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-control uppercase tracking-wider ${
                        mfaEnabled
                          ? 'bg-success-soft text-success-ink'
                          : 'bg-warning-soft text-warning-ink'
                      }`}
                    >
                      {mfaEnabled ? 'Ativado' : 'Desativado'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    {mfaEnabled
                      ? 'Sua conta está protegida. Ao entrar, solicitaremos o código do seu aplicativo autenticador.'
                      : 'Nenhum segundo fator configurado. Sua conta depende exclusivamente da senha.'}
                  </p>
                </div>

                <div>
                  {mfaEnabled ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDisableError(null);
                        setDisablePassword('');
                        setDisableModalOpen(true);
                      }}
                      className="px-4 py-2 border border-danger text-danger hover:bg-danger hover:text-white text-xs font-semibold rounded-control transition-colors min-h-touch"
                    >
                      Desativar verificação em duas etapas
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartMfaSetup}
                      disabled={setupLoading}
                      className="px-5 py-2.5 bg-primary text-white text-xs font-semibold rounded-control hover:opacity-95 transition-opacity min-h-touch disabled:opacity-50"
                    >
                      {setupLoading ? 'Preparando configuração...' : 'Configurar autenticação em duas etapas'}
                    </button>
                  )}
                </div>
              </div>

              {mfaEnabled && (
                <div className="border-t border-line pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-ink-muted">
                  <span>
                    Códigos de recuperação disponíveis:{' '}
                    <strong className="text-ink font-semibold">{recoveryCodesCount}</strong> de 8
                  </span>
                  <span className="italic">
                    Use os códigos de recuperação caso perca o celular ou fique sem bateria.
                  </span>
                </div>
              )}
            </div>

            {/* Como funciona */}
            <div className="border-t border-line pt-4 space-y-3">
              <h4 className="font-semibold text-sm text-ink">Aplicativos suportados</h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                Você pode usar qualquer aplicativo autenticador padrão do mercado, como <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, <strong>1Password</strong>, <strong>Bitwarden</strong> ou <strong>Authy</strong>.
              </p>
            </div>
          </div>
        )}

        {/* ABA: PRIVACIDADE E LGPD */}
        {activeTab === 'privacidade' && (
          <div className="bg-surface rounded-surface border border-line p-5 sm:p-6 space-y-6 shadow-sm">
            <div>
              <h3 className="font-display font-bold text-lg text-ink">Privacidade e Proteção de Dados (LGPD)</h3>
              <p className="text-xs text-ink-muted">
                Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem controle total sobre suas informações.
              </p>
            </div>

            <div className="bg-bg rounded-control p-4 border border-line space-y-3">
              <h4 className="font-semibold text-sm text-ink">Direito de Portabilidade de Dados (Art. 18)</h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                Você pode baixar a qualquer momento uma cópia estruturada de todos os seus dados cadastrais, histórico de escalas, participações e departamentos vinculados.
              </p>
              <button
                type="button"
                onClick={handleExportData}
                disabled={exporting}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-surface border border-line text-ink font-semibold text-xs rounded-control hover:bg-line/20 transition-colors min-h-touch"
              >
                {exporting ? 'Gerando arquivo...' : 'Baixar cópia dos meus dados (JSON)'}
              </button>
            </div>

            {/* Direito de Eliminação de Dados (Art. 18 LGPD) */}
            <div className="bg-bg rounded-control p-4 border border-danger/30 space-y-3">
              <h4 className="font-semibold text-sm text-danger-ink">Direito de Eliminação e Anonimização (Art. 18)</h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                Você pode solicitar o encerramento da sua conta e a eliminação definitiva dos seus dados pessoais. Informações cadastrais serão apagadas e os registros de escalas anteriores serão anonimizados para preservar o histórico interno da igreja sem reter dados identificáveis.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEraseError(null);
                  setErasePassword('');
                  setEraseReason('');
                  setEraseModalOpen(true);
                }}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-surface border border-danger/40 text-danger hover:bg-danger hover:text-white font-semibold text-xs rounded-control transition-colors min-h-touch"
              >
                Solicitar eliminação dos meus dados
              </button>
            </div>

            <div className="border-t border-line pt-4 space-y-2">
              <h4 className="font-semibold text-sm text-ink">Consentimento e Termos</h4>
              <p className="text-xs text-ink-muted">
                {initialData.termsAcceptedAt ? (
                  <>
                    Termos de privacidade aceitos em{' '}
                    <span className="font-semibold text-ink">
                      {new Date(initialData.termsAcceptedAt).toLocaleDateString('pt-BR')}
                    </span>{' '}
                    (Versão {initialData.termsVersion || '1.0'}).
                  </>
                ) : (
                  'Termos pendentes de confirmação.'
                )}
              </p>
              <p className="text-xs text-ink-muted">
                Seus dados de contato só ficam visíveis para a liderança e gestores dos departamentos aos quais você pertence. Outros voluntários veem apenas seu nome e função na escala.
              </p>
            </div>
          </div>
        )}

        {/* Botão de Submissão Fixo (apenas nas abas de formulário) */}
        {activeTab !== 'seguranca' && (
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-primary text-white font-semibold text-sm rounded-control hover:opacity-95 transition-opacity min-h-touch disabled:opacity-50"
            >
              {saving ? 'Salvando alterações...' : 'Salvar alterações'}
            </button>
          </div>
        )}
      </form>

      {/* Modal de Setup do MFA */}
      {setupModalOpen && setupData && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Configurar Autenticação em Duas Etapas"
          className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-surface rounded-surface border border-line max-w-lg w-full p-6 shadow-xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="font-display font-bold text-xl text-ink">
                Configurar Autenticação em Duas Etapas (2FA)
              </h3>
              <p className="text-xs text-ink-muted mt-1">
                Conclua os 3 passos abaixo para vincular seu aplicativo autenticador.
              </p>
            </div>

            {setupError && <AlertBanner type="erro" message={setupError} />}

            {/* Passo 1 */}
            <div className="space-y-3 bg-bg p-4 rounded-control border border-line">
              <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                Passo 1: Escaneie o QR Code
              </span>
              <p className="text-xs text-ink-muted leading-relaxed">
                Abra seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password, etc.) e aponte a câmera:
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                <div className="bg-white p-2 rounded-control border border-line shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={setupData.qrCodeDataUrl}
                    alt="QR Code para Autenticador"
                    className="w-36 h-36 object-contain"
                  />
                </div>
                <div className="space-y-2 text-center sm:text-left">
                  <span className="text-xs text-ink-muted block">
                    Não consegue escanear? Digite o código manualmente:
                  </span>
                  <div className="bg-surface px-3 py-1.5 rounded-control border border-line font-mono text-xs font-bold text-ink select-all break-all">
                    {setupData.formattedSecret}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    {copiedSecret ? 'Chave copiada!' : 'Copiar chave'}
                  </button>
                </div>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="space-y-3 bg-bg p-4 rounded-control border border-line">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                  Passo 2: Guarde seus códigos de recuperação
                </span>
                <span className="text-[11px] font-bold text-danger uppercase tracking-wider">
                  Muito importante
                </span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Se você perder o celular, estes códigos permitirão recuperar o acesso. Cada código só funciona 1 vez:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs text-center font-bold text-ink bg-surface p-3 rounded-control border border-line">
                {setupData.plainRecoveryCodes.map((code, idx) => (
                  <div key={idx} className="p-1 bg-bg rounded select-all">
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex items-center space-x-3 pt-1">
                <button
                  type="button"
                  onClick={handleCopyCodes}
                  className="px-3 py-1.5 bg-surface border border-line text-ink text-xs font-semibold rounded-control hover:bg-line/20 min-h-touch transition-colors"
                >
                  {copiedCodes ? 'Códigos copiados!' : 'Copiar todos'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCodes}
                  className="px-3 py-1.5 bg-surface border border-line text-ink text-xs font-semibold rounded-control hover:bg-line/20 min-h-touch transition-colors"
                >
                  Baixar arquivo (.txt)
                </button>
              </div>
            </div>

            {/* Passo 3 */}
            <form onSubmit={handleConfirmEnableMfa} className="space-y-4">
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                  Passo 3: Digite o código de 6 dígitos gerado
                </span>
                <p className="text-xs text-ink-muted">
                  Digite o código exibido agora no aplicativo para confirmar:
                </p>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-3 bg-bg rounded-control border border-primary text-ink text-center font-mono text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSetupModalOpen(false);
                    setSetupData(null);
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-ink-muted hover:text-ink min-h-touch"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enablingMfa || verificationCode.length !== 6}
                  className="px-5 py-2.5 bg-primary text-white text-xs font-semibold rounded-control hover:opacity-95 transition-opacity disabled:opacity-50 min-h-touch"
                >
                  {enablingMfa ? 'Confirmando...' : 'Confirmar e ativar 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Desativação do MFA */}
      {disableModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Desativar verificação em duas etapas"
          className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-surface rounded-surface border border-line max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="font-display font-bold text-lg text-ink">
                Desativar verificação em duas etapas
              </h3>
              <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                Tem certeza? Sua conta ficará protegida apenas por senha. Para confirmar, digite sua senha atual:
              </p>
            </div>

            {disableError && <AlertBanner type="erro" message={disableError} />}

            <form onSubmit={handleConfirmDisableMfa} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink block" htmlFor="disable-pass">
                  Sua senha atual
                </label>
                <input
                  id="disable-pass"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDisableModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-ink-muted hover:text-ink min-h-touch"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={disablingMfa || !disablePassword}
                  className="px-5 py-2.5 bg-danger text-white text-xs font-semibold rounded-control hover:opacity-95 transition-opacity disabled:opacity-50 min-h-touch"
                >
                  {disablingMfa ? 'Desativando...' : 'Confirmar desativação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão de Dados (LGPD) */}
      {eraseModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar Dados da Conta (LGPD)"
          className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-surface rounded-surface border border-line max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="font-display font-bold text-lg text-danger">
                Eliminar Dados da Conta (LGPD)
              </h3>
              <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                Esta ação é irreversível. Todos os seus dados cadastrais (telefones, endereços, notas e acessos) serão removidos permanentemente. Para confirmar, digite sua senha:
              </p>
            </div>

            {eraseError && <AlertBanner type="erro" message={eraseError} />}

            <form onSubmit={handleConfirmEraseData} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink block" htmlFor="erase-pass">
                  Sua senha atual *
                </label>
                <input
                  id="erase-pass"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={erasePassword}
                  onChange={(e) => setErasePassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-danger min-h-touch"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-muted block" htmlFor="erase-reason">
                  Motivo da saída (opcional)
                </label>
                <input
                  id="erase-reason"
                  type="text"
                  placeholder="Ex: Mudança de congregação, saída da equipe..."
                  value={eraseReason}
                  onChange={(e) => setEraseReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg rounded-control border border-line text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEraseModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-ink-muted hover:text-ink min-h-touch"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={eraseLoading || !erasePassword}
                  className="px-5 py-2.5 bg-danger text-white text-xs font-semibold rounded-control hover:opacity-95 transition-opacity disabled:opacity-50 min-h-touch"
                >
                  {eraseLoading ? 'Excluindo...' : 'Confirmar exclusão definitiva'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
