import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const manuscriptId = searchParams.get('manuscriptId');

    if (!manuscriptId) {
      return NextResponse.json({ matches: [] });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ matches: [] }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('manuscript_journal_matches')
      .select('*')
      .eq('manuscript_id', manuscriptId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ matches: data ?? [] });
  } catch {
    return NextResponse.json({ matches: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      manuscriptId?: unknown;
      matches?: Array<{
        journalId?: unknown;
        journalName?: unknown;
        score?: unknown;
        reasons?: unknown;
        gaps?: unknown;
      }>;
    };

    if (typeof body.manuscriptId !== 'string' || !body.manuscriptId.trim()) {
      return NextResponse.json({ error: 'A manuscript ID is required.' }, { status: 400 });
    }

    if (!Array.isArray(body.matches)) {
      return NextResponse.json({ error: 'Matches must be an array.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Please sign in to save journal matches.' }, { status: 401 });
    }

    const manuscriptExists = await supabase
      .from('manuscripts')
      .select('id')
      .eq('id', body.manuscriptId)
      .eq('user_id', user.id)
      .single();

    if (manuscriptExists.error || !manuscriptExists.data) {
      return NextResponse.json({ error: 'This manuscript does not belong to the current user.' }, { status: 403 });
    }

    const existingRows = await supabase
      .from('manuscript_journal_matches')
      .delete()
      .eq('manuscript_id', body.manuscriptId);

    if (existingRows.error) throw existingRows.error;

    const rowsToInsert: Array<{ manuscript_id: string; journal_id: string; fit_score: number; gaps: unknown[]; fixed_gap_ids: string[]; formatting_reviewed: boolean; verification_complete: boolean }> = [];

    for (const match of body.matches) {
      const journalIdValue = typeof match.journalId === 'string' ? match.journalId : '';
      const journalNameValue = typeof match.journalName === 'string' ? match.journalName : '';
      const scoreValue = Number(match.score ?? 0);

      let journalId = '';

      if (journalIdValue) {
        const { data: journalByRecordId } = await supabase
          .from('journals')
          .select('id')
          .eq('source_record_id', journalIdValue)
          .maybeSingle();

        if (journalByRecordId) {
          journalId = journalByRecordId.id;
        }
      }

      if (!journalId && journalNameValue) {
        const { data: journalByName } = await supabase
          .from('journals')
          .select('id')
          .ilike('name', journalNameValue)
          .limit(1)
          .maybeSingle();

        if (journalByName) {
          journalId = journalByName.id;
        }
      }

      if (!journalId) continue;

      const gapList = Array.isArray(match.gaps)
        ? match.gaps.map((gap) => typeof gap === 'string' ? gap : gap && typeof gap === 'object' ? { ...(gap as Record<string, unknown>) } : gap)
        : [];

      rowsToInsert.push({
        manuscript_id: body.manuscriptId,
        journal_id: journalId,
        fit_score: Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, scoreValue)) : 0,
        gaps: gapList,
        fixed_gap_ids: [],
        formatting_reviewed: false,
        verification_complete: false,
      });
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json({ saved: 0, message: 'No matching journal records were available to save.' });
    }

    const { error: insertError } = await supabase
      .from('manuscript_journal_matches')
      .insert(rowsToInsert);

    if (insertError) throw insertError;

    return NextResponse.json({ saved: rowsToInsert.length });
  } catch {
    return NextResponse.json({ error: 'Unable to save matching results.' }, { status: 500 });
  }
}
