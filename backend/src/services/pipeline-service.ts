import { SupabaseClient } from '@supabase/supabase-js';
import { analyzeMessage, generateReply, generateSummary, AnalysisResult, identifyCarFromImage } from './ai-router.js';
import { RagService } from './rag-service.js';
import { CatalogService } from './catalog-service.js';
import { cloudClient as baileysAdapter } from './whatsapp-cloud-client.js';
import { reminderService } from './reminder-service.js';
import { AppointmentService } from './appointment-service.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js';
import { getDomain } from '../domains/domain-router.js';
import type { BaseDomain } from '../domains/types.js';

/** Optional media attachment from Baileys adapter */
export interface MediaAttachment {
  type: 'voice_note' | 'image';
  base64?: string;
  mimetype?: string;
  durationSecs?: number;
  /** Public URL in Supabase Storage — for dashboard playback/viewing */
  mediaUrl?: string;
}

const URL_REGEX = /^https?:\/\//i;

/**
 * PipelineService — the AI orchestrator.
 * Flow: Store → Analyze → Route (Inventory or Knowledge) → Score Lead → Extract Tasks → Auto-Reply
 */
export class PipelineService {
  private rag: RagService;
  private catalog: CatalogService;
  private appointments: AppointmentService;

  constructor(private supabase: SupabaseClient) {
    this.rag = new RagService(supabase);
    this.catalog = new CatalogService(supabase, this.rag);
    this.appointments = new AppointmentService(supabase);
  }

  getRagService(): RagService {
    return this.rag;
  }

  getCatalogService(): CatalogService {
    return this.catalog;
  }

  async processIncomingMessage(
    userId: string,
    customerJid: string,
    customerName: string,
    customerPhone: string,
    messageText: string,
    media?: MediaAttachment
  ): Promise<{ success: boolean; autoReplied: boolean; analysis: any; replyText?: string }> {
   try {
    // 1. Fetch or create user
    let { data: user } = await this.supabase
      .from('wb_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!user) {
      const { data: newUser } = await this.supabase
        .from('wb_users')
        .insert({
          id: userId,
          email: `${userId.slice(0, 8)}@demo.com`,
          business_name: 'Demo Business',
          auto_reply_enabled: true,
        })
        .select()
        .single();
      user = newUser;
    }

    if (!user) {
      console.warn(`❌ [Pipeline] Could not find/create user ${userId.slice(0, 8)}`);
      return { success: false, autoReplied: false, analysis: null };
    }

    // Resolve domain config from user's industry
    const domain = getDomain(user.industry);

    // 2. Find or create conversation
    let { data: conversation } = await this.supabase
      .from('wb_conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('customer_jid', customerJid)
      .single();

    if (!conversation) {
      const { data: newConvo } = await this.supabase
        .from('wb_conversations')
        .insert({
          user_id: userId,
          customer_jid: customerJid,
          customer_name: customerName,
          customer_phone: customerPhone,
          status: 'active',
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();
      conversation = newConvo;
    } else {
      await this.supabase
        .from('wb_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          customer_name: customerName,
        })
        .eq('id', conversation.id);
    }

    if (!conversation) {
      console.warn(`❌ [Pipeline] Failed to find/create conversation`);
      return { success: false, autoReplied: false, analysis: null };
    }

    // 2.5. Upsert unified customer record and link conversation
    const customerId = await this.upsertCustomerFromWhatsApp(
      userId,
      customerJid,
      customerName,
      customerPhone,
    );
    if (customerId && !conversation.customer_id) {
      await this.supabase
        .from('wb_conversations')
        .update({ customer_id: customerId })
        .eq('id', conversation.id);
      conversation.customer_id = customerId;
    }

    // 3. Store incoming message (annotate source if voice/image)
    const senderLabel = media?.type === 'voice_note' ? 'customer'
      : media?.type === 'image' ? 'customer'
      : 'customer';
    const storedContent = media?.type === 'voice_note'
      ? `🎤 [Voice Note]: ${messageText}`
      : messageText;
    const mediaTypeForDb = media?.type === 'voice_note' ? 'voice'
      : media?.type === 'image' ? 'image'
      : null;
    await this.supabase.from('wb_messages').insert({
      conversation_id: conversation.id,
      sender: senderLabel,
      content: storedContent,
      media_type: mediaTypeForDb,
      media_url: media?.mediaUrl ?? null,
      media_mime_type: media?.mimetype ?? null,
    });

    // 4. Get conversation history for context — load MORE messages for better memory
    const { data: history } = await this.supabase
      .from('wb_messages')
      .select('sender, content')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(domain.limits.historyLoadLimit);

    const historyStrings = (history || []).map(
      (m: any) => `${m.sender}: ${m.content}`
    );

    // Conversation cap — auto-escalate extremely long conversations to prevent bloat
    if (historyStrings.length >= 150) {
      console.warn(`⚠️ [Pipeline] Conversation ${conversation.id} hit 150 message cap — auto-escalating`);
      const capMsg = 'This conversation has been quite detailed! Let me connect you with our team for more personalized help. They will continue from here.';
      try {
        await baileysAdapter.sendMessage(userId, customerJid, capMsg);
        await this.supabase.from('wb_messages').insert({
          conversation_id: conversation.id, sender: 'ai', content: capMsg,
        });
        // Don't auto-pause — AI keeps replying (for demo/hackathon reliability)
      } catch (capErr: any) {
        console.error('[Pipeline] Cap escalation failed:', capErr.message);
      }
      return { success: true, autoReplied: true, analysis: null };
    }

    // 4.5 IMAGE RECOGNITION — if customer sent a car photo, identify and match inventory
    if (media?.type === 'image' && media.base64 && media.mimetype) {
      console.log(`  [Pipeline] 📷 Image received — running car identification...`);
      try {
        const carId = await identifyCarFromImage(media.base64, media.mimetype);
        console.log(`  [Pipeline] Car ID result:`, JSON.stringify(carId));

        if (carId.is_car) {
          // Search inventory for matching cars
          const queryText = `${carId.brand} ${carId.model} ${carId.year_estimate} ${carId.color} ${carId.body_type}`;
          const matches = await this.catalog.hybridSearch(userId, queryText, {
            product_name: `${carId.brand} ${carId.model}`,
            category: carId.body_type || undefined,
            attributes: {
              ...(carId.brand ? { brand: carId.brand } : {}),
              ...(carId.color ? { color: carId.color } : {}),
            },
          });

          const available = matches.filter((m: any) => m.quantity > 0);
          const useHinglish = domain.patterns.hinglishHint.test(messageText) ||
            (historyStrings.length > 0 && domain.patterns.hinglishHint.test(historyStrings.slice(-3).join(' ')));

          let imageReply: string;
          if (available.length > 0) {
            const itemList = available.slice(0, 3).map((item: any, i: number) => {
              const price = item.price ? (item.price >= 100000 ? `₹${(item.price / 100000).toFixed(1)}L` : `₹${item.price}`) : 'Price on request';
              const attrs = item.attributes || {};
              const details = [attrs.year, attrs.fuel_type, attrs.transmission, attrs.color].filter(Boolean).join(', ');
              return `${i + 1}. ${item.item_name} — ${price}${details ? ` (${details})` : ''}`;
            }).join('\n');

            imageReply = useHinglish
              ? `Ye ${carId.brand} ${carId.model} ${carId.color || ''} lagti hai! 🚗\n\nHamare paas similar options hain:\n${itemList}\n\nKoi particular car dekhna chahenge? Photos bhej sakta hoon! 📸`
              : `This looks like a ${carId.brand} ${carId.model} ${carId.color || ''}! 🚗\n\nWe have similar options available:\n${itemList}\n\nWould you like to see photos or details of any of these?`;
          } else {
            imageReply = useHinglish
              ? `Ye ${carId.brand} ${carId.model} ${carId.year_estimate || ''} ${carId.color || ''} lagti hai.\n\nAbhi hamare paas ye exact model available nahi hai, lekin kuch similar options dekhna chahenge?`
              : `This looks like a ${carId.brand} ${carId.model} ${carId.year_estimate || ''} ${carId.color || ''}.\n\nWe don't have this exact model right now, but would you like to see similar options?`;
          }

          // Send reply and store
          const sent = await baileysAdapter.sendMessage(userId, customerJid, imageReply);
          if (sent) {
            await this.supabase.from('wb_messages').insert({
              conversation_id: conversation.id, sender: 'ai', content: imageReply,
            });

            // Send photos of matched items
            for (const item of available.slice(0, 2)) {
              const images = this.extractImageUrls(item);
              if (images.length > 0) {
                const price = item.price ? (item.price >= 100000 ? `₹${(item.price / 100000).toFixed(1)}L` : `₹${item.price}`) : '';
                await baileysAdapter.sendImage(userId, customerJid, images[0], `${item.item_name}${price ? ` — ${price}` : ''}`);
              }
            }
          }

          // Update lead with image-based inquiry
          await this.upsertLead(userId, conversation.id, customerName, {
            intent: 'inventory_inquiry',
            lead_score: 'medium',
            confidence: 0.8,
            tasks: [],
            appointment: null,
            should_auto_reply: true,
            escalation_reason: null,
            language_detected: useHinglish ? 'hi' : 'en',
            summary_update: `Customer sent a photo of ${carId.brand} ${carId.model}. ${available.length > 0 ? `Matched ${available.length} inventory items.` : 'No exact match in inventory.'}`,
            entities: {
              product_name: `${carId.brand} ${carId.model}`,
              category: carId.body_type,
              brand: carId.brand,
              price_min: null,
              price_max: null,
              attributes: { color: carId.color, year: carId.year_estimate },
            },
            query_type: 'structured',
          }, domain, conversation);

          return { success: true, autoReplied: true, analysis: null, replyText: imageReply };
        } else {
          console.log(`  [Pipeline] Image is not a car — processing caption as text`);
          // Not a car image — fall through to normal text processing with caption
        }
      } catch (imgErr: any) {
        console.error(`  [Pipeline] ❌ Car identification failed: ${imgErr.message} — falling through to text processing`);
      }
    }

    // 4.6 Build conversation memory — a compressed summary of what's been discussed
    // This prevents the AI from asking repetitive questions
    const conversationMemory = await this.buildConversationMemory(conversation, historyStrings);

    // 5. Run AI analysis (now includes entity extraction + conversation memory)
    const aiMessageText = messageText.slice(0, 1500);
    const analysis = await analyzeMessage(aiMessageText, historyStrings, {
      business_name: user.business_name || '',
      industry: user.industry || '',
      services: user.services || [],
    }, domain);

    console.log(`\n[Pipeline] AI Analysis for "${messageText.slice(0, 50)}...":`);
    console.log(`  Intent: ${analysis.intent} | Score: ${analysis.lead_score} | QueryType: ${analysis.query_type}`);
    if (analysis.entities) {
      console.log(`  Entities:`, JSON.stringify(analysis.entities));
    }

    // 6. Update message with detected intent
    await this.supabase
      .from('wb_messages')
      .update({ intent: analysis.intent, confidence: analysis.confidence })
      .eq('conversation_id', conversation.id)
      .eq('content', messageText)
      .order('created_at', { ascending: false })
      .limit(1);

    // 7. Create or update lead + advance funnel stage
    await this.upsertLead(userId, conversation.id, customerName, analysis, domain, conversation);

    // 7.5 Accumulate buying signal score
    const buyingSignalScore = this.accumulateBuyingSignals(conversation, analysis, domain);
    if (buyingSignalScore > (conversation.buying_signal_score || 0)) {
      await this.supabase
        .from('wb_conversations')
        .update({ buying_signal_score: buyingSignalScore })
        .eq('id', conversation.id);
    }

    // 7.6 Inject close-mode prompt if buying signals are strong
    if (buyingSignalScore >= 0.7) {
      historyStrings.push('System: BUYING SIGNALS ARE HIGH — customer is seriously interested. Suggest concrete next step (test drive, booking, token). Create gentle urgency if appropriate.');
    }

    // 8. Create extracted tasks
    for (const task of analysis.tasks) {
      await this.supabase.from('wb_tasks').insert({
        user_id: userId,
        conversation_id: conversation.id,
        title: task.description,
        due_date: task.due_date,
        is_completed: false,
      });
    }

    // 8.5. Schedule appointment reminders
    console.log(`  [Pipeline] Appointment data:`, JSON.stringify(analysis.appointment));

    let skipInventorySearch = false;

    if (analysis.appointment?.proposed_time_iso) {
      const serviceName = analysis.appointment.service || domain.defaultAppointmentService;
      const dueDate = analysis.appointment.proposed_time_iso.split('T')[0];
      const taskTitle = `📅 Appointment: ${customerName} — ${serviceName}`;

      console.log(`  [Pipeline] Checking slot availability for ${analysis.appointment.proposed_time_iso}...`);

      const slotResult = await this.appointments.bookSlot(userId, {
        customerName,
        service: serviceName,
        dateTimeIso: analysis.appointment.proposed_time_iso,
        conversationId: conversation.id,
      });

      if (!slotResult.success) {
        // Slot not available — inject alternatives into conversation context
        const hasAlternatives = slotResult.alternatives && slotResult.alternatives.length > 0;
        if (hasAlternatives) {
          const altTimes = slotResult.alternatives!.join(', ');
          console.log(`  [Pipeline] ❌ Slot not available. Alternatives: ${altTimes}`);
          historyStrings.push(`System: The requested time slot is not available. Available times on that day: ${altTimes}. Please suggest these to the customer.`);
        } else {
          console.log(`  [Pipeline] ❌ Slot not available. No alternatives (business may be closed).`);
          historyStrings.push(`System: The requested time slot is not available and there are no open slots on that day. The business is closed on that day. They are open Monday–Saturday, 10 AM to 7 PM. Inform the customer and suggest they pick another day within business hours.`);
        }
        // Customer asked to book — don't search inventory or send photos
        skipInventorySearch = true;
      } else {
        // Slot available — bookSlot() already inserted the task into wb_tasks,
        // so we only need to schedule reminders here.
        console.log(`  [Pipeline] ✅ Slot booked by appointment-service: "${taskTitle}" on ${dueDate}`);

        reminderService.scheduleReminders(userId, customerJid, customerName, serviceName, analysis.appointment.proposed_time_iso);

        historyStrings.push(`System: Appointment for ${analysis.appointment.proposed_time_iso} for ${serviceName} has been booked! Confirm warmly.`);
      }
    } else if (analysis.appointment && !analysis.appointment.proposed_time_iso) {
      console.log(`  [Pipeline] ⚠️ Appointment detected but no time extracted — fetching available slots`);

      // Fetch available slots for today and tomorrow so the AI can suggest them
      const now = new Date();
      const todayDate = now.toISOString().split('T')[0];
      const tomorrowDate = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

      const [todaySlots, tomorrowSlots] = await Promise.all([
        this.appointments.getAvailableSlots(userId, todayDate),
        this.appointments.getAvailableSlots(userId, tomorrowDate),
      ]);

      const todaySlotsStr = todaySlots.length > 0 ? todaySlots.join(', ') : 'No slots available';
      const tomorrowSlotsStr = tomorrowSlots.length > 0 ? tomorrowSlots.join(', ') : 'No slots available';

      console.log(`  [Pipeline] Available slots — today (${todayDate}): ${todaySlotsStr} | tomorrow (${tomorrowDate}): ${tomorrowSlotsStr}`);

      historyStrings.push(
        `System: Customer wants to book but hasn't specified a time. Available time slots for today (${todayDate}): ${todaySlotsStr}. Available time slots for tomorrow (${tomorrowDate}): ${tomorrowSlotsStr}. Share these options with the customer and ask which slot they prefer.`
      );
    } else {
      console.log(`  [Pipeline] No appointment in this message`);
    }

    // 9. Update conversation summary (fire-and-forget — non-blocking)
    if (historyStrings.length >= 3) {
      generateSummary(historyStrings, domain)
        .then(summary => this.supabase.from('wb_conversations').update({ summary, language: analysis.language_detected }).eq('id', conversation.id))
        .catch(err => console.error('[Pipeline] Summary update failed:', err.message));
    }

    // ──────────────────────────────────────────────
    // 10. SMART CONTEXT FETCHING
    // Route to inventory OR knowledge base based on intent
    // Skip entirely when handling a failed appointment booking
    // ──────────────────────────────────────────────

    let knowledgeChunks: string[] = [];
    let inventoryContext: { items: any[]; soldItems?: any[]; alternatives?: any[] } | null = null;

    if (skipInventorySearch) {
      console.log(`  [Pipeline] → Skipping inventory search (appointment booking flow)`);
    }

    const isPhotoRequest = !skipInventorySearch && domain.patterns.photoRequest.test(messageText);
    const isNegotiationRequest = !skipInventorySearch && domain.patterns.negotiation.test(messageText);

    // Infer product from context ONLY when AI didn't already extract a product name.
    // If the customer said "Hyundai car photos", AI extracts brand=Hyundai — don't override with Thar from old context.
    let inferredProductName: string | undefined;
    const alreadyHasProduct = !!analysis.entities?.product_name || !!analysis.entities?.brand;
    const shouldInferProduct = !alreadyHasProduct && (
      isPhotoRequest || isNegotiationRequest ||
      (analysis.intent === 'inventory_inquiry' && !analysis.entities?.product_name) ||
      (analysis.intent === 'pricing_inquiry' && !analysis.entities?.product_name)
    );

    if (shouldInferProduct) {
      inferredProductName = await this.inferProductFromRecentContext(userId, historyStrings);
      if (inferredProductName) {
        historyStrings.push(`System: Customer has already selected product: ${inferredProductName}. Do not ask which product again unless they change it.`);
        analysis.entities = {
          ...(analysis.entities || {
            product_name: null,
            category: null,
            brand: null,
            price_min: null,
            price_max: null,
            attributes: {},
          }),
          product_name: analysis.entities?.product_name || inferredProductName,
        };
      }
    }

    const isInventoryQuery = !skipInventorySearch && (
      domain.inventoryIntents.includes(analysis.intent) ||
      analysis.query_type !== 'general' ||
      isPhotoRequest ||
      isNegotiationRequest ||
      Boolean(analysis.entities?.product_name));

    if (isInventoryQuery) {
      // Check if this is a general "show me everything" browse vs specific product query
      const hasSpecificFilters = analysis.entities?.product_name ||
        analysis.entities?.category || analysis.entities?.brand ||
        analysis.entities?.price_min || analysis.entities?.price_max ||
        (analysis.entities?.attributes && Object.keys(analysis.entities.attributes).length > 0);

      if (!hasSpecificFilters && analysis.intent === 'inventory_browse') {
        // GENERAL BROWSE — "kaunsi gaadiya hai?", "what do you have?" → list ALL items
        console.log(`  [Pipeline] → General browse — listing ALL available items`);

        const allItems = await this.catalog.listItems(userId, {
          status: 'available',
          limit: domain.limits.browseItemLimit,
          sort: 'price_asc',
        });

        inventoryContext = {
          items: allItems.items,
        };
      } else if (analysis.entities) {
        // SPECIFIC SEARCH — "Honda City in white under 8 lakhs"
        console.log(`  [Pipeline] → Specific inventory search with filters`);

        const result = await this.catalog.searchWithAlternatives(userId, messageText, {
          product_name: analysis.entities.product_name || undefined,
          category: analysis.entities.category || analysis.entities.brand || undefined,
          price_min: analysis.entities.price_min || undefined,
          price_max: analysis.entities.price_max || undefined,
          attributes: analysis.entities.attributes || undefined,
        });

        const available = result.exact.filter(i => i.quantity > 0);
        const sold = result.exact.filter(i => i.quantity <= 0);

        inventoryContext = {
          items: available,
          soldItems: sold.length > 0 ? sold : undefined,
          alternatives: result.alternatives.length > 0 ? result.alternatives : undefined,
        };
      }

      const itemCount = inventoryContext?.items?.length || 0;
      console.log(`  [Pipeline] Inventory results: ${itemCount} items found`);

      // If no inventory results, search knowledge AND fetch some available items for context
      if (itemCount === 0) {
        console.log(`  [Pipeline] → No inventory match, falling back to knowledge base + listing available`);
        knowledgeChunks = await this.rag.searchKnowledge(userId, messageText);

        // Give the AI some available items so it can suggest alternatives instead of saying "I can only help with products"
        const availableItems = await this.catalog.listItems(userId, { status: 'available', limit: 5, sort: 'price_asc' });
        if (availableItems.items.length > 0) {
          inventoryContext = { items: availableItems.items };
          const productName = analysis.entities?.product_name || 'that product';
          historyStrings.push(`System: ${productName} is NOT in our inventory. Show the customer what IS available as alternatives. Be honest that we don't have their requested item.`);
        }
      }
    } else if (!skipInventorySearch) {
      // KNOWLEDGE PATH — general question, search text knowledge base
      console.log(`  [Pipeline] → Routing to KNOWLEDGE BASE search`);
      knowledgeChunks = await this.rag.searchKnowledge(userId, messageText);
    }

    // ──────────────────────────────────────────────
    // 11. AUTO-REPLY DECISION
    // ──────────────────────────────────────────────

    let autoReplied = false;
    const isAutoReplyEnabled = user.auto_reply_enabled !== false;

    const shouldReply =
      isAutoReplyEnabled &&
      !conversation.ai_paused &&
      analysis.should_auto_reply &&
      (analysis.confidence >= (user.ai_confidence_threshold || domain.limits.confidenceThreshold) ||
        domain.autoReplyIntents.includes(analysis.intent)) &&
      !analysis.escalation_reason;

    console.log(
      `  [Pipeline] shouldReply=${shouldReply} | autoReply=${isAutoReplyEnabled} | paused=${conversation.ai_paused} | analysisAuto=${analysis.should_auto_reply} | confidence=${analysis.confidence} | threshold=${user.ai_confidence_threshold || domain.limits.confidenceThreshold} | intent=${analysis.intent} | escalation=${analysis.escalation_reason || 'none'}`
    );

    // Handle location inquiries — share address + Google Maps link
    if (analysis.intent === 'location_inquiry') {
      const address = user.business_address || '';
      const mapsLink = user.google_maps_link || '';
      const useHinglish = analysis.language_detected.startsWith('hi') || domain.patterns.hinglishHint.test(messageText);

      const templates = useHinglish ? domain.locationTemplates : domain.locationTemplates;
      const lang = useHinglish ? 'hi' : 'en';

      let locationReply: string;
      if (address && mapsLink) {
        locationReply = templates.full[lang].replace('{address}', address).replace('{mapsLink}', mapsLink);
      } else if (address) {
        locationReply = templates.addressOnly[lang].replace('{address}', address);
      } else if (mapsLink) {
        locationReply = templates.mapsOnly[lang].replace('{mapsLink}', mapsLink);
      } else {
        locationReply = templates.none[lang];
      }

      const sent = await baileysAdapter.sendMessage(userId, customerJid, locationReply);
      if (sent) {
        await this.supabase.from('wb_messages').insert({
          conversation_id: conversation.id,
          sender: 'ai',
          content: locationReply,
        });
        autoReplied = true;
      }
      return { success: true, autoReplied, analysis };
    }

    if (analysis.intent === 'price_negotiation' || isNegotiationRequest) {
      // Track negotiation round
      const currentRound = (conversation.negotiation_round || 0) + 1;
      await this.supabase
        .from('wb_conversations')
        .update({ negotiation_round: currentRound })
        .eq('id', conversation.id);

      // Check if we should escalate to human (round > maxRounds)
      if (currentRound > domain.negotiationConfig.maxRounds) {
        const escalationMsg = analysis.language_detected.startsWith('hi')
          ? 'Bhai, ye price meri authority se bahar hai. Main aapko direct owner se baat karwa deta hoon — wo final call le lenge.'
          : 'This is beyond my authority. Let me connect you directly with the owner who can take the final call.';

        const sent = await baileysAdapter.sendMessage(userId, customerJid, escalationMsg);
        if (sent) {
          await this.supabase.from('wb_messages').insert({
            conversation_id: conversation.id, sender: 'ai', content: escalationMsg,
          });
          // Don't pause — AI keeps replying for demo reliability
          autoReplied = true;
        }
        return { success: true, autoReplied, analysis };
      }

      const product = analysis.entities?.product_name || inferredProductName || inventoryContext?.items?.[0]?.item_name;
      const offeredBudget = this.extractBudgetInr(messageText) || this.findLatestCustomerBudget(historyStrings);
      const referenceItem = inventoryContext?.items?.[0] || inventoryContext?.soldItems?.[0] || null;
      const negotiationReply = this.buildNegotiationReply(
        messageText,
        analysis.language_detected,
        product,
        offeredBudget,
        referenceItem,
        domain
      );

      const sent = await baileysAdapter.sendMessage(userId, customerJid, negotiationReply);
      if (sent) {
        await this.supabase.from('wb_messages').insert({
          conversation_id: conversation.id, sender: 'ai', content: negotiationReply,
        });
        autoReplied = true;
      }

      return { success: true, autoReplied, analysis };
    }

    // Human handoff: escalate on complaint or frustrated sentiment
    if (analysis.intent === 'complaint' ||
        (analysis.sentiment && analysis.sentiment.polarity < -0.5)) {
      const handoffMsg = analysis.language_detected.startsWith('hi')
        ? 'Ji, main samajh sakta hoon. Main aapko hamare senior team member se connect karwa deta hoon jo aapki better help kar sakenge.'
        : 'I understand your concern. Let me connect you with a senior team member who can help you better.';

      await baileysAdapter.sendMessage(userId, customerJid, handoffMsg);
      await this.supabase.from('wb_messages').insert({
        conversation_id: conversation.id, sender: 'ai', content: handoffMsg,
      });
      // Don't pause — AI keeps replying for demo reliability
      return { success: true, autoReplied: true, analysis };
    }

    if (shouldReply) {
      let mediaSent = false;

      // Only send images for SPECIFIC product inquiries (1-2 items) and explicit photo requests
      // Do NOT send images for: browse/listing, bookings, meetings, greetings, general questions
      const isSpecificProductQuery = analysis.intent === 'inventory_inquiry' || analysis.intent === 'pricing_inquiry';
      const hasSpecificProduct = !!(analysis.entities?.product_name || inferredProductName);
      const shouldSendImages = isPhotoRequest || (isSpecificProductQuery && hasSpecificProduct && !analysis.appointment?.proposed_time_iso);

      // Never send photos for browse/listing queries ("kaunsi gaadiya hai?")
      // Browse = many items, photos would be spammy

      if (shouldSendImages && inventoryContext?.items && inventoryContext.items.length > 0) {
        const itemsForMedia = isPhotoRequest
          ? inventoryContext.items.slice(0, 1)
          : (inventoryContext.items.length <= 3 ? inventoryContext.items : []);

        for (const item of itemsForMedia) {
          const images = this.extractImageUrls(item);

          if (images.length === 0) {
            continue;
          }

          const mediaList = isPhotoRequest ? images.slice(0, domain.limits.maxPhotosPerRequest) : images.slice(0, 1);
          for (let i = 0; i < mediaList.length; i++) {
            const imageUrl = mediaList[i];
            const price = item.price
              ? (item.price >= 100000 ? `₹${(item.price / 100000).toFixed(1)}L` : `₹${item.price}`)
              : '';
            const caption = i === 0
              ? `${item.item_name}${price ? ` — ${price}` : ''}`
              : `${item.item_name} — photo ${i + 1}`;
            const sentImage = await baileysAdapter.sendImage(userId, customerJid, imageUrl, caption);
            mediaSent = mediaSent || sentImage;
          }
        }
      }

      let replyText = '';

      // Deterministic photo acknowledgement avoids repetitive LLM asks like "which car?"
      if (isPhotoRequest) {
        const selectedProduct = analysis.entities?.product_name || inferredProductName || inventoryContext?.items?.[0]?.item_name;
        replyText = this.buildPhotoReply(analysis.language_detected, selectedProduct, mediaSent, domain);
      } else {
        // Generate reply with inventory, knowledge, AND conversation memory
        replyText = await generateReply(
          aiMessageText,
          historyStrings,
          knowledgeChunks,
          {
            business_name: user.business_name || '',
            industry: user.industry || '',
            services: user.services || [],
          },
          analysis.language_detected,
          inventoryContext,
          conversationMemory,
          domain
        );
      }

      const finalReplyText = mediaSent ? this.stripUrls(replyText, domain.fallbacks.photoFallback) : replyText;

      // Send text reply
      const sent = await baileysAdapter.sendMessage(userId, customerJid, finalReplyText);
      if (sent) {
        await this.supabase.from('wb_messages').insert({
          conversation_id: conversation.id,
          sender: 'ai',
          content: finalReplyText,
        });
        autoReplied = true;
      }

      return { success: true, autoReplied, analysis, replyText: autoReplied ? finalReplyText : undefined };
    } else if (!conversation.ai_paused && !analysis.escalation_reason) {
      // Fallback acknowledgement to avoid silent chats when AI gating blocks a full reply.
      const fallback = domain.fallbacks.genericAcknowledgement;
      const sent = await baileysAdapter.sendMessage(userId, customerJid, fallback);
      if (sent) {
        await this.supabase.from('wb_messages').insert({
          conversation_id: conversation.id,
          sender: 'ai',
          content: fallback,
        });
        autoReplied = true;
      }
    }

    return { success: true, autoReplied, analysis };
   } catch (err) {
    console.error('[Pipeline] CRITICAL pipeline crash:', err);
    try {
      await baileysAdapter.sendMessage(userId, customerJid, 'Thanks for your message! Our team will get back to you shortly.');
    } catch (_) {
      // Socket may also be down — silently ignore
    }
    return { success: false, autoReplied: false, analysis: null };
   }
  }

  /** Upsert lead — create new or upgrade score if higher, advance funnel stage */
  private async upsertLead(
    userId: string,
    conversationId: string,
    customerName: string,
    analysis: AnalysisResult,
    domain: BaseDomain,
    conversation: any
  ): Promise<void> {
    const { data: existingLead } = await this.supabase
      .from('wb_leads')
      .select('*')
      .eq('conversation_id', conversationId)
      .single();

    // Determine funnel stage based on intent
    const currentStage = conversation.funnel_stage || 'inquiry';
    const newStage = this.advanceFunnelStage(currentStage, analysis.intent, domain);

    if (existingLead) {
      const scorePriority: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const shouldUpdate =
        (scorePriority[analysis.lead_score] || 0) > (scorePriority[existingLead.score] || 0) ||
        newStage !== existingLead.stage;

      if (shouldUpdate) {
        await this.supabase
          .from('wb_leads')
          .update({
            score: analysis.lead_score,
            intent: analysis.intent,
            summary: analysis.summary_update,
            customer_name: customerName,
            ...(newStage !== existingLead.stage ? { stage: newStage } : {}),
          })
          .eq('id', existingLead.id);
      }
    } else {
      await this.supabase.from('wb_leads').insert({
        user_id: userId,
        conversation_id: conversationId,
        customer_name: customerName,
        score: analysis.lead_score,
        stage: newStage,
        intent: analysis.intent,
        summary: analysis.summary_update,
      });
    }

    // Update conversation funnel stage if advanced
    if (newStage !== currentStage) {
      await this.supabase
        .from('wb_conversations')
        .update({ funnel_stage: newStage })
        .eq('id', conversation.id);
      console.log(`  [Pipeline] Funnel: ${currentStage} → ${newStage}`);
    }
  }

  /** Advance funnel stage based on detected intent — forward only, never regress */
  private advanceFunnelStage(currentStage: string, intent: string, domain: BaseDomain): string {
    // Stage ordering for forward-only progression
    const stageOrder: Record<string, number> = {
      inquiry: 1,
      qualification: 2,
      test_drive: 3,
      negotiation: 4,
      booking: 5,
      documentation: 6,
      delivery: 7,
      // Fallback for generic domain
      new: 1,
      engaged: 2,
      negotiating: 3,
      booked: 4,
    };

    // Intent → target stage mapping
    const intentToStage: Record<string, string> = {
      greeting: 'inquiry',
      general_question: 'inquiry',
      inventory_browse: 'qualification',
      inventory_inquiry: 'qualification',
      pricing_inquiry: 'qualification',
      inventory_compare: 'qualification',
      test_drive_request: 'test_drive',
      meeting_request: 'test_drive',
      price_negotiation: 'negotiation',
      trade_in_inquiry: 'negotiation',
      financing_inquiry: 'negotiation',
      ready_to_buy: 'booking',
      urgency_signal: 'booking',
      document_inquiry: 'documentation',
    };

    const targetStage = intentToStage[intent] || currentStage;
    const currentOrder = stageOrder[currentStage] || 1;
    const targetOrder = stageOrder[targetStage] || 1;

    // Only advance forward, never regress
    return targetOrder > currentOrder ? targetStage : currentStage;
  }

  /** Accumulate buying signal score from intent history */
  private accumulateBuyingSignals(conversation: any, analysis: AnalysisResult, domain: BaseDomain): number {
    let score = conversation.buying_signal_score || 0;

    // Intent-based signals
    const signalWeights: Record<string, number> = {
      financing_inquiry: 0.2,
      document_inquiry: 0.15,
      test_drive_request: 0.25,
      insurance_inquiry: 0.1,
      trade_in_inquiry: 0.2,
      ready_to_buy: 0.3,
      urgency_signal: 0.25,
      price_negotiation: 0.15,
      meeting_request: 0.1,
    };

    const weight = signalWeights[analysis.intent];
    if (weight) {
      score = Math.min(1.0, score + weight);
    }

    // Boost for excited sentiment
    if (analysis.sentiment && analysis.sentiment.polarity > 0.5) {
      score = Math.min(1.0, score + 0.05);
    }

    return score;
  }

  /**
   * Build a compressed conversation memory from the full chat history.
   * This gives the AI a "summary of what happened so far" so it doesn't repeat questions
   * or forget what the customer already told us.
   */
  private async buildConversationMemory(conversation: any, historyStrings: string[]): Promise<string> {
    const parts: string[] = [];
    const now = new Date();

    // 1. Existing conversation summary
    if (conversation.summary) {
      parts.push(`CONVERSATION SUMMARY: ${conversation.summary.slice(0, 200)}`);
    }

    // 2. Fetch appointment status for this conversation
    const { data: tasks } = await this.supabase
      .from('wb_tasks')
      .select('title, due_date, is_completed')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (tasks && tasks.length > 0) {
      const appointmentStatus: string[] = [];
      for (const task of tasks) {
        if (!task.due_date) continue;
        const dueDate = new Date(task.due_date);
        const isPast = dueDate < now;
        const isToday = dueDate.toDateString() === now.toDateString();

        if (task.is_completed) {
          appointmentStatus.push(`COMPLETED: "${task.title}" on ${task.due_date}`);
        } else if (isPast) {
          appointmentStatus.push(`PAST (already happened): "${task.title}" was on ${task.due_date} — DO NOT offer help "before the appointment", it's already done`);
        } else if (isToday) {
          appointmentStatus.push(`TODAY: "${task.title}" is scheduled for today ${task.due_date}`);
        } else {
          appointmentStatus.push(`UPCOMING: "${task.title}" on ${task.due_date}`);
        }
      }
      if (appointmentStatus.length > 0) {
        parts.push(`APPOINTMENT STATUS:\n${appointmentStatus.join('\n')}`);
      }
    }

    // 3. Extract key facts from conversation history
    const customerMessages = historyStrings
      .filter(h => h.startsWith('customer:'))
      .map(h => h.replace('customer: ', ''));

    const aiMessages = historyStrings
      .filter(h => h.startsWith('ai:'))
      .map(h => h.replace('ai: ', ''));

    // Track what customer has already told us
    const customerFacts: string[] = [];
    for (const msg of customerMessages) {
      const lower = msg.toLowerCase();
      if (/my name is|i am|main .+ hoon/i.test(msg)) customerFacts.push(`Customer introduced themselves: "${msg}"`);
      if (/(\d+)\s*(lakh|lac|l|k)\b/i.test(msg) || /budget/i.test(msg)) customerFacts.push(`Customer mentioned budget: "${msg}"`);
      if (/interested|pasand|like|want|chahiye|dekhna/i.test(lower)) customerFacts.push(`Customer expressed interest: "${msg}"`);
      if (/location|address|kahan|where|visit/i.test(lower)) customerFacts.push(`Location was already shared`);
      if (/emi|loan|finance|installment/i.test(lower)) customerFacts.push(`Customer asked about financing/EMI`);
      if (/test.drive|appointment|book|visit|schedule/i.test(lower)) customerFacts.push(`Customer discussed booking: "${msg}"`);
      if (/photo|pic|image|dekh/i.test(lower)) customerFacts.push(`Photos were already shared`);
    }

    // Track what AI has already done (not just asked)
    const aiActions: string[] = [];
    for (const msg of aiMessages.slice(-8)) {
      if (/location|address|maps/i.test(msg)) aiActions.push(`AI already shared: location/address`);
      if (/photo|pic|image/i.test(msg)) aiActions.push(`AI already shared: product photos`);
      if (/schedule|book|confirm|appointment/i.test(msg)) aiActions.push(`AI already confirmed: appointment/booking`);
      if (/\?/.test(msg)) aiActions.push(`AI asked: "${msg.slice(0, 60)}..."`);
    }

    if (customerFacts.length > 0) {
      parts.push(`WHAT CUSTOMER ALREADY TOLD US (don't re-ask):\n${[...new Set(customerFacts)].slice(-5).map(f => f.slice(0, 80)).join('\n')}`);
    }

    if (aiActions.length > 0) {
      parts.push(`WHAT AI ALREADY DID (don't repeat):\n${[...new Set(aiActions)].slice(-4).map(a => a.slice(0, 60)).join('\n')}`);
    }

    // 4. Track products discussed — shown, liked, rejected
    const productsMentioned = new Map<string, string>(); // name → status
    for (const msg of historyStrings) {
      const lower = msg.toLowerCase();
      // Products AI showed/suggested
      if (msg.startsWith('ai:')) {
        const priceMatch = lower.match(/(\w[\w\s]+?)\s*(?:—|ka|ki|ke|is|at)\s*(?:₹|price|listed)/i);
        if (priceMatch) {
          const product = priceMatch[1].trim();
          if (product.length > 3 && product.length < 50) {
            productsMentioned.set(product, productsMentioned.get(product) || 'shown');
          }
        }
      }
      // Products customer showed interest in
      if (msg.startsWith('customer:')) {
        if (/pasand|like|achh[ai]|interested|book|test\s*drive/i.test(lower)) {
          for (const [product] of productsMentioned) {
            if (lower.includes(product.toLowerCase())) {
              productsMentioned.set(product, 'liked');
            }
          }
        }
        // Products customer rejected
        if (/nahi|no|not\s*interested|reject|don't|budget\s*se\s*bahar|mehenga/i.test(lower)) {
          for (const [product] of productsMentioned) {
            if (lower.includes(product.toLowerCase())) {
              productsMentioned.set(product, 'rejected');
            }
          }
        }
      }
    }

    if (productsMentioned.size > 0) {
      const productList = [...productsMentioned.entries()]
        .slice(0, 5)
        .map(([name, status]) => `- ${name}: ${status.toUpperCase()}`)
        .join('\n');
      parts.push(`PRODUCTS DISCUSSED:\n${productList}\nDo NOT suggest REJECTED products again.`);
    }

    // 5. Extract customer preferences from conversation
    const preferences: string[] = [];
    const fullText = customerMessages.join(' ').toLowerCase();
    if (/diesel/i.test(fullText)) preferences.push('Prefers diesel');
    if (/petrol/i.test(fullText)) preferences.push('Prefers petrol');
    if (/automatic|cvt|amt/i.test(fullText)) preferences.push('Prefers automatic');
    if (/manual/i.test(fullText)) preferences.push('Prefers manual');
    if (/suv/i.test(fullText)) preferences.push('Interested in SUV');
    if (/sedan/i.test(fullText)) preferences.push('Interested in sedan');
    if (/hatchback/i.test(fullText)) preferences.push('Interested in hatchback');
    if (/first\s*owner|single\s*owner/i.test(fullText)) preferences.push('Wants first owner');
    if (/family/i.test(fullText)) preferences.push('Needs family car');
    if (/low\s*km|less\s*driven|kam\s*chali/i.test(fullText)) preferences.push('Wants low mileage');

    if (preferences.length > 0) {
      parts.push(`CUSTOMER PREFERENCES:\n${[...new Set(preferences)].slice(0, 5).join(', ')}`);
    }

    // 6. Funnel stage and buying signal context
    if (conversation.funnel_stage && conversation.funnel_stage !== 'inquiry') {
      parts.push(`SALES STAGE: ${conversation.funnel_stage}`);
    }
    if (conversation.buying_signal_score > 0) {
      parts.push(`BUYING INTENT: ${conversation.buying_signal_score >= 0.7 ? 'HIGH — suggest next step' : conversation.buying_signal_score >= 0.4 ? 'MEDIUM' : 'LOW'}`);
    }
    if (conversation.negotiation_round > 0) {
      parts.push(`NEGOTIATION ROUND: ${conversation.negotiation_round}`);
    }

    parts.push(`CURRENT TIME: ${now.toISOString()}`);
    parts.push(`MESSAGES SO FAR: ${historyStrings.length}`);

    const result = parts.join('\n\n');
    return result.length > 2000 ? result.slice(0, 2000) + '\n[Memory truncated]' : result;
  }

  /** Infer last discussed product from recent customer/AI messages in the same conversation. */
  private async inferProductFromRecentContext(userId: string, historyStrings: string[]): Promise<string | undefined> {
    const { data: items } = await this.supabase
      .from('wb_catalog_items')
      .select('item_name')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(200);

    if (!items || items.length === 0) return undefined;

    const haystack = historyStrings.slice(-12).reverse().join('\n').toLowerCase();
    const names = items
      .map((i: any) => (i.item_name || '').toString().trim())
      .filter((n: string) => n.length > 0)
      .sort((a: string, b: string) => b.length - a.length);

    for (const name of names) {
      if (haystack.includes(name.toLowerCase())) {
        return name;
      }
    }

    // Fuzzy fallback: match significant tokens like "swift", "thar", "city"
    const ranked = names
      .map((name: string) => {
        const tokens = name
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t: string) => t.length >= 4 && !['model', 'edition'].includes(t));
        const tokenHits = tokens.filter((t: string) => haystack.includes(t)).length;
        return { name, tokenHits, tokenCount: tokens.length };
      })
      .filter((x: { tokenHits: number }) => x.tokenHits > 0)
      .sort((a: { tokenHits: number; tokenCount: number }, b: { tokenHits: number; tokenCount: number }) => {
        if (b.tokenHits !== a.tokenHits) return b.tokenHits - a.tokenHits;
        return b.tokenCount - a.tokenCount;
      });

    if (ranked.length > 0) {
      return ranked[0].name;
    }

    return undefined;
  }

  /** Collect image URLs from both canonical images[] and attribute columns (e.g., image_url_1). */
  private extractImageUrls(item: any): string[] {
    const urls: string[] = [];

    const imageList = Array.isArray(item?.images) ? item.images : [];
    const canonicalUrls = imageList
      .filter((img: any) => typeof img?.url === 'string' && URL_REGEX.test(img.url))
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
      .map((img: any) => img.url);

    urls.push(...canonicalUrls);

    const attrs = item?.attributes && typeof item.attributes === 'object' ? item.attributes : {};
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value !== 'string') continue;
      if (!URL_REGEX.test(value)) continue;
      if (!/(image|img|photo|pic)/i.test(key)) continue;
      urls.push(value);
    }

    return Array.from(new Set(urls));
  }

  /** Remove URLs from text when media has already been sent as attachments. */
  private stripUrls(text: string, fallbackText = 'Photos sent. Agar aur close-up chahiye ho to bataiye ji.'): string {
    const withoutUrls = text
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return withoutUrls || fallbackText;
  }

  /** Build negotiation response using known budget + known model to avoid repeating same question. */
  private buildNegotiationReply(
    messageText: string,
    language: string,
    product?: string,
    offeredBudget?: number,
    referenceItem?: any,
    domain?: BaseDomain
  ): string {
    const d = domain || getDomain(null);
    const useHinglish = language.startsWith('hi') || d.patterns.hinglishHint.test(messageText);
    const listedPrice = typeof referenceItem?.price === 'number' ? referenceItem.price : undefined;
    const cfg = this.getNegotiationConfig(referenceItem, d);

    const budgetText = offeredBudget ? this.formatInrCompact(offeredBudget) : '';
    const priceText = listedPrice ? this.formatInrCompact(listedPrice) : '';
    const floorText = cfg.floorPrice ? this.formatInrCompact(cfg.floorPrice) : '';

    if (useHinglish) {
      if (!product) {
        return offeredBudget
          ? `Ji, budget ${budgetText} note kar liya hai. Aap kaunsa model finalize karna chahenge?`
          : 'Ji bilkul, main best deal nikalwa deta hoon. Aapka target budget kitna rahega?';
      }

      if (!offeredBudget) {
        return `Ji, ${product} ke liye best possible deal nikalwa deta hoon. Aapka target budget kitna rahega?`;
      }

      if (!listedPrice) {
        return `Ji, ${product} ke liye ${budgetText} budget note kar liya. Main owner se check karke aapko best final bata deta hoon.`;
      }

      const gap = listedPrice - offeredBudget;
      if (gap <= 0) {
        return `Ji, ${budgetText} workable lag raha hai for ${product}. Main turant final approval leke aapko confirm karta hoon.`;
      }

      if (cfg.floorPrice && offeredBudget >= cfg.floorPrice) {
        return `Ji, ${product} ke liye ${budgetText} workable hai. Main is price pe approval process karke aapko final confirm karta hoon.`;
      }

      if (cfg.floorPrice && offeredBudget < cfg.floorPrice) {
        return `Ji, ${product} ka listed ${priceText} hai. Main best koshish ke baad minimum ${floorText} tak laa sakta hoon. Agar aapko theek lage to isi pe close kar dete hain?`;
      }

      const tentative = Math.max(offeredBudget, Math.round((listedPrice * 0.96) / 10000) * 10000);
      const tentativeText = this.formatInrCompact(tentative);
      return `Ji, ${product} ka listed ${priceText} hai, aur aapka ${budgetText} close hai. Main around ${tentativeText} tak laane ki try karta hoon. Agar theek lage to aage badhayein?`;
    }

    if (!product) {
      return offeredBudget
        ? `Noted your budget at ${budgetText}. Which model would you like me to check this for?`
        : 'Sure, I can work out the best possible deal. What budget are you targeting?';
    }

    if (!offeredBudget) {
      return `Sure, I can check the best possible deal for ${product}. What budget are you targeting?`;
    }

    if (!listedPrice) {
      return `Noted ${budgetText} for ${product}. I will check internally and share the best final price with you.`;
    }

    const gap = listedPrice - offeredBudget;
    if (gap <= 0) {
      return `${budgetText} looks workable for ${product}. I will get a quick internal approval and confirm right away.`;
    }

    if (cfg.floorPrice && offeredBudget >= cfg.floorPrice) {
      return `${budgetText} works for ${product}. I can proceed at this figure and get a quick final confirmation for you.`;
    }

    if (cfg.floorPrice && offeredBudget < cfg.floorPrice) {
      return `${product} is listed at ${priceText}. The best I can do is ${floorText}. If that works, I can close this for you right now.`;
    }

    const tentative = Math.max(offeredBudget, Math.round((listedPrice * 0.96) / 10000) * 10000);
    const tentativeText = this.formatInrCompact(tentative);
    return `${product} is listed at ${priceText}, and your ${budgetText} is close. I can try to bring it near ${tentativeText}. Should I proceed to confirm this for you?`;
  }

  /** Derive per-product negotiation constraints from attributes. */
  private getNegotiationConfig(item?: any, domain?: BaseDomain): { maxDiscountPercent: number; floorPrice?: number } {
    const d = domain || getDomain(null);
    const listedPrice = typeof item?.price === 'number' ? item.price : undefined;
    const attrs = item?.attributes && typeof item.attributes === 'object' ? item.attributes : {};

    const percent = this.pickNumber(attrs, d.negotiationConfig.discountPercentAttributeKeys);

    const maxDiscountPercent = Math.min(
      d.negotiationConfig.maxDiscountPercentCap,
      Math.max(0, percent ?? d.negotiationConfig.defaultDiscountPercent)
    );

    const minPriceAttr = this.pickNumber(attrs, d.negotiationConfig.floorPriceAttributeKeys);

    const floorByPercent = listedPrice ? Math.round(listedPrice * (1 - maxDiscountPercent / 100)) : undefined;
    const floorPrice =
      minPriceAttr !== undefined && floorByPercent !== undefined
        ? Math.max(minPriceAttr, floorByPercent)
        : (minPriceAttr ?? floorByPercent);

    return { maxDiscountPercent, floorPrice };
  }

  private pickNumber(source: Record<string, any>, keys: string[]): number | undefined {
    for (const key of keys) {
      if (!(key in source)) continue;
      const raw = source[key];
      const num = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
      if (Number.isFinite(num)) return num;
    }
    return undefined;
  }

  /** Build short respectful photo-reply that avoids re-asking selected product. */
  private buildPhotoReply(language: string, product?: string, mediaSent = false, domain?: BaseDomain): string {
    const d = domain || getDomain(null);
    const useHinglish = language.startsWith('hi');
    const lang = useHinglish ? 'hi' : 'en';

    if (mediaSent && product) return d.photoTemplates.sentWithProduct[lang].replace('{product}', product);
    if (mediaSent) return d.photoTemplates.sentGeneric[lang];
    if (product) return d.photoTemplates.pendingWithProduct[lang].replace('{product}', product);
    return d.photoTemplates.pendingGeneric[lang];
  }

  /** Extract INR budget from free text (supports lakh/crore and plain numbers). */
  private extractBudgetInr(text: string): number | undefined {
    const normalized = text.toLowerCase().replace(/,/g, '').trim();

    const lakhMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l)/i);
    if (lakhMatch) {
      return Math.round(parseFloat(lakhMatch[1]) * 100000);
    }

    const croreMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(crore|cr)/i);
    if (croreMatch) {
      return Math.round(parseFloat(croreMatch[1]) * 10000000);
    }

    const plain = normalized.match(/\b(\d{5,8})\b/);
    if (plain) {
      return parseInt(plain[1], 10);
    }

    return undefined;
  }

  /** Find latest customer-provided budget in recent chat history. */
  private findLatestCustomerBudget(historyStrings: string[]): number | undefined {
    for (const line of [...historyStrings].reverse()) {
      if (!line.toLowerCase().startsWith('customer:')) continue;
      const budget = this.extractBudgetInr(line.replace(/^customer:\s*/i, ''));
      if (budget) return budget;
    }
    return undefined;
  }

  private formatInrCompact(value: number): string {
    if (value >= 10000000) {
      return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
    }
    if (value >= 100000) {
      return `₹${(value / 100000).toFixed(1).replace(/\.0$/, '')} lakh`;
    }
    return `₹${value}`;
  }

  /**
   * Upsert a unified `customers` row for the WhatsApp sender.
   * Returns the customer.id, or null on failure.
   */
  private async upsertCustomerFromWhatsApp(
    userId: string,
    customerJid: string,
    customerName: string,
    customerPhone: string,
  ): Promise<string | null> {
    const phoneOrJid = customerPhone || customerJid;
    if (!phoneOrJid) return null;

    const { data: existing } = await this.supabase
      .from('customers')
      .select('id, full_name')
      .eq('user_id', userId)
      .eq('primary_phone', phoneOrJid)
      .maybeSingle();

    if (existing) {
      const updates: any = { last_activity_at: new Date().toISOString() };
      if (customerName && !existing.full_name) updates.full_name = customerName;
      await this.supabase.from('customers').update(updates).eq('id', existing.id);
      return existing.id;
    }

    const { data: created, error } = await this.supabase
      .from('customers')
      .insert({
        user_id: userId,
        full_name: customerName || 'Unknown',
        primary_phone: phoneOrJid,
        first_seen_via: 'whatsapp',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Pipeline] Failed to upsert customer:', error.message);
      return null;
    }
    return created.id;
  }
}

// Singleton with service role client
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
export const pipelineService = new PipelineService(supabase);
