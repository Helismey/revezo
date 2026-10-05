import { NotificationChannel, NotificationRecipient, ChannelSendResult } from './types';
import { EmailNotificationChannel } from './channels/email-channel';
import { PushNotificationChannel } from './channels/push-channel';
import { WhatsAppNotificationChannel } from './channels/whatsapp-channel';
import { SmsNotificationChannel } from './channels/sms-channel';
import { RenderedMessage, RateLimiterContract, HybridRateLimiter } from '@revezo/domain';
import { prisma, recordNotificationLog } from '@revezo/db';

export interface DispatchNotificationOptions {
  recipient: NotificationRecipient;
  message: RenderedMessage;
  assignmentId?: string;
  kind?: 'D7' | 'D2' | 'D1' | 'SUBSTITUTION' | 'OPEN_SLOT';
  forcedChannel?: 'whatsapp' | 'email' | 'push' | 'sms';
}

export interface NotificationDispatcherConfig {
  dailyLimiter?: RateLimiterContract;
  maxDailyPerUser?: number;
}

export class NotificationDispatcher {
  private channels: Map<string, NotificationChannel> = new Map();
  private dailyLimiter: RateLimiterContract;
  private readonly maxDailyPerUser: number;

  constructor(config?: NotificationDispatcherConfig) {
    this.maxDailyPerUser = config?.maxDailyPerUser ?? 10;
    this.dailyLimiter =
      config?.dailyLimiter ??
      new HybridRateLimiter({
        maxAttempts: this.maxDailyPerUser,
        windowMs: 24 * 60 * 60 * 1000,
        prefix: 'notif_daily_limit',
      });

    this.registerChannel(new EmailNotificationChannel());
    this.registerChannel(new PushNotificationChannel());
    this.registerChannel(new WhatsAppNotificationChannel());
    this.registerChannel(new SmsNotificationChannel());
  }

  getDailyLimiter(): RateLimiterContract {
    return this.dailyLimiter;
  }

  registerChannel(channel: NotificationChannel) {
    this.channels.set(channel.name, channel);
  }

  /**
   * Pausa assíncrona para controle de taxa de envio (anti-bloqueio).
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Envia a notificação respeitando o canal preferido, flags ativas e fallbacks automáticos.
   */
  async dispatch(options: DispatchNotificationOptions): Promise<ChannelSendResult> {
    const { recipient, message, assignmentId, kind = 'D1', forcedChannel } = options;

    // 1. Verificação anti-abuso: Limite diário de envios por usuário (Regra 16)
    if (recipient.userId) {
      const blockStatus = await this.dailyLimiter.isBlocked(recipient.userId);
      if (blockStatus.blocked) {
        console.warn(
          `[NotificationDispatcher] Limite diário de notificações atingido para o usuário ${recipient.userId}`
        );
        return {
          channel: forcedChannel || (recipient.preferredChannel.toLowerCase() as any) || 'email',
          success: false,
          error: 'Limite diário de notificações atingido para este usuário.',
        };
      }
    }

    // Busca feature flags ativas no banco
    const flags = await prisma.featureFlag.findMany();
    const flagMap = new Map(flags.map((f) => [f.key, f.enabled]));

    const whatsappEnabled = flagMap.get('whatsapp_enabled') ?? true;
    const smsEnabled = flagMap.get('sms_enabled') ?? false;

    // Determina a ordem de tentativa dos canais
    const channelOrder: ('whatsapp' | 'email' | 'push' | 'sms')[] = [];

    if (forcedChannel) {
      channelOrder.push(forcedChannel);
    } else {
      const preferred = recipient.preferredChannel.toLowerCase() as 'whatsapp' | 'email' | 'push' | 'sms';
      channelOrder.push(preferred);

      // Ordem de fallback padronizada
      const fallbacks: ('whatsapp' | 'email' | 'push' | 'sms')[] = ['email', 'push', 'whatsapp'];
      for (const fb of fallbacks) {
        if (!channelOrder.includes(fb)) {
          channelOrder.push(fb);
        }
      }
    }

    let lastResult: ChannelSendResult = {
      channel: 'email',
      success: false,
      error: 'Nenhum canal de envio disponível.',
    };

    for (const chName of channelOrder) {
      // Checagem de feature flags
      if (chName === 'whatsapp' && !whatsappEnabled) {
        continue;
      }
      if (chName === 'sms' && !smsEnabled) {
        continue;
      }

      // Checagem de opt-out
      if (chName === 'whatsapp' && recipient.optOutWhatsapp) continue;
      if (chName === 'email' && recipient.optOutEmail) continue;
      if (chName === 'push' && recipient.optOutPush) continue;
      if (chName === 'sms' && recipient.optOutSms) continue;

      const channel = this.channels.get(chName);
      if (!channel) continue;

      // Executa o envio
      const res = await channel.send(recipient, message);
      lastResult = res;

      // Registra o log no banco de dados (sem dados pessoais completos)
      if (assignmentId) {
        await recordNotificationLog({
          assignmentId,
          kind,
          channel: chName.toUpperCase() as 'WHATSAPP' | 'EMAIL' | 'PUSH' | 'SMS',
          success: res.success,
          error: res.error,
        });
      }

      if (res.success) {
        // Registra o envio no contador diário anti-abuso
        if (recipient.userId) {
          await this.dailyLimiter.recordAttempt(recipient.userId);
        }

        // Pausa preventiva de 1.5s se foi WhatsApp para anti-bloqueio
        if (chName === 'whatsapp') {
          await this.delay(1500);
        }
        return res;
      }
    }

    return lastResult;
  }

}

export const notificationDispatcher = new NotificationDispatcher();
