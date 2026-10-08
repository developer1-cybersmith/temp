import cron from 'node-cron';
import { SupabaseClient } from '@supabase/supabase-js';
import { cloudClient } from './whatsapp-cloud-client.js';
import { SheetsSyncService } from './sheets-sync-service.js';

/**
 * CronService — handles automated SaaS operations.
 * 1. Daily Sales Report (9:00 PM)
 * 2. Proactive Follow-ups for stale leads
 */
export class CronService {
  constructor(private supabase: SupabaseClient) {}

  init(): void {
    // 1. Daily Sales Report at 9:00 PM (21:00)
    cron.schedule('0 21 * * *', () => {
      this.sendDailyReports().catch(err => console.error('[Cron] Daily reports failed:', err.message));
    });

    // 2. Stale Lead Follow-up check every 6 hours
    cron.schedule('0 */6 * * *', () => {
      this.processFollowUps().catch(err => console.error('[Cron] Follow-ups failed:', err.message));
    });

    // 3. Google Sheets auto-sync every 2 minutes
    cron.schedule('*/2 * * * *', () => {
      this.autoSyncSheets().catch(err => console.error('[Cron] Sheets sync failed:', err.message));
    });

    console.log('📅 Cron Service Initialized (Daily Reports, Follow-ups & Sheets Sync)');
  }

  /** Auto-sync inventory with Google Sheets (only for the primary user) */
  private async autoSyncSheets(): Promise<void> {
    try {
      const sheetsSync = new SheetsSyncService();
      // Only sync the first user who has a business_name set (primary business owner)
      const { data: users } = await this.supabase
        .from('wb_users')
        .select('id')
        .not('business_name', 'is', null)
        .not('business_name', 'eq', '')
        .limit(1);
      if (!users?.length) return;

      const user = users[0];
      try {
        await sheetsSync.syncBidirectional(this.supabase, user.id);
      } catch (err: any) {
        if (err.message?.includes('not configured')) return;
        console.error(`[Cron] Sheets sync failed for ${user.id.slice(0, 8)}:`, err.message);
      }
    } catch (err: any) {
      console.error('[Cron] Sheets auto-sync error:', err.message);
    }
  }

  /** Send a summary to every business owner */
  private async sendDailyReports(): Promise<void> {
    const { data: users } = await this.supabase.from('wb_users').select('*');
    if (!users) return;

    for (const user of users) {
      const { data: leads } = await this.supabase
        .from('wb_leads')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const { data: tasks } = await this.supabase
        .from('wb_tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_completed', false);

      const highPriority = leads?.filter(l => l.score === 'high').length || 0;
      const totalLeads = leads?.length || 0;
      const pendingTasks = tasks?.length || 0;

      const report = `📊 *Daily Sales Summary*\n\n` +
        `Today you got *${totalLeads}* new leads.\n` +
        `🔥 *${highPriority}* are high priority!\n` +
        `✅ You have *${pendingTasks}* pending tasks.\n\n` +
        `Check your dashboard: ${process.env.FRONTEND_URL || 'http://localhost:3003'}`;

      // Look up the owner's WhatsApp number from their Cloud API account
      const { data: waba } = await this.supabase
        .from('wb_waba_accounts')
        .select('display_phone_number')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (waba?.display_phone_number) {
        const jid = `${waba.display_phone_number.replace(/\D/g, '')}@s.whatsapp.net`;
        await cloudClient.sendMessage(user.id, jid, report);
        console.log(`📈 [Cron] Sent daily report to ${user.id.slice(0, 8)}`);
      }
    }
  }

  /** Nudge leads stuck in "new" or "contacted" stages after 48h */
  private async processFollowUps(): Promise<void> {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    const { data: staleLeads } = await this.supabase
      .from('wb_leads')
      .select('*, wb_conversations(*)')
      .in('stage', ['new', 'contacted'])
      .lt('updated_at', fortyEightHoursAgo);

    if (!staleLeads) return;

    for (const lead of staleLeads) {
      const convo = lead.wb_conversations;
      if (!convo || convo.ai_paused) continue;

      const nudge = `Hi ${lead.customer_name}! Just checking in to see if you had any other questions or if there's anything else I can help with? 😊`;
      
      const sent = await cloudClient.sendMessage(lead.user_id, convo.customer_jid, nudge);
      if (sent) {
        await this.supabase.from('wb_leads').update({ stage: 'followed_up' }).eq('id', lead.id);
        console.log(`🔔 [Cron] Sent follow-up nudge to ${lead.customer_name}`);
      }
    }
  }
}
