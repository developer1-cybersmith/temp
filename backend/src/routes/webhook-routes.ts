import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { verifyMetaSignature } from '../utils/webhook-signature.js';
import { pipelineService, type MediaAttachment } from '../services/pipeline-service.js';
import { cloudClient } from '../services/whatsapp-cloud-client.js';
import { config } from '../config/environment.js';
import { runAgentGraph } from '../agent/graph.js';

/**
 * GENAI_POC_PRD.md §5.6 rollout flag. Default false — the existing
 * pipelineService.processIncomingMessage() path remains the default and is
 * never modified by this branch. When true, routes through the new LangGraph
 * agent graph instead, as a parallel path only.
 */
const USE_AGENT_GRAPH = process.env.USE_AGENT_GRAPH === 'true';

/**
 * Dispatches to the new agent graph or the existing pipeline depending on
 * USE_AGENT_GRAPH. Centralized here so all 4 webhook call sites (text,
 * audio, image, button/interactive) stay in sync without duplicating the
 * flag check at each site.
 */
async function dispatchToPipeline(
  userId: string,
  customerJid: string,
  customerName: string,
  customerPhone: string,
  messageText: string,
  media?: MediaAttachment,
): ReturnType<typeof pipelineService.processIncomingMessage> {
  if (USE_AGENT_GRAPH) {
    try {
      const agentMedia = media?.type === 'voice_note'
        ? (media.base64 ? { type: 'voice' as const, data: media.base64, mimetype: media.mimetype || 'audio/ogg' } : undefined)
        : media?.type === 'image' && media.base64
          ? { type: 'image' as const, data: media.base64, mimetype: media.mimetype || 'image/jpeg' }
          : undefined;

      const result = await runAgentGraph({
        userId, customerJid, customerName, customerPhone, messageText, media: agentMedia,
      });
      return {
        success: true,
        autoReplied: !!result.replyDraft,
        analysis: { intent: result.intent, confidence: result.confidence },
        replyText: result.replyDraft,
      };
    } catch (err: any) {
      console.error('[agent-graph] run failed:', err.message);
      return { success: false, autoReplied: false, analysis: null };
    }
  }

  return pipelineService.processIncomingMessage(
    userId, customerJid, customerName, customerPhone, messageText, media,
  );
}

export const webhookRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  /**
   * Preserve raw body bytes for HMAC-SHA256 signature verification.
   * Fastify normally discards the raw buffer after JSON parsing.
   * This parser runs only within this plugin scope (not globally).
   */
  server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as any).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // ─── GET /api/webhook/whatsapp — Meta verification handshake ─────────────
  server.get('/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const mode      = query['hub.mode'];
    const token     = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.META_WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ WhatsApp webhook verified by Meta');
      return reply.status(200).send(challenge);
    }

    console.warn(`⚠️ Webhook verify failed — mode=${mode} token=${token}`);
    return reply.status(403).send({ error: 'Verification failed' });
  });

  // ─── POST /api/webhook/whatsapp — incoming messages from Meta ─────────────
  server.post('/whatsapp', async (request, reply) => {
    const rawBody   = (request as any).rawBody as Buffer | undefined;
    const signature = request.headers['x-hub-signature-256'] as string | undefined;

    // Always return 200 first — Meta retries for 36 hours on non-200 responses.
    // We verify the signature and only process if valid.
    if (!rawBody || !verifyMetaSignature(rawBody, signature, config.META_APP_SECRET)) {
      console.warn('⚠️ Webhook signature invalid — ignoring payload');
      return reply.status(200).send({ status: 'ignored' });
    }

    // Ack Meta immediately (5-second budget)
    reply.status(200).send({ status: 'ok' });

    // Process async after the response is flushed
    setImmediate(() => {
      processWebhookPayload(server, request.body as any).catch(err => {
        console.error('❌ Webhook async processing error:', err.message);
      });
    });
  });
};

// ─── Webhook payload processor ────────────────────────────────────────────────

async function processWebhookPayload(server: FastifyInstance, payload: any): Promise<void> {
  if (payload?.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry ?? []) {
    const wabaId = entry.id as string;

    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (!value) continue;

      const phoneNumberId: string = value.metadata?.phone_number_id ?? '';

      // Resolve which tenant owns this phone number
      const userId = await resolveUserFromPhoneNumberId(server, phoneNumberId, wabaId);
      if (!userId) {
        console.warn(`⚠️ No tenant found for phone_number_id=${phoneNumberId} waba=${wabaId}`);
        continue;
      }

      // contacts array: wa_id → display name
      const contactNames: Record<string, string> = {};
      for (const c of value.contacts ?? []) {
        contactNames[c.wa_id] = c.profile?.name ?? c.wa_id;
      }

      for (const msg of value.messages ?? []) {
        await handleIncomingMessage(
          server, userId, msg, contactNames, phoneNumberId,
        ).catch(err => {
          console.error(`❌ handleIncomingMessage error: ${err.message}`);
        });
      }
    }
  }
}

async function resolveUserFromPhoneNumberId(
  server: FastifyInstance,
  phoneNumberId: string,
  _wabaId: string,
): Promise<string | null> {
  // Per-tenant lookup (used after Embedded Signup)
  const { data } = await server.supabase
    .from('wb_waba_accounts')
    .select('user_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('status', 'active')
    .maybeSingle();

  if (data?.user_id) return data.user_id;

  // Single-tenant env-var fallback (dev / first launch)
  if (phoneNumberId === config.META_PHONE_NUMBER_ID) {
    const { data: user } = await server.supabase
      .from('wb_users')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return user?.id ?? null;
  }

  return null;
}

async function handleIncomingMessage(
  server: FastifyInstance,
  userId: string,
  msg: any,
  contactNames: Record<string, string>,
  phoneNumberId: string,
): Promise<void> {
  const from: string   = msg.from ?? '';
  const messageId: string = msg.id ?? '';
  const msgType: string   = msg.type ?? '';

  // Convert Cloud API phone number to JID format for pipeline compatibility
  const customerJid   = `${from}@s.whatsapp.net`;
  const customerPhone = from;
  const customerName  = contactNames[from] ?? from;

  // Dedup: skip if we already processed this message_id
  const { data: seen } = await server.supabase
    .from('wb_webhook_events')
    .select('id')
    .eq('wh_message_id', messageId)
    .maybeSingle();

  if (seen) {
    console.log(`ℹ️ Duplicate wamid ${messageId} — skipping`);
    return;
  }

  await server.supabase.from('wb_webhook_events').insert({
    wh_message_id: messageId,
    phone_number_id: phoneNumberId,
    processed: false,
  });

  // Mark as read (non-blocking best-effort)
  cloudClient.markRead(userId, messageId).catch(() => {});

  // ── Text ──────────────────────────────────────────────────────────────────
  if (msgType === 'text') {
    const text: string = msg.text?.body ?? '';
    if (!text.trim()) return;
    console.log(`\n📩 [${userId.slice(0, 8)}] ${customerName}: "${text.slice(0, 80)}"`);
    await pipelineService.processIncomingMessage(
      userId, customerJid, customerName, customerPhone, text,
    );

  // ── Audio / Voice note ─────────────────────────────────────────────────────
  } else if (msgType === 'audio') {
    const audioId: string = msg.audio?.id ?? msg.voice?.id ?? '';
    console.log(`\n🎤 [${userId.slice(0, 8)}] ${customerName}: [Audio]`);
    if (audioId) {
      await handleAudioMessage(
        server, userId, customerJid, customerName, customerPhone, audioId, phoneNumberId,
      );
    }

  // ── Image ──────────────────────────────────────────────────────────────────
  } else if (msgType === 'image') {
    const imageId: string  = msg.image?.id ?? '';
    const caption: string  = msg.image?.caption ?? '';
    console.log(`\n📷 [${userId.slice(0, 8)}] ${customerName}: [Image${caption ? ` "${caption}"` : ''}]`);
    if (imageId) {
      await handleImageMessage(
        server, userId, customerJid, customerName, customerPhone, imageId, caption, phoneNumberId,
      );
    }

  // ── Button / Interactive reply ─────────────────────────────────────────────
  } else if (msgType === 'button' || msgType === 'interactive') {
    const text =
      msg.button?.text ??
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ?? '';
    if (text) {
      await pipelineService.processIncomingMessage(
        userId, customerJid, customerName, customerPhone, text,
      );
    }

  } else {
    console.log(`ℹ️ Unsupported message type "${msgType}" from ${from}`);
  }

  await server.supabase
    .from('wb_webhook_events')
    .update({ processed: true })
    .eq('wh_message_id', messageId);
}

async function resolveAccessToken(
  server: FastifyInstance,
  phoneNumberId: string,
): Promise<string> {
  const { data } = await server.supabase
    .from('wb_waba_accounts')
    .select('access_token_encrypted')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  return data?.access_token_encrypted ?? config.META_SYSTEM_USER_TOKEN;
}

async function downloadMetaMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Buffer; mimetype: string }> {
  // Step 1: get the CDN URL + mime_type
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) throw new Error(`Media URL lookup failed (${metaRes.status})`);
  const { url, mime_type } = await metaRes.json() as { url: string; mime_type: string };

  // Step 2: download the actual bytes (Authorization header required by Meta CDN)
  const dlRes = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!dlRes.ok) throw new Error(`Media download failed (${dlRes.status})`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());

  return { buffer, mimetype: mime_type ?? 'application/octet-stream' };
}

async function handleAudioMessage(
  server: FastifyInstance,
  userId: string,
  customerJid: string,
  customerName: string,
  customerPhone: string,
  audioId: string,
  phoneNumberId: string,
): Promise<void> {
  try {
    const accessToken = await resolveAccessToken(server, phoneNumberId);
    const { buffer: audioBuffer, mimetype } = await downloadMetaMedia(audioId, accessToken);

    // Upload to Supabase Storage so dashboard can play it back
    const { uploadIncomingMedia } = await import('../services/message-media-service.js');
    const mediaUrl = await uploadIncomingMedia(server.supabase, userId, audioBuffer, mimetype, 'voice');

    const { transcribeVoiceNote } = await import('../services/voice-transcription-service.js');
    const { text } = await transcribeVoiceNote(audioBuffer);

    if (!text?.trim()) {
      console.warn('⚠️ Audio transcription empty — skipping pipeline');
      return;
    }
    console.log(`📝 [Transcribed]: "${text.slice(0, 80)}"`);

    const result = await pipelineService.processIncomingMessage(
      userId, customerJid, customerName, customerPhone, text,
      { type: 'voice_note', durationSecs: 0, mediaUrl: mediaUrl ?? undefined, mimetype },
    );

    // TTS voice reply (mirrors old BaileysAdapter behaviour)
    if (result.autoReplied && result.replyText) {
      const { generateVoiceReply, isVoiceReplyEnabled } = await import('../services/tts-service.js');
      if (isVoiceReplyEnabled()) {
        const voiceBuffer = await generateVoiceReply(result.replyText);
        if (voiceBuffer) {
          await cloudClient.sendVoiceNote(userId, customerJid, voiceBuffer);
          console.log(`🔊 [${userId.slice(0, 8)}] TTS voice reply sent`);
        }
      }
    }
  } catch (err: any) {
    console.error(`❌ handleAudioMessage error: ${err.message}`);
  }
}

async function handleImageMessage(
  server: FastifyInstance,
  userId: string,
  customerJid: string,
  customerName: string,
  customerPhone: string,
  imageId: string,
  caption: string,
  phoneNumberId: string,
): Promise<void> {
  try {
    const accessToken = await resolveAccessToken(server, phoneNumberId);
    const { buffer: imageBuffer, mimetype } = await downloadMetaMedia(imageId, accessToken);
    const base64 = imageBuffer.toString('base64');

    // Upload to Supabase Storage so dashboard can render the actual image
    const { uploadIncomingMedia } = await import('../services/message-media-service.js');
    const mediaUrl = await uploadIncomingMedia(server.supabase, userId, imageBuffer, mimetype, 'image');

    await pipelineService.processIncomingMessage(
      userId, customerJid, customerName, customerPhone,
      caption || '[Customer sent an image]',
      { type: 'image', base64, mimetype, mediaUrl: mediaUrl ?? undefined },
    );
  } catch (err: any) {
    console.error(`❌ handleImageMessage error: ${err.message}`);
    // Fall back to just the caption text if image download failed
    if (caption) {
      await pipelineService.processIncomingMessage(
        userId, customerJid, customerName, customerPhone, caption,
      );
    }
  }
}
