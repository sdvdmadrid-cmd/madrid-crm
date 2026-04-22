import { supabase } from '@/lib/supabase';

// Handler for Bill Payments API
export async function POST(req) {
  const { user_id, provider_name, account_number, amount_due, due_date } = await req.json();

  const { data, error } = await supabase
    .from('bills')
    .insert({
      user_id,
      provider_name,
      account_number,
      amount_due,
      due_date,
    });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify(data), { status: 201 });
}

export async function GET(req) {
  const user_id = req.headers.get('user_id');

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('user_id', user_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify(data), { status: 200 });
}