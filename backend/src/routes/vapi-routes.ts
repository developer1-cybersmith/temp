import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { VoiceService } from '../services/voice-service.js';
import { config } from '../config/environment.js';

export const vapiRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  const voiceService = new VoiceService(server.supabase);

  const getPayloadMessage = (body: any) => body?.message || body;

  const verifyWebhookSecret = (request: any): boolean => {
    if (!config.VAPI_WEBHOOK_SECRET) return true;
    const provided = request.headers['x-vapi-secret'];
    return typeof provided === 'string' && provided === config.VAPI_WEBHOOK_SECRET;
  };

  /**
   * POST /api/vapi/webhook
   * Receives all Vapi server events.
   * This endpoint is called by Vapi directly — no JWT auth required.
   */
  server.post('/webhook', async (request, reply) => {
    if (!verifyWebhookSecret(request)) {
      server.log.warn('Rejected Vapi webhook due to invalid secret');
      return reply.status(401).send({ error: 'Unauthorized webhook' });
    }

    const message = getPayloadMessage(request.body as any);

    if (!message?.type) {
      return reply.status(400).send({ error: 'Invalid webhook payload' });
    }

    console.log(`📞 [Vapi] Event: ${message.type}`);

    try {
      switch (message.type) {
        case 'tool-calls': {
          const results = await voiceService.handleToolCalls(message);
          return reply.send({ results });
        }

        case 'status-update': {
          await voiceService.handleStatusUpdate(message);
          return reply.status(200).send();
        }

        case 'end-of-call-report': {
          await voiceService.handleEndOfCallReport(message);
          return reply.status(200).send();
        }

        case 'assistant-request': {
          const assistant = await voiceService.handleAssistantRequest(message);
          return reply.send(assistant);
        }

        case 'transcript': {
          const role = message.role || 'unknown';
          const text = message.transcript || '';
          if (message.transcriptType === 'final') {
            console.log(`  📝 [${role}]: ${text}`);
          }
          return reply.status(200).send();
        }

        case 'hang': {
          console.warn(`  ⚠️ [Vapi] Agent hung — no response for extended period`);
          return reply.status(200).send();
        }

        case 'speech-update': {
          // Informational — no action needed
          return reply.status(200).send();
        }

        case 'conversation-update': {
          // Informational — no action needed
          return reply.status(200).send();
        }

        default: {
          console.log(`  [Vapi] Unhandled event: ${message.type}`);
          return reply.status(200).send();
        }
      }
    } catch (err: any) {
      console.error(`❌ [Vapi] Webhook error:`, err.message);
      // Return 200 to prevent Vapi from retrying on our errors
      return reply.status(200).send();
    }
  });

  /**
   * GET /api/vapi/calls
   * Returns recent voice calls for the authenticated user.
   */
  server.get('/calls', async (request, reply) => {
    try {
      const { status, limit } = request.query as { status?: string; limit?: string };
      const take = Math.max(1, Math.min(Number(limit || 50), 200));

      let query = server.supabase
        .from('wb_calls')
        .select('*')
        .eq('user_id', request.userId)
        .order('created_at', { ascending: false })
        .limit(take);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) {
        server.log.error({ error }, 'Failed to fetch voice calls');
        return reply.status(500).send({ error: 'Failed to fetch voice calls' });
      }

      return reply.send({ calls: data || [] });
    } catch (err: any) {
      server.log.error({ err }, 'GET /vapi/calls failed');
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/vapi/calls/:id
   * Returns one voice call for the authenticated user.
   */
  server.get('/calls/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const { data, error } = await server.supabase
        .from('wb_calls')
        .select('*')
        .eq('id', id)
        .eq('user_id', request.userId)
        .single();

      if (error || !data) {
        return reply.status(404).send({ error: 'Voice call not found' });
      }

      return reply.send({ call: data });
    } catch (err: any) {
      server.log.error({ err }, 'GET /vapi/calls/:id failed');
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/vapi/calls/:id/actions
   * Returns all actions executed during a voice call.
   */
  server.get('/calls/:id/actions', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Validate ownership via parent call lookup
      const { data: callRecord, error: callError } = await server.supabase
        .from('wb_calls')
        .select('id')
        .eq('id', id)
        .eq('user_id', request.userId)
        .single();

      if (callError || !callRecord) {
        return reply.status(404).send({ error: 'Voice call not found' });
      }

      const { data, error } = await server.supabase
        .from('wb_call_actions')
        .select('*')
        .eq('call_id', id)
        .order('created_at', { ascending: true });

      if (error) {
        server.log.error({ error }, 'Failed to fetch call actions');
        return reply.status(500).send({ error: 'Failed to fetch call actions' });
      }

      return reply.send({ actions: data || [] });
    } catch (err: any) {
      server.log.error({ err }, 'GET /vapi/calls/:id/actions failed');
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /**
   * POST /api/vapi/calls/outbound
   * Trigger an outbound AI phone call to a customer.
   */
  server.post('/calls/outbound', async (request, reply) => {
    try {
      const { phoneNumber, customerName } = request.body as { phoneNumber?: string; customerName?: string };

      if (!phoneNumber) {
        return reply.status(400).send({ error: 'phoneNumber is required' });
      }

      if (!config.VAPI_API_KEY || !config.VAPI_PHONE_NUMBER_ID) {
        return reply.status(500).send({ error: 'VAPI is not configured (missing API key or phone number ID)' });
      }

      // Fetch user's business profile for the AI assistant
      const { data: user } = await server.supabase
        .from('wb_users')
        .select('business_name, industry, services, business_address, google_maps_link')
        .eq('id', request.userId)
        .single();

      const businessName = user?.business_name || 'our business';
      const industry = user?.industry || 'General';
      const services = Array.isArray(user?.services) ? user.services.join(', ') : 'various products and services';
      const address = user?.business_address || 'address not configured';

      const systemPrompt = `You are a friendly, professional phone receptionist for ${businessName}${industry ? `, a ${industry} business` : ''}.

Business details:
- Name: ${businessName}
- Industry: ${industry}
- Services/Products: ${services}
- Address: ${address}

VOICE RULES (critical):
- Keep every response under 3 sentences. Callers are on the phone, not reading.
- Speak naturally and warmly. Use conversational language, not robotic phrases.
- Never say "as an AI" or "I'm a virtual assistant". You are the receptionist.
- Always confirm details before booking an appointment.
- If the customer speaks Hindi or Hinglish, respond in the same language naturally.
- This is an OUTBOUND call — you called the customer. Introduce yourself and the business first.

TOOLS - use them proactively:
- search_inventory: When a customer asks about any product, price, or availability. NEVER make up prices. Always search first.
- book_appointment: When a customer wants to schedule a visit, test drive, or meeting.
- share_location: When a customer asks for directions or address. Ask for their phone number to send via WhatsApp.
- escalate_to_human: When the customer is upset or you cannot answer their question.

FLOW:
1. Introduce yourself: "Hi${customerName ? ` ${customerName}` : ''}, this is calling from ${businessName}."
2. State purpose briefly and ask how you can help.
3. Listen and use the right tool.
4. Confirm and end politely.`;

      const toolDefinitions = [
        {
          type: 'function',
          function: {
            name: 'search_inventory',
            description: 'Search product inventory by query, budget, or category',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Product search query' },
                max_budget: { type: 'number', description: 'Maximum budget' },
                category: { type: 'string', description: 'Product category' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'book_appointment',
            description: 'Book an appointment for the customer',
            parameters: {
              type: 'object',
              properties: {
                customer_name: { type: 'string' },
                customer_phone: { type: 'string' },
                service: { type: 'string' },
                date: { type: 'string' },
                time: { type: 'string' },
              },
              required: ['customer_name', 'service'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'share_location',
            description: 'Share business location with customer',
            parameters: {
              type: 'object',
              properties: {
                customer_phone: { type: 'string' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'escalate_to_human',
            description: 'Transfer call to human agent',
            parameters: {
              type: 'object',
              properties: {
                reason: { type: 'string' },
              },
            },
          },
        },
      ];

      // Determine webhook URL for VAPI callbacks
      const webhookUrl = config.FRONTEND_URL.includes('localhost')
        ? undefined
        : `${config.FRONTEND_URL.replace(/\/$/, '').replace(':3004', ':3005')}/api/vapi/webhook`;

      const vapiPayload = {
        phoneNumberId: config.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`,
          name: customerName || undefined,
        },
        assistant: {
          firstMessage: `Hello${customerName ? ` ${customerName}` : ''}! This is a call from ${businessName}. How can I help you today?`,
          model: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }],
            tools: toolDefinitions,
          },
          voice: { provider: 'openai', voiceId: 'alloy' },
          serverUrl: webhookUrl,
          metadata: { userId: request.userId },
        },
      };

      console.log(`📞 [Outbound] Initiating call to ${phoneNumber} for user ${(request.userId as string).slice(0, 8)}`);

      const response = await fetch('https://api.vapi.ai/call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.VAPI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vapiPayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ [Outbound] VAPI API error:`, response.status, errorBody);
        return reply.status(response.status).send({ error: 'Failed to initiate call', details: errorBody });
      }

      const data = await response.json() as any;
      console.log(`✅ [Outbound] Call initiated: ${data.id} → ${phoneNumber}`);

      return reply.send({ callId: data.id, status: data.status || 'queued' });
    } catch (err: any) {
      console.error(`❌ [Outbound] Call failed:`, err.message);
      return reply.status(500).send({ error: err.message || 'Failed to initiate call' });
    }
  });
};
