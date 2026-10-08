import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

interface TenantCreds {
  phoneNumberId: string;
  accessToken: string;
}

/**
 * WhatsAppCloudClient — HTTP-based WhatsApp messaging via Meta Cloud API.
 * Replaces the Baileys socket adapter with the same sendMessage / sendImage interface
 * so the pipeline-service and other callers need minimal changes.
 *
 * Credential resolution order:
 *   1. wb_waba_accounts row for the userId (per-tenant, Embedded Signup future)
 *   2. META_PHONE_NUMBER_ID + META_SYSTEM_USER_TOKEN env vars (single-tenant / dev)
 */
class WhatsAppCloudClient {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  }

  private async getTenantCreds(userId: string): Promise<TenantCreds> {
    const { data } = await this.supabase
      .from('wb_waba_accounts')
      .select('phone_number_id, access_token_encrypted')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (data?.phone_number_id && data?.access_token_encrypted) {
      return {
        phoneNumberId: data.phone_number_id,
        accessToken: data.access_token_encrypted,
      };
    }

    if (config.META_PHONE_NUMBER_ID && config.META_SYSTEM_USER_TOKEN) {
      return {
        phoneNumberId: config.META_PHONE_NUMBER_ID,
        accessToken: config.META_SYSTEM_USER_TOKEN,
      };
    }

    throw new Error(`No WhatsApp Cloud API credentials for user ${userId.slice(0, 8)}`);
  }

  /** Strip JID suffix to get the phone number Meta expects (e.g. "919876543210@s.whatsapp.net" → "919876543210") */
  private jidToPhone(jid: string): string {
    return jid.split('@')[0];
  }

  /** Send a plain-text WhatsApp message */
  async sendMessage(userId: string, jid: string, text: string): Promise<boolean> {
    try {
      const { phoneNumberId, accessToken } = await this.getTenantCreds(userId);
      const to = this.jidToPhone(jid);

      const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error(`❌ [Cloud] sendMessage failed (${response.status}):`, err);
        return false;
      }

      console.log(`✅ [${userId.slice(0, 8)}] WhatsApp msg → ${to}`);
      return true;
    } catch (err: any) {
      console.error(`❌ [Cloud] sendMessage error: ${err.message}`);
      return false;
    }
  }

  /** Send an image with an optional caption */
  async sendImage(userId: string, jid: string, imageUrl: string, caption?: string): Promise<boolean> {
    try {
      const { phoneNumberId, accessToken } = await this.getTenantCreds(userId);
      const to = this.jidToPhone(jid);

      const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'image',
          image: { link: imageUrl, caption: caption || '' },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error(`❌ [Cloud] sendImage failed (${response.status}):`, err);
        return false;
      }

      console.log(`🖼️ [${userId.slice(0, 8)}] WhatsApp image → ${to}`);
      return true;
    } catch (err: any) {
      console.error(`❌ [Cloud] sendImage error: ${err.message}`);
      return false;
    }
  }

  /**
   * Upload an audio buffer to Meta's media API, then send it as a voice message.
   * Used for TTS (text-to-speech) replies.
   */
  async sendVoiceNote(userId: string, jid: string, audioBuffer: Buffer): Promise<boolean> {
    try {
      const { phoneNumberId, accessToken } = await this.getTenantCreds(userId);
      const to = this.jidToPhone(jid);

      // Step 1: Upload media
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', 'audio/ogg');
      const ab = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer;
      formData.append('file', new Blob([ab], { type: 'audio/ogg' }), 'voice.ogg');

      const uploadRes = await fetch(`${GRAPH_BASE}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        console.error(`❌ [Cloud] Voice upload failed (${uploadRes.status})`);
        return false;
      }

      const { id: mediaId } = await uploadRes.json() as { id: string };

      // Step 2: Send audio message
      const sendRes = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'audio',
          audio: { id: mediaId },
        }),
      });

      if (!sendRes.ok) {
        console.error(`❌ [Cloud] Voice send failed (${sendRes.status})`);
        return false;
      }

      console.log(`🔊 [${userId.slice(0, 8)}] Voice note → ${to}`);
      return true;
    } catch (err: any) {
      console.error(`❌ [Cloud] sendVoiceNote error: ${err.message}`);
      return false;
    }
  }

  /** Mark an incoming message as read (best-effort, never throws) */
  async markRead(userId: string, messageId: string): Promise<void> {
    try {
      const { phoneNumberId, accessToken } = await this.getTenantCreds(userId);
      await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
    } catch {
      // Best-effort
    }
  }
}

export const cloudClient = new WhatsAppCloudClient();
