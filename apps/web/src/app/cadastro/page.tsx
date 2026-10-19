'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertBanner } from '@/components/AlertBanner';
import { Check } from '@/components/Icons';
export default function RegisterPage() {
  const [churches, setChurches] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [formData, setFormData] = useState({
    churchId: '',
    name: '',
    email: '',
    password: '',
    birthDate: '',
    gender: 'MASCULINO',
    maritalStatus: 'SOLTEIRO',
    phonePrimary: '+55',
    phoneSecondary: '',
    whatsapp: '+55',
    street: '',
    number: '',
    neighborhood: '',
    city: 'Goiânia',
    state: 'GO',
    postalCode: '',
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '+55',
    joinedAt: '',
    preferredChannel: 'WHATSAPP',
    notes: '',
    isMinor: false,
    guardianName: '',
    guardianPhone: '+55',
    termsAccepted: false,
  });

  React.useEffect(() => {
    fetch('/api/public/igrejas')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.churches) {
          setChurches(data.churches);
          if (data.churches.length > 0) {
            setFormData((prev) => ({ ...prev, churchId: prev.churchId || data.churches[0].id }));
          }
        }
      })
      .catch(() => {});
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!formData.termsAccepted) {
      setError('Você deve concordar com os termos de privacidade para prosseguir.');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        birthDate: formData.birthDate || undefined,
        gender: formData.gender,
        maritalStatus: formData.maritalStatus,
        phonePrimary: formData.phonePrimary,
        phoneSecondary: formData.phoneSecondary || undefined,
        whatsapp: formData.whatsapp || undefined,
        address: formData.street
          ? {
              street: formData.street,
              number: formData.number,
              neighborhood: formData.neighborhood,
              city: formData.city,
              state: formData.state,
              postalCode: formData.postalCode || '74000-000',
            }
          : undefined,
        emergencyContact: formData.emergencyName
          ? {
              name: formData.emergencyName,
              relationship: formData.emergencyRelationship,
              phone: formData.emergencyPhone,
            }
          : undefined,
        joinedAt: formData.joinedAt || undefined,
        preferredChannel: formData.preferredChannel,
        churchId: formData.churchId || undefined,
        notes: formData.notes || undefined,
        isMinor: formData.isMinor,
        guardianName: formData.isMinor ? formData.guardianName : undefined,
        guardianPhone: formData.isMinor ? formData.guardianPhone : undefined,
        termsAccepted: formData.termsAccepted,
      };

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Ocorreu um erro no envio do cadastro.');
        return;
      }

      setSuccessMessage(data.message || 'Cadastro enviado com sucesso!');
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (successMessage) {
    return (
      <div className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4">
        <div className="max-w-md w-full bg-surface p-8 rounded-surface border border-line shadow-sm text-center">
          <div className="w-16 h-16 bg-success-soft text-success rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} />
          </div>
          <h1 className="font-display font-bold text-2xl text-ink mb-2">Cadastro Enviado!</h1>
          <p className="text-sm text-ink-muted mb-6 leading-relaxed">
            {successMessage}
          </p>
          <Link
            href="/login"
            className="inline-block w-full py-3 px-4 bg-primary text-on-primary font-semibold rounded-control hover:opacity-95 text-center min-h-touch"
          >
            Voltar para o Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
      <div className="bg-surface p-6 sm:p-8 rounded-surface border border-line shadow-sm">
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-2xl text-ink">Cadastro de Voluntário</h1>
          <p className="text-sm text-ink-muted mt-1">Preencha seus dados para servir nos departamentos</p>
        </div>

        {error && (
          <div className="mb-6">
            <AlertBanner type="erro" message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção 1: Dados de Acesso e Congregação */}
          <div className="border-b border-line pb-6">
            <h2 className="text-base font-bold font-display text-ink mb-4">Dados de Acesso e Congregação</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {churches.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-ink mb-1" htmlFor="churchId">
                    Sua Congregação / Igreja Local *
                  </label>
                  <select
                    id="churchId"
                    name="churchId"
                    required
                    value={formData.churchId}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  >
                    <option value="">Selecione sua congregação</option>
                    {churches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="name">
                  Nome Completo *
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  placeholder="Seu nome completo"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="email">
                  E-mail *
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  placeholder="exemplo@igreja.org.br"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="password">
                  Senha (mínimo 12 caracteres) *
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  placeholder="••••••••••••"
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Contatos */}
          <div className="border-b border-line pb-6">
            <h2 className="text-base font-bold font-display text-ink mb-4">Telefones e Comunicação</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="phonePrimary">
                  Telefone Principal (com DDD) *
                </label>
                <input
                  id="phonePrimary"
                  name="phonePrimary"
                  type="text"
                  required
                  value={formData.phonePrimary}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  placeholder="+5562999990000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="whatsapp">
                  WhatsApp (com DDD)
                </label>
                <input
                  id="whatsapp"
                  name="whatsapp"
                  type="text"
                  value={formData.whatsapp}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  placeholder="+5562999990000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="preferredChannel">
                  Canal de Notificação Preferido
                </label>
                <select
                  id="preferredChannel"
                  name="preferredChannel"
                  value={formData.preferredChannel}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="PUSH">Notificação no Celular (Push)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="birthDate">
                  Data de Nascimento
                </label>
                <input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                />
              </div>
            </div>
          </div>

          {/* Seção 3: Contato de Emergência */}
          <div className="border-b border-line pb-6">
            <h2 className="text-base font-bold font-display text-ink mb-4">Contato de Emergência</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="emergencyName">
                  Nome do Contato
                </label>
                <input
                  id="emergencyName"
                  name="emergencyName"
                  type="text"
                  value={formData.emergencyName}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  placeholder="Nome do parente"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="emergencyRelationship">
                  Parentesco
                </label>
                <input
                  id="emergencyRelationship"
                  name="emergencyRelationship"
                  type="text"
                  value={formData.emergencyRelationship}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  placeholder="Ex: Cônjuge, Mãe, Irmão"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="emergencyPhone">
                  Telefone de Emergência
                </label>
                <input
                  id="emergencyPhone"
                  name="emergencyPhone"
                  type="text"
                  value={formData.emergencyPhone}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                  placeholder="+5562988880000"
                />
              </div>
            </div>
          </div>

          {/* Consentimento de Menor de Idade (LGPD Art. 14) */}
          <div className="border-b border-line pb-6 space-y-4">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="isMinor"
                checked={formData.isMinor}
                onChange={handleChange}
                className="mt-1 h-5 w-5 text-primary rounded border-field-border focus:ring-primary"
              />
              <span className="text-sm font-semibold text-ink">
                Sou menor de 18 anos (requer ciência e consentimento de responsável legal)
              </span>
            </label>

            {formData.isMinor && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                <div>
                  <label className="block text-sm font-semibold text-ink mb-1" htmlFor="guardianName">
                    Nome do Responsável Legal *
                  </label>
                  <input
                    id="guardianName"
                    name="guardianName"
                    type="text"
                    required={formData.isMinor}
                    value={formData.guardianName}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                    placeholder="Nome completo do pai, mãe ou tutor"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-ink mb-1" htmlFor="guardianPhone">
                    Telefone do Responsável (com DDD) *
                  </label>
                  <input
                    id="guardianPhone"
                    name="guardianPhone"
                    type="text"
                    required={formData.isMinor}
                    value={formData.guardianPhone}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-surface border border-field-border rounded-control text-ink text-base focus:ring-2 focus:ring-primary min-h-touch"
                    placeholder="+5562999990000"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Termos de Privacidade e Consentimento LGPD */}
          <div className="pt-2">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="termsAccepted"
                required
                checked={formData.termsAccepted}
                onChange={handleChange}
                className="mt-1 h-5 w-5 text-primary rounded border-field-border focus:ring-primary"
              />
              <span className="text-sm text-ink-muted leading-relaxed">
                Concordo em disponibilizar meus dados para fins exclusivos de escala e organização dos ministérios da igreja, em conformidade com a Lei Geral de Proteção de Dados (LGPD).
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary text-on-primary font-semibold rounded-control hover:opacity-95 transition-opacity disabled:opacity-50 min-h-touch text-base"
          >
            {loading ? 'Enviando cadastro...' : 'Enviar cadastro para aprovação'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-line text-center">
          <p className="text-sm text-ink-muted">
            Já possui cadastro aprovado?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
