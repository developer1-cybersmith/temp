import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const customerRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  // GET /api/customers — list with filters
  server.get('/', async (request, reply) => {
    try {
      const { hotness, status, source, search } = request.query as {
        hotness?: string;
        status?: string;
        source?: string;
        search?: string;
      };

      let query = server.supabase
        .from('customers')
        .select('*')
        .eq('user_id', request.userId)
        .order('last_activity_at', { ascending: false });

      if (hotness) query = query.eq('hotness', hotness);
      if (status) query = query.eq('status', status);
      if (source) query = query.eq('first_seen_via', source);
      if (search) {
        const safe = search.replace(/[%,]/g, '');
        query = query.or(`full_name.ilike.%${safe}%,primary_phone.ilike.%${safe}%`);
      }

      const { data, error } = await query.limit(200);
      if (error) {
        console.error('GET /customers error:', error);
        return reply.status(500).send({ error: 'Failed to fetch customers' });
      }
      return reply.send({ customers: data || [] });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // GET /api/customers/:id — single customer with related data
  server.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const { data: customer, error } = await server.supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .eq('user_id', request.userId)
        .single();

      if (error || !customer) {
        return reply.status(404).send({ error: 'Customer not found' });
      }

      const { data: visits } = await server.supabase
        .from('customer_visits')
        .select('*')
        .eq('customer_id', id)
        .order('visited_at', { ascending: false });

      const { data: conversation } = await server.supabase
        .from('wb_conversations')
        .select('id, customer_jid, last_message_at, summary')
        .eq('customer_id', id)
        .maybeSingle();

      const { data: lead } = await server.supabase
        .from('wb_leads')
        .select('score, stage, intent, summary, notes')
        .eq('customer_id', id)
        .maybeSingle();

      return reply.send({
        customer,
        visits: visits || [],
        conversation,
        lead,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // POST /api/customers — create with phone-based dedup
  server.post('/', async (request, reply) => {
    const body = request.body as {
      full_name?: string;
      primary_phone?: string;
      alt_phone?: string;
      email?: string;
      first_seen_via?: string;
      tags?: string[];
      internal_notes?: string;
    };

    if (!body.full_name && !body.primary_phone) {
      return reply.status(400).send({ error: 'Name or phone required' });
    }

    try {
      if (body.primary_phone) {
        const { data: existing } = await server.supabase
          .from('customers')
          .select('*')
          .eq('user_id', request.userId)
          .eq('primary_phone', body.primary_phone)
          .maybeSingle();

        if (existing) {
          const updates: any = { last_activity_at: new Date().toISOString() };
          if (body.full_name && !existing.full_name) updates.full_name = body.full_name;
          if (body.email && !existing.email) updates.email = body.email;
          if (body.alt_phone && !existing.alt_phone) updates.alt_phone = body.alt_phone;

          const { data: merged } = await server.supabase
            .from('customers')
            .update(updates)
            .eq('id', existing.id)
            .select()
            .single();

          return reply.send({ customer: merged, merged: true });
        }
      }

      const { data, error } = await server.supabase
        .from('customers')
        .insert({
          user_id: request.userId,
          full_name: body.full_name,
          primary_phone: body.primary_phone,
          alt_phone: body.alt_phone,
          email: body.email,
          first_seen_via: body.first_seen_via || 'walk_in',
          tags: body.tags || [],
          internal_notes: body.internal_notes,
        })
        .select()
        .single();

      if (error) {
        console.error('POST /customers error:', error);
        return reply.status(500).send({ error: 'Failed to create customer' });
      }
      return reply.send({ customer: data, merged: false });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // PATCH /api/customers/:id
  server.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Record<string, any>;

    const allowed = [
      'full_name', 'primary_phone', 'alt_phone', 'email',
      'hotness', 'status', 'tags', 'internal_notes',
      'predicted_close_days', 'lifetime_value', 'custom_fields',
    ];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    try {
      const { data, error } = await server.supabase
        .from('customers')
        .update(safeUpdates)
        .eq('id', id)
        .eq('user_id', request.userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') return reply.status(404).send({ error: 'Customer not found' });
        return reply.status(500).send({ error: 'Failed to update customer' });
      }
      return reply.send({ customer: data });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // DELETE /api/customers/:id
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const { error } = await server.supabase
        .from('customers')
        .delete()
        .eq('id', id)
        .eq('user_id', request.userId);

      if (error) return reply.status(500).send({ error: 'Failed to delete customer' });
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
};
