import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/node';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';
import { importMemberRowSchema, ImportMemberRowInput } from '@revezo/contracts';

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function mapRowToMember(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val !== undefined && val !== null) {
      normalized[normalizeKey(key)] = String(val).trim();
    }
  }

  const name = normalized['nome'] || normalized['nome completo'] || normalized['name'] || '';
  const email = normalized['email'] || normalized['e-mail'] || '';
  const phonePrimary =
    normalized['telefone'] ||
    normalized['celular'] ||
    normalized['phone'] ||
    normalized['telefone principal'] ||
    null;
  const whatsapp = normalized['whatsapp'] || normalized['whats'] || normalized['zap'] || phonePrimary;
  const departmentName =
    normalized['departamento'] ||
    normalized['equipe'] ||
    normalized['ministerio'] ||
    null;
  const functionName =
    normalized['funcao'] ||
    normalized['cargo'] ||
    normalized['papel'] ||
    null;

  const isMinorRaw = (normalized['menor'] || normalized['menor de idade'] || normalized['e menor'] || '').toLowerCase();
  const isMinor = ['sim', 'true', '1', 's', 'yes'].includes(isMinorRaw);

  const guardianName =
    normalized['responsavel'] ||
    normalized['nome do responsavel'] ||
    normalized['guardian'] ||
    null;
  const guardianPhone =
    normalized['telefone do responsavel'] ||
    normalized['contato do responsavel'] ||
    normalized['celular do responsavel'] ||
    null;

  return {
    name,
    email,
    phonePrimary,
    whatsapp,
    departmentName,
    functionName,
    isMinor,
    guardianName,
    guardianPhone,
  };
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const churchContext = await getActiveChurchContext();
    const activeChurchId = churchContext?.activeChurch?.id || userContext.churchId;

    if (!can(userContext, 'member:import', { churchId: activeChurchId || undefined })) {
      return NextResponse.json(
        { success: false, error: 'Apenas administradores, pastores e anciãos autorizados podem importar membros por planilha' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // Limite de 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'O arquivo não pode exceder 5 MB' },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv') || file.type === 'text/csv';
    const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('spreadsheet') || file.type.includes('excel');

    if (!isCsv && !isXlsx) {
      return NextResponse.json(
        { success: false, error: 'Formato inválido. Envie um arquivo .csv ou .xlsx' },
        { status: 400 }
      );
    }

    let rawRecords: Record<string, unknown>[] = [];

    if (isCsv) {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
      });
      rawRecords = parsed.data;
    } else {
      const buffer = await file.arrayBuffer();
      let rows;
      try {
        rows = await readSheet(Buffer.from(buffer));
      } catch {
        return NextResponse.json(
          { success: false, error: 'Arquivo Excel inválido ou corrompido' },
          { status: 400 }
        );
      }

      if (!rows || rows.length === 0) {
        return NextResponse.json({ success: false, error: 'A planilha enviada está vazia' }, { status: 400 });
      }

      const headerRow = rows[0] || [];
      const headers = headerRow.map((cell: unknown) => String(cell ?? '').trim());
      rawRecords = rows.slice(1).map((row: unknown[]) => {
        const record: Record<string, unknown> = {};
        headers.forEach((header: string, index: number) => {
          if (header) {
            record[header] = row[index] !== null && row[index] !== undefined ? row[index] : '';
          }
        });
        return record;
      });
    }

    if (rawRecords.length === 0) {
      return NextResponse.json({ success: false, error: 'A planilha enviada está vazia' }, { status: 400 });
    }

    // Limite de 1000 linhas por importação
    if (rawRecords.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'A planilha excede o limite de 1000 linhas por importação' },
        { status: 400 }
      );
    }

    const validRows: (ImportMemberRowInput & { isExisting?: boolean })[] = [];
    const invalidRows: { index: number; data: Record<string, unknown>; errors: string[] }[] = [];

    for (let i = 0; i < rawRecords.length; i++) {
      const raw = rawRecords[i];
      if (!raw) continue;
      const mapped = mapRowToMember(raw);
      const validation = importMemberRowSchema.safeParse(mapped);

      if (validation.success) {
        validRows.push(validation.data);
      } else {
        const errorMessages = validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
        invalidRows.push({
          index: i + 1,
          data: mapped,
          errors: errorMessages,
        });
      }
    }

    // Busca e-mails duplicados já cadastrados no banco
    const emailsToCheck = validRows.map((r) => r.email.toLowerCase().trim());
    const existingUsers = await prisma.user.findMany({
      where: {
        email: { in: emailsToCheck },
      },
      select: { email: true, name: true },
    });

    const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    for (const row of validRows) {
      row.isExisting = existingEmailSet.has(row.email.toLowerCase());
    }

    const duplicateCount = validRows.filter((r) => r.isExisting).length;
    const newCount = validRows.length - duplicateCount;

    return NextResponse.json({
      success: true,
      totalRows: rawRecords.length,
      validRows,
      invalidRows,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCount,
      newCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao processar planilha';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
