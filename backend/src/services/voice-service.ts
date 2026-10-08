import { SupabaseClient } from '@supabase/supabase-js';
import { CatalogService } from './catalog-service.js';
import { RagService } from './rag-service.js';
import { AppointmentService } from './appointment-service.js';
import { cloudClient as baileysAdapter } from './whatsapp-cloud-client.js';

export class VoiceService {
  private catalog: CatalogService;
  private rag: RagService;
  private appointments: AppointmentService;

  constructor(private supabase: SupabaseClient) {
    this.rag = new RagService(supabase);
    this.catalog = new CatalogService(supabase, this.rag);
    this.appointments = new AppointmentService(supabase);
  }

  // ── Main tool call router ──────────────────────────────────────

  async handleToolCalls(message: any): Promise<any[]> {
    // VAPI sends toolCallList at message level (webhook route already unwraps body.message)
    const toolCalls: any[] = message?.toolCallList ?? message?.message?.toolCallList ?? [];
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      const { id: toolCallId, function: fn } = toolCall;
      const name = fn?.name;
      const args = typeof fn?.arguments === 'string'
        ? JSON.parse(fn.arguments)
        : fn?.arguments ?? {};

      const start = Date.now();
      let result: string;
      let success = true;

      try {
        switch (name) {
          case 'search_inventory':
            result = await this.searchInventory(args, message);
            break;
          case 'book_appointment':
            result = await this.bookAppointment(args, message);
            break;
          case 'share_location':
            result = await this.shareLocation(args, message);
            break;
          case 'escalate_to_human':
            result = await this.escalateToHuman(args, message);
            break;
          default:
            result = `Sorry, I cannot handle that request right now.`;
            success = false;
        }
      } catch (err: any) {
        console.error(`[Voice] Tool call "${name}" failed:`, err);
        result = `I'm sorry, something went wrong on my end. Let me connect you with the team.`;
        success = false;
      }

      const latencyMs = Date.now() - start;

      // Log action asynchronously (don't block the response)
      const vapiCallId = message?.call?.id ?? message?.message?.call?.id;
      if (vapiCallId) {
        this.logAction(vapiCallId, name, args, result, success, latencyMs).catch(e =>
          console.error('[Voice] Failed to log action:', e)
        );
      }

      results.push({ toolCallId, result });
    }

    return results;
  }

  // ── Tool: search_inventory ─────────────────────────────────────

  private async searchInventory(args: any, message: any): Promise<string> {
    const userId = await this.getUserIdFromCall(message);
    if (!userId) {
      return 'I am unable to look up inventory right now. Please try again shortly.';
    }

    const { query, max_budget, category } = args;

    const searchResult = await this.catalog.searchWithAlternatives(userId, query || '', {
      price_max: max_budget ? Number(max_budget) : undefined,
      category: category || undefined,
    });

    const available = (searchResult.exact || []).filter((i: any) => i.quantity > 0);
    const sold = (searchResult.exact || []).filter((i: any) => i.quantity <= 0);
    const alternatives = searchResult.alternatives || [];

    // If nothing found at all
    if (available.length === 0 && sold.length === 0 && alternatives.length === 0) {
      return `I could not find anything matching "${query}" in our inventory right now. Would you like me to check for something else?`;
    }

    const lines: string[] = [];

    // Show available items (max 3 for voice)
    if (available.length > 0) {
      const top = available.slice(0, 3);
      lines.push(`I found ${available.length} option${available.length > 1 ? 's' : ''}. Here are the top picks:`);
      for (const item of top) {
        const priceStr = item.price ? this.formatPrice(item.price) : 'price on request';
        const catStr = item.category ? `, ${item.category}` : '';
        lines.push(`${item.item_name}${catStr}, at ${priceStr}.`);
      }
    } else if (sold.length > 0) {
      // Acknowledge sold items
      lines.push(`The ${sold[0].item_name} is currently sold out.`);
      if (alternatives.length > 0) {
        lines.push(`But I have some similar options:`);
        for (const alt of alternatives.slice(0, 3)) {
          const priceStr = alt.price ? this.formatPrice(alt.price) : 'price on request';
          lines.push(`${alt.item_name}, at ${priceStr}.`);
        }
      }
    }

    lines.push('Would you like more details on any of these?');
    return lines.join(' ');
  }

  // ── Tool: book_appointment ─────────────────────────────────────

  private async bookAppointment(args: any, message: any): Promise<string> {
    const userId = await this.getUserIdFromCall(message);
    if (!userId) {
      return 'I am unable to book an appointment right now. Please call back shortly.';
    }

    const { customer_name, customer_phone, service, date, time } = args;

    if (!customer_name || !service) {
      return 'I need your name and the service you are interested in to book an appointment. Could you provide those?';
    }

    const title = `\u{1F4C5} Voice Booking: ${customer_name} \u2014 ${service}`;
    const dueDate = date || null;

    // If both date and time are provided, check availability via AppointmentService
    if (date && time) {
      const proposedTimeIso = new Date(`${date}T${time}`).toISOString();

      const slotResult = await this.appointments.bookSlot(userId, {
        customerName: customer_name,
        service,
        dateTimeIso: proposedTimeIso,
      });

      if (!slotResult.success) {
        const altTimes = slotResult.alternatives?.join(', ') || 'later today';
        return `Sorry, that time slot is already booked. I have openings at ${altTimes}. Which one works for you?`;
      }

      // bookSlot already inserted the task, so skip the insert below
      const dateStr = ` on ${date}`;
      const timeStr = ` at ${time}`;
      return `Done! I have booked your appointment for ${service}${dateStr}${timeStr}. ${customer_name}, our team will confirm with you shortly. Is there anything else I can help with?`;
    }

    // Date-only or no date: just insert the task without time checking
    const { error } = await this.supabase.from('wb_tasks').insert({
      user_id: userId,
      title,
      due_date: dueDate,
      is_completed: false,
    });

    if (error) {
      console.error('[Voice] Failed to create appointment task:', error);
      return 'I was not able to save the appointment. Please try again or our team will follow up.';
    }

    const dateStr = date ? ` on ${date}` : '';
    const timeStr = time ? ` at ${time}` : '';
    return `Done! I have booked your appointment for ${service}${dateStr}${timeStr}. ${customer_name}, our team will confirm with you shortly. Is there anything else I can help with?`;
  }

  // ── Tool: share_location ───────────────────────────────────────

  private async shareLocation(args: any, message: any): Promise<string> {
    const userId = await this.getUserIdFromCall(message);
    if (!userId) {
      return 'I am unable to share the location right now.';
    }

    const { customer_phone } = args;

    // Fetch business location
    const { data: user, error } = await this.supabase
      .from('wb_users')
      .select('business_name, business_address, google_maps_link')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return 'I do not have location details configured yet. Please ask our team for directions.';
    }

    const address = user.business_address || '';
    const mapsLink = user.google_maps_link || '';

    if (!address && !mapsLink) {
      return 'Our location details are not set up yet. Our team will share them with you.';
    }

    // Try to send via WhatsApp if customer phone provided
    if (customer_phone) {
      const jid = customer_phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      const locationMsg = mapsLink
        ? `${user.business_name || 'Our'} location:\n${address}\n\nGoogle Maps: ${mapsLink}`
        : `${user.business_name || 'Our'} location:\n${address}`;

      try {
        const sent = await baileysAdapter.sendMessage(userId, jid, locationMsg);
        if (sent) {
          return `I have sent our location to your WhatsApp. Our address is ${address}.`;
        }
      } catch (err) {
        console.error('[Voice] Failed to send WhatsApp location:', err);
      }
    }

    // Fallback: speak the address
    return mapsLink
      ? `Our address is ${address}. I can also share a Google Maps link on WhatsApp if you give me your number.`
      : `Our address is ${address}.`;
  }

  // ── Tool: escalate_to_human ────────────────────────────────────

  private async escalateToHuman(args: any, message: any): Promise<string> {
    const reason = args?.reason || 'Customer requested human assistance';
    const vapiCallId = message?.message?.call?.id;

    console.log(`[Voice] Escalation requested for call ${vapiCallId}: ${reason}`);

    // Log to call actions if possible
    if (vapiCallId) {
      this.logAction(vapiCallId, 'escalate_to_human', { reason }, { escalated: true }, true, 0).catch(e =>
        console.error('[Voice] Failed to log escalation:', e)
      );
    }

    return 'I understand. Let me connect you with our team. Someone will call you back within 30 minutes. Thank you for your patience.';
  }

  // ── Call lifecycle: handleStatusUpdate ──────────────────────────

  async handleStatusUpdate(message: any): Promise<void> {
    const call = message?.call ?? message?.message?.call;
    const status = message?.status ?? message?.message?.status;
    if (!call?.id) return;

    const userId = await this.getUserIdFromCall(message);
    if (!userId) return;

    try {
      if (status === 'in-progress') {
        await this.supabase.from('wb_calls').upsert(
          {
            user_id: userId,
            vapi_call_id: call.id,
            provider: 'vapi',
            direction: call.type === 'outboundPhoneCall' ? 'outbound' : 'inbound',
            from_number: call.phoneNumber?.number || call.customer?.number || null,
            to_number: call.phoneNumber?.twilioPhoneNumber || null,
            customer_phone: call.customer?.number || null,
            status: 'in-progress',
            started_at: new Date().toISOString(),
          },
          { onConflict: 'vapi_call_id' }
        );
      } else if (status === 'ended') {
        await this.supabase
          .from('wb_calls')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
          .eq('vapi_call_id', call.id);
      }
    } catch (err) {
      console.error('[Voice] Failed to update call status:', err);
    }
  }

  // ── Call lifecycle: handleEndOfCallReport ───────────────────────

  async handleEndOfCallReport(message: any): Promise<void> {
    const artifact = message?.artifact ?? message?.message?.artifact;
    const call = message?.call ?? message?.message?.call;
    if (!call?.id || !artifact) return;

    try {
      const transcript = artifact.transcript || null;
      const messages = artifact.messages || [];
      const recordingUrl = artifact.recordingUrl || null;
      const endedReason = artifact.endedReason || call.endedReason || null;

      // Calculate duration
      let durationSec: number | null = null;
      if (artifact.startedAt && artifact.endedAt) {
        durationSec = Math.round(
          (new Date(artifact.endedAt).getTime() - new Date(artifact.startedAt).getTime()) / 1000
        );
      }

      // Determine outcome
      const outcome = await this.determineOutcome(call.id, durationSec, endedReason);

      // Generate summary
      const summary = this.generateCallSummary(messages);

      await this.supabase
        .from('wb_calls')
        .update({
          transcript,
          summary,
          recording_url: recordingUrl,
          duration_sec: durationSec,
          outcome,
          status: 'completed',
          ended_at: artifact.endedAt || new Date().toISOString(),
        })
        .eq('vapi_call_id', call.id);
    } catch (err) {
      console.error('[Voice] Failed to save end-of-call report:', err);
    }
  }

  // ── Dynamic assistant: handleAssistantRequest ──────────────────

  async handleAssistantRequest(message: any): Promise<any> {
    const userId = await this.getUserIdFromCall(message);

    let businessName = 'our business';
    let industry = '';
    let services: string[] = [];
    let address = '';

    if (userId) {
      const { data: user } = await this.supabase
        .from('wb_users')
        .select('business_name, industry, services, business_address, google_maps_link')
        .eq('id', userId)
        .single();

      if (user) {
        businessName = user.business_name || businessName;
        industry = user.industry || '';
        services = Array.isArray(user.services) ? user.services : [];
        address = user.business_address || '';
      }
    }

    const servicesStr = services.length > 0 ? services.join(', ') : 'various products and services';
    const addressStr = address || 'address not configured';

    const systemPrompt = `You are Priya, a friendly receptionist at ${businessName}${industry ? `, a ${industry} business` : ''} in Pune.

Available products/services: ${servicesStr}
Address: ${addressStr}

RULES:
1. Speak only English. Keep answers short - 2 sentences max.
2. Never say you are AI or OpenAI. You are Priya from ${businessName}.
3. For product/car questions - use search_inventory tool first, then answer with real data.
4. For visit/test drive requests - use book_appointment tool.
5. For address questions - say: We are at ${addressStr}.
6. Be friendly, warm and natural. Sound like a real person.
7. Always search before answering about any product or price.`;

    const firstMessage = `Hello! Welcome to ${businessName}. I am Priya. How can I help you today?`;

    return {
      assistant: {
        firstMessage,
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'search_inventory',
                description: 'Search product inventory by query, budget, or category. ALWAYS use this before answering about products.',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Product search query (e.g. "Fortuner", "SUV under 10 lakh")' },
                    max_budget: { type: 'number', description: 'Maximum budget in rupees' },
                    category: { type: 'string', description: 'Product category (e.g. SUV, Sedan, Hatchback)' },
                  },
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'book_appointment',
                description: 'Book an appointment or test drive for the customer',
                parameters: {
                  type: 'object',
                  properties: {
                    customer_name: { type: 'string', description: 'Customer name' },
                    customer_phone: { type: 'string', description: 'Customer phone number' },
                    service: { type: 'string', description: 'Service type (e.g. Test Drive, Visit, Consultation)' },
                    date: { type: 'string', description: 'Preferred date' },
                    time: { type: 'string', description: 'Preferred time' },
                  },
                  required: ['customer_name', 'service'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'share_location',
                description: 'Share business location/address with customer via WhatsApp',
                parameters: {
                  type: 'object',
                  properties: {
                    customer_phone: { type: 'string', description: 'Customer phone number to send location to' },
                  },
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'escalate_to_human',
                description: 'Transfer call to human agent when customer is upset or you cannot help',
                parameters: {
                  type: 'object',
                  properties: {
                    reason: { type: 'string', description: 'Reason for escalation' },
                  },
                },
              },
            },
          ],
        },
        voice: {
          provider: 'openai',
          voiceId: 'alloy',
        },
        serverUrl: 'https://vyavsayassist.app/api/vapi/webhook',
        serverUrlSecret: 'choose_a_long_random_secret',
      },
    };
  }

  // ── Helper: getUserIdFromCall ───────────────────────────────────

  private async getUserIdFromCall(message: any): Promise<string | null> {
    // Try to extract from call metadata first
    const metadata = message?.call?.assistantOverrides?.metadata ?? message?.message?.call?.assistantOverrides?.metadata;
    if (metadata?.userId) {
      return metadata.userId;
    }

    // Hackathon fallback: single-tenant, get first user
    try {
      const { data, error } = await this.supabase
        .from('wb_users')
        .select('id')
        .limit(1)
        .single();

      if (error || !data) {
        console.error('[Voice] No user found in wb_users:', error);
        return null;
      }
      return data.id;
    } catch (err) {
      console.error('[Voice] getUserIdFromCall error:', err);
      return null;
    }
  }

  // ── Helper: logAction ──────────────────────────────────────────

  private async logAction(
    vapiCallId: string,
    actionName: string,
    args: any,
    result: any,
    success: boolean,
    latencyMs: number
  ): Promise<void> {
    try {
      // Find the wb_calls record for this vapi call
      const { data: callRecord } = await this.supabase
        .from('wb_calls')
        .select('id')
        .eq('vapi_call_id', vapiCallId)
        .single();

      if (!callRecord) {
        console.warn(`[Voice] No call record found for vapi_call_id=${vapiCallId}, skipping action log`);
        return;
      }

      await this.supabase.from('wb_call_actions').insert({
        call_id: callRecord.id,
        action_name: actionName,
        action_args: args,
        action_result: typeof result === 'string' ? { message: result } : result,
        success,
        latency_ms: latencyMs,
      });
    } catch (err) {
      console.error('[Voice] logAction error:', err);
    }
  }

  // ── Helper: determineOutcome ───────────────────────────────────

  private async determineOutcome(
    vapiCallId: string,
    durationSec: number | null,
    endedReason: string | null
  ): Promise<string> {
    // Check if there were any book_appointment or escalate actions
    try {
      const { data: callRecord } = await this.supabase
        .from('wb_calls')
        .select('id')
        .eq('vapi_call_id', vapiCallId)
        .single();

      if (callRecord) {
        const { data: actions } = await this.supabase
          .from('wb_call_actions')
          .select('action_name')
          .eq('call_id', callRecord.id);

        const actionNames = (actions || []).map((a: any) => a.action_name);

        if (actionNames.includes('book_appointment')) return 'appointment_booked';
        if (actionNames.includes('escalate_to_human')) return 'escalated';
      }
    } catch (err) {
      console.error('[Voice] determineOutcome lookup error:', err);
    }

    // Short call = dropped
    if (durationSec !== null && durationSec < 15) return 'dropped';

    // Hangup reasons that suggest customer dropped
    if (endedReason === 'customer-ended-call' || endedReason === 'customer-did-not-give-microphone-permission') {
      return 'resolved';
    }

    return 'resolved';
  }

  // ── Helper: generateCallSummary ────────────────────────────────

  private generateCallSummary(messages: any[]): string {
    if (!messages || messages.length === 0) return 'No conversation recorded.';

    const customerMessages = messages.filter(
      (m: any) => m.role === 'user' || m.role === 'customer'
    );
    const assistantMessages = messages.filter((m: any) => m.role === 'assistant' || m.role === 'bot');

    const totalTurns = customerMessages.length + assistantMessages.length;

    // Extract customer topics from their messages
    const topics: string[] = [];
    for (const msg of customerMessages) {
      const content = msg.content || msg.message || '';
      if (content.length > 5) {
        // Take the first ~60 chars as a topic hint
        topics.push(content.slice(0, 60).trim());
      }
    }

    const topicSummary = topics.length > 0
      ? `Customer asked about: ${topics.slice(0, 5).join('; ')}.`
      : 'No specific topics identified.';

    return `Call with ${totalTurns} turns. ${topicSummary}`;
  }

  // ── Helper: formatPrice ────────────────────────────────────────

  private formatPrice(price: number): string {
    if (price >= 100000) {
      const lakhs = (price / 100000).toFixed(1).replace(/\.0$/, '');
      return `${lakhs} lakh rupees`;
    }
    return `${price.toLocaleString('en-IN')} rupees`;
  }
}
