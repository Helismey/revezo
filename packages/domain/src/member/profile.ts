/**
 * Módulo de domínio para gestão e privacidade do perfil do membro (LGPD).
 */
import {
  decryptSensitiveJson,
  decryptEmergencyContact,
  decryptOptionalString,
} from '../crypto/aes.js';

export interface ProfileDateValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida a coerência cronológica de datas pessoais (nascimento e batismo/entrada).
 */
export function validateProfileDates(
  birthDateStr?: string | null,
  joinedAtStr?: string | null,
  referenceDate = new Date()
): ProfileDateValidationResult {
  if (birthDateStr) {
    const birthDate = new Date(`${birthDateStr}T00:00:00Z`);
    if (isNaN(birthDate.getTime())) {
      return { valid: false, error: 'Data de nascimento inválida.' };
    }
    if (birthDate > referenceDate) {
      return { valid: false, error: 'Data de nascimento não pode estar no futuro.' };
    }
  }

  if (joinedAtStr) {
    const joinedAt = new Date(`${joinedAtStr}T00:00:00Z`);
    if (isNaN(joinedAt.getTime())) {
      return { valid: false, error: 'Data de entrada ou batismo inválida.' };
    }
    if (joinedAt > referenceDate) {
      return { valid: false, error: 'Data de entrada ou batismo não pode estar no futuro.' };
    }

    if (birthDateStr) {
      const birthDate = new Date(`${birthDateStr}T00:00:00Z`);
      if (joinedAt < birthDate) {
        return {
          valid: false,
          error: 'A data de entrada ou batismo não pode ser anterior à data de nascimento.',
        };
      }
    }
  }

  return { valid: true };
}

export interface MemberExportSource {
  id: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  birthDate?: Date | string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  phonePrimary?: string | null;
  phoneSecondary?: string | null;
  whatsapp?: string | null;
  address?: unknown;
  emergencyContact?: unknown;
  joinedAt?: Date | string | null;
  preferredChannel?: string | null;
  notes?: string | null;
  status: string;
  createdAt: Date | string;
  optOutWhatsapp: boolean;
  optOutEmail: boolean;
  optOutPush: boolean;
  optOutSms: boolean;
  termsAcceptedAt?: Date | string | null;
  termsVersion?: string | null;
  memberships?: {
    role: string;
    department: { name: string };
    functions: { function: { name: string } }[];
  }[];
  assignments?: {
    id: string;
    status: string;
    createdAt: Date | string;
    slot: {
      title: string;
      startsAt: Date | string;
      endsAt: Date | string;
      program: { title: string; date: Date | string };
      department: { name: string };
    };
  }[];
  availabilities?: {
    kind: string;
    weekday?: number | null;
    from?: Date | string | null;
    to?: Date | string | null;
  }[];
}

/**
 * Prepara os dados pessoais do membro para exportação/portabilidade (Art. 18 da LGPD).
 * NUNCA exporta hashes de senha, segredos TOTP/MFA ou tokens de autenticação.
 */
export function exportMemberData(user: MemberExportSource, encryptionKey?: string | null) {
  const decryptedAddress =
    user.address && typeof user.address === 'object'
      ? decryptSensitiveJson(user.address, encryptionKey) ?? user.address
      : (user.address ?? null);
  const decryptedEmergencyContact =
    user.emergencyContact && typeof user.emergencyContact === 'object'
      ? decryptEmergencyContact(user.emergencyContact, encryptionKey) ?? user.emergencyContact
      : (user.emergencyContact ?? null);
  const decryptedNotes = decryptOptionalString(user.notes, encryptionKey);

  return {
    cabecalho: {
      titulo: 'Exportação de Dados Pessoais — Revezo (LGPD)',
      dataExportacao: new Date().toISOString(),
      versaoEsquema: '1.0',
      direitosDoTitular: 'Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).',
    },
    dadosPessoais: {
      id: user.id,
      nomeCompleto: user.name,
      email: user.email,
      fotoUrl: user.photoUrl ?? null,
      dataNascimento: user.birthDate ? new Date(user.birthDate).toISOString().split('T')[0] : null,
      sexo: user.gender ?? null,
      estadoCivil: user.maritalStatus ?? null,
      dataEntradaOuBatismo: user.joinedAt ? new Date(user.joinedAt).toISOString().split('T')[0] : null,
      observacoes: decryptedNotes,
      statusConta: user.status,
      dataCadastro: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    },
    contato: {
      telefonePrincipal: user.phonePrimary ?? null,
      telefoneSecundario: user.phoneSecondary ?? null,
      whatsapp: user.whatsapp ?? null,
      canalPreferido: user.preferredChannel ?? 'WHATSAPP',
    },
    endereco: decryptedAddress,
    contatoEmergencia: decryptedEmergencyContact,
    preferenciasPrivacidade: {
      termosAceitosEm: user.termsAcceptedAt ? new Date(user.termsAcceptedAt).toISOString() : null,
      versaoTermos: user.termsVersion ?? null,
      optOut: {
        whatsapp: user.optOutWhatsapp,
        email: user.optOutEmail,
        push: user.optOutPush,
        sms: user.optOutSms,
      },
    },
    departamentosEFuncoes: (user.memberships || []).map((m) => ({
      departamento: m.department.name,
      papel: m.role,
      funcoes: m.functions.map((f) => f.function.name),
    })),
    historicoEscalas: (user.assignments || []).map((a) => ({
      idEscala: a.id,
      status: a.status,
      programa: a.slot.program.title,
      departamento: a.slot.department.name,
      funcaoOuParte: a.slot.title,
      inicio: new Date(a.slot.startsAt).toISOString(),
      fim: new Date(a.slot.endsAt).toISOString(),
    })),
    disponibilidadesRegistradas: (user.availabilities || []).map((av) => ({
      tipo: av.kind,
      diaSemana: av.weekday ?? null,
      periodoDe: av.from ? new Date(av.from).toISOString() : null,
      periodoAte: av.to ? new Date(av.to).toISOString() : null,
    })),
  };
}
