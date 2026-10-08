import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const visitRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  // GET /api/visits
  server.get('/', async (request, reply) => {
    const { customer_id, from, to } = request.query as {
      customer_id?: string;
      from?: string;
      to?: string;
    };

    try {
      let query = server.supabase
        .from('customer_visits')
        .select('*, customers(full_name, primary_phone, hotness)')
        .eq('user_id', request.userId)
        .order('visited_at', { ascending: false });

      if (customer_id) query = query.eq('customer_id', customer_id);
      if (from) query = query.gte('visited_at', from);
      if (to) query = query.lte('visited_at', to);

      const { data, error } = await query.limit(200);
      if (error) {
        console.error('GET /visits error:', error);
        return reply.status(500).send({ error: 'Failed to fetch visits' });
      }
      return reply.send({ visits: data || [] });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // POST /api/visits — log a walk-in; auto-create or link customer by phone
  server.post('/', async (request, reply) => {
    const body = request.body as {
      customer_id?: string;
      customer_name?: string;
      customer_phone?: string;
      visited_at?: string;
      duration_minutes?: number;
      staff_name?: string;
      items_shown?: string[];
      trial_taken?: boolean;
      trial_item_id?: string;
      quoted_amount?: number;
      outcome?: string;
      next_action?: string;
      follow_up_at?: string;
      manual_notes?: string;
      ai_summary?: string;
    };

    try {
      let customerId = body.customer_id;

      if (!customerId) {
        if (!body.customer_name && !body.customer_phone) {
          return reply.status(400).send({
            error: 'Either customer_id or (customer_name or customer_phone) required',
          });
        }

        if (body.customer_phone) {
          const { data: existing } = await server.supabase
            .from('customers')
            .select('id')
            .eq('user_id', request.userId)
            .eq('primary_phone', body.customer_phone)
            .maybeSingle();
          if (existing) customerId = existing.id;
        }

        if (!customerId) {
          const { data: created, error: createErr } = await server.supabase
            .from('customers')
            .insert({
              user_id: request.userId,
              full_name: body.customer_name,
              primary_phone: body.customer_phone,
              first_seen_via: 'walk_in',
            })
            .select('id')
            .single();
          if (createErr || !created) {
            console.error('POST /visits create-customer error:', createErr);
            return reply.status(500).send({ error: 'Failed to create customer for visit' });
          }
          customerId = created.id;
        }
      }

      const { data: visit, error } = await server.supabase
        .from('customer_visits')
        .insert({
          user_id: request.userId,
          customer_id: customerId,
          visited_at: body.visited_at || new Date().toISOString(),
          duration_minutes: body.duration_minutes,
          staff_name: body.staff_name,
          items_shown: (body.items_shown || []).map(String),
          trial_taken: body.trial_taken || false,
          trial_item_id: body.trial_item_id,
          quoted_amount: body.quoted_amount,
          outcome: body.outcome || 'interested',
          next_action: body.next_action,
          follow_up_at: body.follow_up_at,
          manual_notes: body.manual_notes,
          ai_summary: body.ai_summary,
        })
        .select()
        .single();

      if (error) {
        console.error('POST /visits error:', error);
        return reply.status(500).send({ error: 'Failed to create visit' });
      }

      // Update customer: hotness from outcome, tags merged from items, backfill name
      const outcomeHotness: Record<string, string> = {
        interested: 'hot', purchased: 'hot',
        will_decide: 'warm', follow_up: 'warm',
        not_interested: 'cold',
      };
      const custUpdates: Record<string, any> = { last_activity_at: new Date().toISOString() };
      if (body.outcome && outcomeHotness[body.outcome]) {
        custUpdates.hotness = outcomeHotness[body.outcome];
      }
      const needsFetch = (body.items_shown?.length ?? 0) > 0 || !!body.customer_name;
      if (needsFetch) {
        const { data: cust } = await server.supabase
          .from('customers').select('tags, full_name').eq('id', customerId).maybeSingle();
        if (body.items_shown?.length) {
          custUpdates.tags = Array.from(new Set([...(cust?.tags ?? []), ...body.items_shown]));
        }
        if (body.customer_name && !cust?.full_name) {
          custUpdates.full_name = body.customer_name;
        }
      }
      await server.supabase.from('customers').update(custUpdates).eq('id', customerId);

      return reply.send({ visit });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // PATCH /api/visits/:id
  server.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Record<string, any>;

    const allowed = [
      'visited_at', 'duration_minutes', 'staff_name',
      'items_shown', 'trial_taken', 'trial_item_id',
      'quoted_amount', 'outcome', 'next_action',
      'follow_up_at', 'manual_notes', 'ai_summary', 'custom_data',
    ];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    try {
      const { data, error } = await server.supabase
        .from('customer_visits')
        .update(safeUpdates)
        .eq('id', id)
        .eq('user_id', request.userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') return reply.status(404).send({ error: 'Visit not found' });
        return reply.status(500).send({ error: 'Failed to update visit' });
      }
      return reply.send({ visit: data });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // DELETE /api/visits/:id
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const { error } = await server.supabase
        .from('customer_visits')
        .delete()
        .eq('id', id)
        .eq('user_id', request.userId);

      if (error) return reply.status(500).send({ error: 'Failed to delete visit' });
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
};
