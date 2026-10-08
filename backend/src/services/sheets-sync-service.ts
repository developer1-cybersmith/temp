import { JWT } from 'google-auth-library';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js';

const HEADERS = [
  'Item Name', 'Category', 'Price', 'Quantity', 'Brand',
  'Fuel Type', 'Transmission', 'Color', 'Year', 'Ownership',
  'Kilometers', 'Status',
];

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsSyncService {

  private async getAccessToken(): Promise<string> {
    if (!config.GOOGLE_SA_EMAIL || !config.GOOGLE_SA_KEY) {
      throw new Error('Google Sheets credentials not configured');
    }
    const auth = new JWT({
      email: config.GOOGLE_SA_EMAIL,
      key: config.GOOGLE_SA_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const token = await auth.authorize();
    return token.access_token as string;
  }

  private async sheetsGet(range: string): Promise<string[][]> {
    const token = await this.getAccessToken();
    const url = `${SHEETS_API}/${config.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Sheets API GET failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    return data.values || [];
  }

  private async sheetsUpdate(range: string, values: string[][]): Promise<void> {
    const token = await this.getAccessToken();
    const url = `${SHEETS_API}/${config.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    if (!res.ok) throw new Error(`Sheets API PUT failed: ${res.status} ${await res.text()}`);
  }

  private async sheetsClear(range: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `${SHEETS_API}/${config.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}:clear`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Sheets API CLEAR failed: ${res.status} ${await res.text()}`);
  }

  async exportToSheet(supabase: SupabaseClient, userId: string): Promise<number> {
    const sheetName = config.GOOGLE_SHEET_NAME || 'Sheet1';

    // Paginate to fetch ALL items — Supabase default limit can be as low as 32
    const allItems: any[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('wb_catalog_items')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw new Error(`DB fetch failed: ${error.message}`);
      if (!page || page.length === 0) break;
      allItems.push(...page);
      if (page.length < PAGE_SIZE) break;   // last page
      offset += PAGE_SIZE;
    }

    if (allItems.length === 0) throw new Error('No inventory items to export');

    console.log('[Sheets] Exporting', allItems.length, 'items for user', userId.slice(0, 8));

    const rows: string[][] = [HEADERS];
    for (const item of allItems) {
      const attrs = item.attributes || {};
      rows.push([
        item.item_name || '',
        item.category || '',
        String(item.price || ''),
        String(item.quantity ?? 1),
        attrs.brand || attrs.make || '',
        attrs.fuel_type || attrs['fuel type'] || '',
        attrs.transmission || '',
        attrs.color || '',
        attrs.year || '',
        attrs.ownership || '',
        attrs.km_driven || attrs.kilometers_driven || '',
        item.quantity > 0 ? 'Available' : 'Sold',
      ]);
    }

    // Clear enough rows to cover existing data + new data (header + items + buffer)
    const clearEndRow = Math.max(1000, rows.length + 100);
    await this.sheetsClear(`${sheetName}!A1:Z${clearEndRow}`);
    await this.sheetsUpdate(`${sheetName}!A1`, rows);

    console.log(`[Sheets] Exported ${allItems.length} items to Google Sheet`);
    return allItems.length;
  }

  async importFromSheet(supabase: SupabaseClient, userId: string): Promise<{ added: number; updated: number }> {
    const sheetName = config.GOOGLE_SHEET_NAME || 'Sheet1';
    // Read up to 10000 rows — Google Sheets API returns only populated rows
    const values = await this.sheetsGet(`${sheetName}!A1:Z10000`);

    if (!values || values.length < 2) {
      return { added: 0, updated: 0 };
    }

    const headers = values[0].map(h => h.trim().toLowerCase());
    const rows = values.slice(1);

    let added = 0;
    let updated = 0;

    for (const row of rows) {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });

      const itemName = obj['item name'] || obj['item_name'] || obj['name'] || '';
      if (!itemName) continue;

      // Skip rows that look auto-generated or placeholder
      const nameLower = itemName.toLowerCase();
      if (/^(item|example|test|sample|row)\s*\d*$/i.test(itemName) ||
          nameLower === 'n/a' || nameLower === 'na' || nameLower === '-' || nameLower === 'none') {
        continue;
      }

      const price = parseFloat((obj['price'] || '0').replace(/[₹,]/g, ''));
      const quantity = parseInt(obj['quantity'] || '1') || 1;
      const category = obj['category'] || '';

      const attributes: Record<string, string> = {};
      if (obj['brand']) attributes.brand = obj['brand'];
      if (obj['fuel type'] || obj['fuel_type']) attributes.fuel_type = obj['fuel type'] || obj['fuel_type'];
      if (obj['transmission']) attributes.transmission = obj['transmission'];
      if (obj['color']) attributes.color = obj['color'];
      if (obj['year']) attributes.year = obj['year'];
      if (obj['ownership']) attributes.ownership = obj['ownership'];
      if (obj['kilometers'] || obj['km_driven']) attributes.km_driven = obj['kilometers'] || obj['km_driven'];

      // Check if item exists (include inactive items to avoid re-adding deleted ones)
      // First try exact match, then fall back to case-insensitive exact match
      let { data: existingList, error: lookupErr } = await supabase
        .from('wb_catalog_items')
        .select('id, is_active')
        .eq('user_id', userId)
        .eq('item_name', itemName)
        .limit(1);

      if (lookupErr) {
        console.error(`[Sheets] Lookup error for "${itemName}":`, lookupErr.message);
      }

      // If exact match found nothing, try case-insensitive (no wildcards = exact ilike)
      if (!existingList || existingList.length === 0) {
        const fallback = await supabase
          .from('wb_catalog_items')
          .select('id, is_active')
          .eq('user_id', userId)
          .ilike('item_name', itemName)
          .limit(1);
        if (fallback.error) {
          console.error(`[Sheets] Case-insensitive lookup error for "${itemName}":`, fallback.error.message);
        }
        existingList = fallback.data;
      }

      const existing = existingList?.[0] || null;
      console.log('[Sheets] Processing:', itemName, 'found:', existing?.id || 'NEW');

      if (existing) {
        if (!existing.is_active) {
          // Item was deleted from dashboard — skip it, don't re-add
          console.log(`[Sheets] Skipping inactive item: "${itemName}" (id: ${existing.id})`);
          continue;
        }
        const { error: updateErr } = await supabase
          .from('wb_catalog_items')
          .update({ category, price: price || null, quantity, attributes })
          .eq('id', existing.id);
        if (updateErr) {
          console.error(`[Sheets] Update failed for "${itemName}" (id: ${existing.id}):`, updateErr.message);
          continue;
        }
        updated++;
      } else {
        const { error: insertErr } = await supabase
          .from('wb_catalog_items')
          .insert({
            user_id: userId,
            item_name: itemName,
            category,
            price: price || null,
            quantity,
            attributes,
            is_active: true,
          });
        if (insertErr) {
          console.error(`[Sheets] Insert failed for "${itemName}":`, insertErr.message);
          continue;
        }
        added++;
      }
    }

    console.log(`[Sheets] Import complete: ${added} added, ${updated} updated`);
    return { added, updated };
  }

  async syncBidirectional(supabase: SupabaseClient, userId: string) {
    // 1. FIRST import from Sheet → DB (picks up user's edits in the sheet)
    const importResult = await this.importFromSheet(supabase, userId);
    // 2. THEN export DB → Sheet (syncs back any dashboard-only items, removes deleted)
    const exportCount = await this.exportToSheet(supabase, userId);
    return {
      message: `Sync complete! Imported: ${importResult.added} new, ${importResult.updated} updated. Exported ${exportCount} items to Sheet.`,
      ...importResult,
      exported: exportCount,
    };
  }
}
