const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase configuration.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

(async () => {
  try {
    const { data, error } = await supabase.from('estimate_builder').select('*');
    if (error) {
      console.error('Error querying estimate_builder:', error);
    } else {
      console.log('Data from estimate_builder:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
})();