import { FastifyInstance, FastifyPluginAsync } from 'fastify';

type OwnerBusinessRow = {
  id: string;
  business_name: string | null;
  industry: string | null;
  created_at: string;
};

type OwnerSessionRow = {
  user_id: string;
  status: string | null;
  connected_at: string | null;
  created_at: string | null;
};

type OwnerConversationRow = {
  id: string;
  user_id: string;
  last_message_at: string | null;
  created_at: string | null;
};

type OwnerCallRow = {
  user_id: string;
  started_at: string | null;
  created_at: string | null;
};

type OwnerMessageRow = {
  conversation_id: string;
};

type OwnerUserRow = {
  user_id: string;
};

type OwnerBusinessOverview = OwnerBusinessRow & {
  connected_sessions: number;
  disconnected_sessions: number;
  total_conversations: number;
  total_messages: number;
  total_leads: number;
  total_tasks: number;
  total_voice_calls: number;
  last_activity_at: string | null;
  setup_complete: boolean;
};

const pickLatest = (current: string | null, candidate: string | null) => {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
};

export const ownerRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.get('/overview', async (request, reply) => {
    if (!request.isOwner) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const overview = {
      total_businesses: 0,
      active_businesses: 0,
      connected_devices: 0,
      disconnected_devices: 0,
      total_conversations: 0,
      total_messages: 0,
      total_leads: 0,
      total_tasks: 0,
      total_voice_calls: 0,
      businesses_added_today: 0,
      businesses: [] as OwnerBusinessOverview[],
    };

    const [usersRes, sessionsRes, conversationsRes, messagesRes, leadsRes, tasksRes, voiceCallsRes] = await Promise.all([
      server.supabase.from('wb_users').select('id,business_name,industry,created_at').order('created_at', { ascending: false }),
      server.supabase.from('wb_sessions').select('user_id,status,connected_at,created_at'),
      server.supabase.from('wb_conversations').select('id,user_id,last_message_at,created_at'),
      server.supabase.from('wb_messages').select('conversation_id'),
      server.supabase.from('wb_leads').select('user_id'),
      server.supabase.from('wb_tasks').select('user_id'),
      server.supabase.from('wb_calls').select('user_id,started_at,created_at'),
    ]);

    if (usersRes.error) {
      return reply.status(500).send({ error: 'Failed to load owner overview' });
    }

    if (sessionsRes.error) server.log.warn({ error: sessionsRes.error.message }, 'Owner overview sessions query failed');
    if (conversationsRes.error) server.log.warn({ error: conversationsRes.error.message }, 'Owner overview conversations query failed');
    if (messagesRes.error) server.log.warn({ error: messagesRes.error.message }, 'Owner overview messages query failed');
    if (leadsRes.error) server.log.warn({ error: leadsRes.error.message }, 'Owner overview leads query failed');
    if (tasksRes.error) server.log.warn({ error: tasksRes.error.message }, 'Owner overview tasks query failed');
    if (voiceCallsRes.error) server.log.warn({ error: voiceCallsRes.error.message }, 'Owner overview voice calls query failed');

    const sessions = (sessionsRes.data || []) as OwnerSessionRow[];
    const conversations = (conversationsRes.data || []) as OwnerConversationRow[];
    const messages = (messagesRes.data || []) as OwnerMessageRow[];
    const leads = (leadsRes.data || []) as OwnerUserRow[];
    const tasks = (tasksRes.data || []) as OwnerUserRow[];
    const voiceCalls = (voiceCallsRes.data || []) as OwnerCallRow[];
    const users = (usersRes.data || []) as OwnerBusinessRow[];

    const activeUserIds = new Set<string>();
    sessions.forEach((session) => {
      if (session.status === 'connected') activeUserIds.add(session.user_id);
    });

    overview.total_businesses = users.length;
    overview.active_businesses = activeUserIds.size;
    overview.connected_devices = sessions.filter((session) => session.status === 'connected').length;
    overview.disconnected_devices = sessions.filter((session) => session.status !== 'connected').length;
    overview.total_conversations = conversations.length;
    overview.total_messages = messages.length;
    overview.total_leads = leads.length;
    overview.total_tasks = tasks.length;
    overview.total_voice_calls = voiceCalls.length;
    overview.businesses_added_today = (usersRes.data || []).filter((user) => {
      const createdAt = new Date(user.created_at);
      const today = new Date();
      createdAt.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      return createdAt.getTime() === today.getTime();
    }).length;

    const sessionMap = new Map<string, { connected_sessions: number; disconnected_sessions: number; last_session_at: string | null }>();
    sessions.forEach((session) => {
      const current = sessionMap.get(session.user_id) || { connected_sessions: 0, disconnected_sessions: 0, last_session_at: null };
      if (session.status === 'connected') {
        current.connected_sessions += 1;
      } else {
        current.disconnected_sessions += 1;
      }
      current.last_session_at = pickLatest(current.last_session_at, session.connected_at || session.created_at || null);
      sessionMap.set(session.user_id, current);
    });

    const conversationUserMap = new Map<string, string>();
    const conversationCountMap = new Map<string, number>();
    const messageCountMap = new Map<string, number>();
    const activityMap = new Map<string, string | null>();

    conversations.forEach((conversation) => {
      conversationUserMap.set(conversation.id, conversation.user_id);
      conversationCountMap.set(conversation.user_id, (conversationCountMap.get(conversation.user_id) || 0) + 1);
      activityMap.set(conversation.user_id, pickLatest(activityMap.get(conversation.user_id) || null, conversation.last_message_at || conversation.created_at || null));
    });

    messages.forEach((message) => {
      const ownerId = conversationUserMap.get(message.conversation_id);
      if (!ownerId) return;
      messageCountMap.set(ownerId, (messageCountMap.get(ownerId) || 0) + 1);
    });

    const leadCountMap = new Map<string, number>();
    leads.forEach((lead) => {
      leadCountMap.set(lead.user_id, (leadCountMap.get(lead.user_id) || 0) + 1);
    });

    const taskCountMap = new Map<string, number>();
    tasks.forEach((task) => {
      taskCountMap.set(task.user_id, (taskCountMap.get(task.user_id) || 0) + 1);
    });

    const voiceCallCountMap = new Map<string, number>();
    voiceCalls.forEach((call) => {
      voiceCallCountMap.set(call.user_id, (voiceCallCountMap.get(call.user_id) || 0) + 1);
      activityMap.set(call.user_id, pickLatest(activityMap.get(call.user_id) || null, call.started_at || call.created_at || null));
    });

    overview.businesses = users.map((user) => {
      const sessionInfo = sessionMap.get(user.id) || { connected_sessions: 0, disconnected_sessions: 0, last_session_at: null };
      const lastActivityAt = pickLatest(sessionInfo.last_session_at, activityMap.get(user.id) || null);
      return {
        id: user.id,
        business_name: user.business_name,
        industry: user.industry,
        created_at: user.created_at,
        connected_sessions: sessionInfo.connected_sessions,
        disconnected_sessions: sessionInfo.disconnected_sessions,
        total_conversations: conversationCountMap.get(user.id) || 0,
        total_messages: messageCountMap.get(user.id) || 0,
        total_leads: leadCountMap.get(user.id) || 0,
        total_tasks: taskCountMap.get(user.id) || 0,
        total_voice_calls: voiceCallCountMap.get(user.id) || 0,
        last_activity_at: lastActivityAt,
        setup_complete: Boolean(user.business_name && user.industry),
      };
    });

    return reply.send({ overview });
  });
};