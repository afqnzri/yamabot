/**
 * Cloudflare Pages Function - Native Serverless API Route with Cloudflare D1
 * Automatically executed on Cloudflare Pages when deployed!
 */

interface Env {
  DB: any; // Cloudflare D1 Database binding
  TELEGRAM_BOT_TOKEN?: string;
  RAPIDAPI_KEY?: string;
}

export const onRequest = async (context: { request: any; env: Env; next?: () => Promise<any> }) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fallback if D1 database is not yet bound
  if (!env.DB) {
    if (path.startsWith('/api/db/stats')) {
      return new Response(JSON.stringify({
        databaseType: 'Cloudflare D1 (Pending Binding)',
        hotelCount: 0,
        roomTypesCount: 0,
        competitorHotelsCount: 0,
        mappedRoomsCount: 0,
        extractionRunsCount: 0,
        schedulerLogsCount: 0,
        activeHotel: null,
        note: 'Please bind your D1 database in wrangler.toml or Cloudflare Pages Dashboard Settings -> Functions -> D1 database bindings'
      }), { headers: corsHeaders });
    }
  }

  try {
    // 1. GET /api/db/stats
    if (path === '/api/db/stats' && method === 'GET') {
      const hotelRes = await env.DB.prepare('SELECT count(*) as c FROM hotels').first();
      const roomsRes = await env.DB.prepare('SELECT count(*) as c FROM hotel_rooms').first();
      const compRes = await env.DB.prepare('SELECT count(*) as c FROM competitor_hotels').first();
      const mappedRes = await env.DB.prepare('SELECT count(*) as c FROM competitor_room_mappings').first();
      const runsRes = await env.DB.prepare('SELECT count(*) as c FROM extraction_runs').first();
      const logsRes = await env.DB.prepare('SELECT count(*) as c FROM scheduler_logs').first();
      const activeHotelRow = await env.DB.prepare('SELECT name FROM hotels ORDER BY updated_at DESC LIMIT 1').first();

      return new Response(JSON.stringify({
        databaseType: 'Cloudflare D1 (Serverless SQLite)',
        hotelCount: hotelRes?.c || 0,
        roomTypesCount: roomsRes?.c || 0,
        competitorHotelsCount: compRes?.c || 0,
        mappedRoomsCount: mappedRes?.c || 0,
        extractionRunsCount: runsRes?.c || 0,
        schedulerLogsCount: logsRes?.c || 0,
        activeHotel: activeHotelRow?.name || null
      }), { headers: corsHeaders });
    }

    // 2. GET /api/db/setup
    if (path === '/api/db/setup' && method === 'GET') {
      const hotelRow = await env.DB.prepare('SELECT * FROM hotels ORDER BY updated_at DESC LIMIT 1').first();
      if (!hotelRow) {
        return new Response(JSON.stringify({ setup: null }), { headers: corsHeaders });
      }

      const activeHotelId = hotelRow.id;
      const hotelRooms = await env.DB.prepare('SELECT room_type, room_name, min_rate, max_rate FROM hotel_rooms WHERE hotel_id = ?').bind(activeHotelId).all();
      const competitorHotels = await env.DB.prepare('SELECT competitor_hotel_search, competitor_hotel_id, competitor_hotel_name, address, city, review_score, url FROM competitor_hotels WHERE hotel_id = ?').bind(activeHotelId).all();
      const mappedRooms = await env.DB.prepare('SELECT competitor_hotel_id, competitor_hotel_name, competitor_room_id, competitor_room_name, gross_amount, our_room_type FROM competitor_room_mappings WHERE hotel_id = ?').bind(activeHotelId).all();

      return new Response(JSON.stringify({
        setup: {
          hotelId: activeHotelId,
          hotelName: hotelRow.name,
          hotelRooms: hotelRooms.results || [],
          competitorHotels: competitorHotels.results || [],
          mappedRooms: mappedRooms.results || []
        }
      }), { headers: corsHeaders });
    }

    // 3. POST /api/db/setup
    if (path === '/api/db/setup' && method === 'POST') {
      const data = await request.json();
      const hotelId = data.hotelId || 'hotel_' + Date.now();
      const hotelName = data.hotelName || 'My Hotel';

      const batchStatements = [
        env.DB.prepare(`
          INSERT INTO hotels (id, name, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
        `).bind(hotelId, hotelName),
        env.DB.prepare('DELETE FROM hotel_rooms WHERE hotel_id = ?').bind(hotelId),
        env.DB.prepare('DELETE FROM competitor_hotels WHERE hotel_id = ?').bind(hotelId),
        env.DB.prepare('DELETE FROM competitor_room_mappings WHERE hotel_id = ?').bind(hotelId)
      ];

      for (const r of data.hotelRooms || []) {
        batchStatements.push(
          env.DB.prepare(`
            INSERT INTO hotel_rooms (id, hotel_id, room_type, room_name, min_rate, max_rate)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind('hr_' + Math.random().toString(36).slice(2, 9), hotelId, r.room_type, r.room_name, r.min_rate, r.max_rate)
        );
      }

      for (const c of data.competitorHotels || []) {
        batchStatements.push(
          env.DB.prepare(`
            INSERT INTO competitor_hotels (id, hotel_id, competitor_hotel_search, competitor_hotel_id, competitor_hotel_name, address, city, review_score, url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            'comp_' + Math.random().toString(36).slice(2, 9),
            hotelId,
            c.competitor_hotel_search || '',
            c.competitor_hotel_id,
            c.competitor_hotel_name,
            c.address || '',
            c.city || '',
            String(c.review_score || ''),
            c.url || ''
          )
        );
      }

      for (const m of data.mappedRooms || []) {
        const grossNum = typeof m.gross_amount === 'number' ? m.gross_amount : parseFloat(String(m.gross_amount || 0)) || null;
        batchStatements.push(
          env.DB.prepare(`
            INSERT INTO competitor_room_mappings (id, hotel_id, competitor_hotel_id, competitor_hotel_name, competitor_room_id, competitor_room_name, gross_amount, our_room_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            'crm_' + Math.random().toString(36).slice(2, 9),
            hotelId,
            m.competitor_hotel_id,
            m.competitor_hotel_name,
            m.competitor_room_id,
            m.competitor_room_name,
            grossNum,
            m.our_room_type || 'UNMAPPED'
          )
        );
      }

      await env.DB.batch(batchStatements);
      return new Response(JSON.stringify({ success: true, hotelId }), { headers: corsHeaders });
    }

    // 4. DELETE /api/db/setup
    if (path === '/api/db/setup' && method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM price_reports'),
        env.DB.prepare('DELETE FROM extraction_runs'),
        env.DB.prepare('DELETE FROM competitor_room_mappings'),
        env.DB.prepare('DELETE FROM competitor_hotels'),
        env.DB.prepare('DELETE FROM hotel_rooms'),
        env.DB.prepare('DELETE FROM hotels')
      ]);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 5. GET /api/db/runs
    if (path === '/api/db/runs' && method === 'GET') {
      const runs = await env.DB.prepare('SELECT * FROM extraction_runs ORDER BY created_at DESC LIMIT 30').all();
      return new Response(JSON.stringify({ runs: runs.results || [] }), { headers: corsHeaders });
    }

    // 6. POST /api/db/runs
    if (path === '/api/db/runs' && method === 'POST') {
      const data = await request.json();
      const runId = 'run_' + Date.now();
      const effectiveHotelId = data.hotelId || 'hotel_default';

      const totalQuotes = (data.priceReport || []).reduce((acc: number, row: any) => acc + (row.valid_quotes || 0), 0);
      const competitiveCount = (data.priceReport || []).filter((r: any) => r.status === 'competitive').length;
      const underpricedCount = (data.priceReport || []).filter((r: any) => r.status === 'underpriced').length;
      const premiumCount = (data.priceReport || []).filter((r: any) => r.status === 'premium').length;

      const batchStatements = [
        env.DB.prepare('INSERT INTO hotels (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name').bind(effectiveHotelId, data.hotelName || 'My Hotel'),
        env.DB.prepare(`
          INSERT INTO extraction_runs (
            id, hotel_id, hotel_name, run_date, arrival_date, departure_date, output_filename,
            total_quotes, competitive_count, underpriced_count, premium_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          runId,
          effectiveHotelId,
          data.hotelName,
          data.runDate,
          data.arrivalDate,
          data.departureDate,
          data.outputWorkbookName,
          totalQuotes,
          competitiveCount,
          underpricedCount,
          premiumCount
        )
      ];

      for (const row of data.priceReport || []) {
        batchStatements.push(
          env.DB.prepare(`
            INSERT INTO price_reports (
              id, run_id, our_room_type, our_min_rate, our_max_rate,
              lowest_competitor_price, average_competitor_price, valid_quotes,
              status, recommendation, competitor_breakdown_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            'pr_' + Math.random().toString(36).slice(2, 9),
            runId,
            row.our_room_type,
            row.our_min_rate,
            row.our_max_rate,
            row.lowest_competitor_price === 'N/A' ? null : row.lowest_competitor_price,
            row.average_competitor_price === 'N/A' ? null : row.average_competitor_price,
            row.valid_quotes,
            row.status,
            row.recommendation,
            JSON.stringify(row.competitor_breakdown || [])
          )
        );
      }

      await env.DB.batch(batchStatements);
      return new Response(JSON.stringify({ success: true, runId }), { headers: corsHeaders });
    }

    // 7. GET /api/db/runs/:id
    if (path.startsWith('/api/db/runs/') && method === 'GET') {
      const runId = path.replace('/api/db/runs/', '');
      const run = await env.DB.prepare('SELECT * FROM extraction_runs WHERE id = ?').bind(runId).first();
      if (!run) {
        return new Response(JSON.stringify({ error: 'Run not found' }), { status: 404, headers: corsHeaders });
      }

      const rawReports = await env.DB.prepare('SELECT * FROM price_reports WHERE run_id = ?').bind(runId).all();
      const reports = (rawReports.results || []).map((r: any) => ({
        our_room_type: r.our_room_type,
        our_min_rate: r.our_min_rate,
        our_max_rate: r.our_max_rate,
        lowest_competitor_price: r.lowest_competitor_price !== null ? r.lowest_competitor_price : 'N/A',
        average_competitor_price: r.average_competitor_price !== null ? r.average_competitor_price : 'N/A',
        valid_quotes: r.valid_quotes,
        status: r.status,
        recommendation: r.recommendation,
        competitor_breakdown: r.competitor_breakdown_json ? JSON.parse(r.competitor_breakdown_json) : []
      }));

      return new Response(JSON.stringify({ run, reports }), { headers: corsHeaders });
    }

    // Default 404
    return new Response(JSON.stringify({ error: 'API route not found' }), { status: 404, headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
};
