import { NextResponse } from 'next/server';
import { prisma } from '@revezo/db';
import {
  verifyWebhookSignature,
  defaultWebhookReplayTracker,
  extractIncomingWhatsAppPayload,
  isOptOutKeyword,
  maskPhoneNumber,
} from '@revezo/domain';
import { createHash } from 'crypto';

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // 1. Fail-closed em produção caso a chave do webhook não esteja provisionada
    if (process.env.NODE_ENV === 'production' && !webhookSecret) {
      return NextResponse.json(
        { error: 'WEBHOOK_SECRET não configurado no servidor em produção' },
        { status: 500 }
      );
    }

    const signature = request.headers.get('x-webhook-signature');
    const timestamp = request.headers.get('x-webhook-timestamp');
    const headerEventId = request.headers.get('x-webhook-event-id');

    const bodyText = await request.text();

    // 2. Validação criptográfica de autenticidade (HMAC) e frescor (timestamp)
    if (webhookSecret || signature) {
      if (!webhookSecret) {
        return NextResponse.json(
          { error: 'Chave secreta de webhook ausente para validação da assinatura fornecida' },
          { status: 401 }
        );
      }

      const verification = verifyWebhookSignature({
        signature,
        timestamp,
        rawBody: bodyText,
        secret: webhookSecret,
      });

      if (!verification.valid) {
        if (verification.reason === 'MISSING_DATA') {
          return NextResponse.json({ error: 'Assinatura ou timestamp ausente' }, { status: 401 });
        }
        if (verification.reason === 'EXPIRED_TIMESTAMP') {
          return NextResponse.json(
            { error: 'Timestamp expirado ou fora da janela de tolerância' },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: 'Assinatura HMAC inválida' }, { status: 403 });
      }
    }

    // 3. Trata o payload recebido de forma segura como dado NÃO CONFIÁVEL
    let parsedJson: any = null;
    try {
      parsedJson = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return NextResponse.json({ error: 'Payload JSON malformado' }, { status: 400 });
    }

    const extracted = extractIncomingWhatsAppPayload(parsedJson);

    // 4. Prevenção de ataques de repetição (Replay Attacks) via ID de evento / nonce
    const effectiveEventId =
      headerEventId ||
      extracted.eventId ||
      (signature ? createHash('sha256').update(`${timestamp}.${signature}`).digest('hex') : null);

    if (effectiveEventId) {
      if (defaultWebhookReplayTracker.isReplay(effectiveEventId)) {
        return NextResponse.json(
          { error: 'Evento duplicado detectado (replay attack prevenido)' },
          { status: 409 }
        );
      }
      defaultWebhookReplayTracker.record(effectiveEventId);
    }

    // 5. Tratamento de Opt-Out imediato e resposta automática a "PARAR"
    if (isOptOutKeyword(extracted.messageText) && extracted.senderPhone) {
      const cleanDigits = extracted.senderPhone;
      const without55 = cleanDigits.startsWith('55') && cleanDigits.length >= 12 ? cleanDigits.slice(2) : cleanDigits;

      // Busca usuário vinculado ao número pelo banco de dados (nunca confia em parâmetro do cliente)
      const matchingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { whatsapp: cleanDigits },
            { whatsapp: without55 },
            { phonePrimary: cleanDigits },
            { phonePrimary: without55 },
            { phoneSecondary: cleanDigits },
            { phoneSecondary: without55 },
          ],
        },
      });

      if (matchingUser) {
        // Aplica o opt-out de imediato no banco
        await prisma.user.update({
          where: { id: matchingUser.id },
          data: { optOutWhatsapp: true },
        });

        // Registra trilha de auditoria da remoção do consentimento
        await prisma.auditLog.create({
          data: {
            churchId: matchingUser.churchId,
            action: 'USER_OPTOUT_WHATSAPP_WEBHOOK',
            targetType: 'User',
            targetId: matchingUser.id,
            result: 'SUCCESS',
            meta: {
              phoneMasked: maskPhoneNumber(cleanDigits),
              keyword: extracted.messageText,
            },
          },
        });

        const autoReply =
          'Revezo: Sua solicitação para PARAR o envio de lembretes por WhatsApp foi atendida com sucesso. Você não receberá mais mensagens por este canal. Para reativar, contate a liderança da sua congregação.';

        return NextResponse.json({
          success: true,
          received: true,
          action: 'opt_out_processed',
          userFound: true,
          autoReply,
        });
      }

      // Telefone não cadastrado, mas solicitação acolhida
      return NextResponse.json({
        success: true,
        received: true,
        action: 'opt_out_unmatched_user',
        phoneMasked: maskPhoneNumber(cleanDigits),
      });
    }

    // Modo normal ou desenvolvimento
    return NextResponse.json({
      success: true,
      received: true,
      action: 'received',
      mode: !webhookSecret ? 'unauthenticated-dev' : 'verified',
    });
  } catch (err: unknown) {
    console.error('Erro no webhook de WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno ao processar webhook' }, { status: 500 });
  }
}
