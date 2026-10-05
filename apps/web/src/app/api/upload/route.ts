import { NextResponse } from 'next/server';
import { prisma } from '@revezo/db';
import {
  validateImageMagicBytes,
  generateSafeFileName,
  stripExifFromJpeg,
  HybridRateLimiter,
  MAX_UPLOAD_FILE_SIZE_BYTES,
} from '@revezo/domain';
import { getSession } from '@/lib/auth-service';

// Rate limit estrito para uploads: 10 uploads por hora por usuário/IP (Regra 12)
const uploadRateLimiter = new HybridRateLimiter({
  prefix: 'upload-rate',
  maxAttempts: 10,
  windowMs: 60 * 60 * 1000,
  blockDurationMs: 60 * 60 * 1000,
});

/**
 * Endpoint de Upload Seguro de Fotos e Logos (Regra 12 & OWASP Top 10)
 * - Autenticação obrigatória (usuário ativo)
 * - Validação por Magic Bytes (JPEG, PNG, WebP)
 * - SVG estritamente proibido (prevenção de XSS e XXE)
 * - Limite de 2 MB
 * - Remoção de metadados EXIF/GPS
 * - Nome do arquivo gerado exclusivamente pelo servidor
 */
export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    // 1. Autenticação obrigatória
    const session = await getSession();
    if (!session || session.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Acesso não autorizado para upload de arquivos.' },
        { status: 401 }
      );
    }

    // 2. Proteção contra abuso / Rate Limit
    const rateLimitKey = `${clientIp}:${session.userId}`;
    const rateCheck = await uploadRateLimiter.recordAttempt(rateLimitKey);
    if (rateCheck.blocked) {
      return NextResponse.json(
        { success: false, error: 'Limite de uploads por hora excedido. Tente novamente mais tarde.' },
        { status: 429 }
      );
    }

    // 3. Leitura do FormData multipart
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Nenhum arquivo enviado. Selecione uma imagem.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    // 4. Validação por Magic Bytes reais e proibição de SVG
    const validation = validateImageMagicBytes(rawBuffer, MAX_UPLOAD_FILE_SIZE_BYTES);
    if (!validation.valid) {
      await prisma.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'FILE_UPLOAD_REJECTED',
          result: 'DENIED',
          ip: clientIp,
          meta: { reason: validation.reason, error: validation.error },
        },
      });

      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // 5. Remoção de metadados EXIF (incluindo GPS) se for JPEG
    let finalBuffer: Buffer = rawBuffer;
    if (validation.mimeType === 'image/jpeg') {
      finalBuffer = stripExifFromJpeg(rawBuffer);
    }

    // 6. Geração de nome no servidor com UUID (Regra 12: nome gerado pelo servidor)
    const safeFileName = generateSafeFileName(validation.extension!);
    const simulatedStorageUrl = `/uploads/${safeFileName}`;

    // 7. Registro em trilha de auditoria
    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'FILE_UPLOADED',
        targetType: 'UploadedImage',
        targetId: safeFileName,
        result: 'SUCCESS',
        ip: clientIp,
        meta: {
          mimeType: validation.mimeType,
          originalNameLength: file.name.length,
          sizeBytes: finalBuffer.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      fileName: safeFileName,
      url: simulatedStorageUrl,
      mimeType: validation.mimeType,
      size: finalBuffer.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao processar upload de arquivo';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
