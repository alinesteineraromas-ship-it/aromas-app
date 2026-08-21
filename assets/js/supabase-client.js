// Conexão com o banco Supabase — não precisa mexer aqui
const SUPABASE_URL = "https://uxhlsinruqblldddbuhb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aGxzaW5ydXFibGxkZGRidWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NjE5MTgsImV4cCI6MjEwMjAzNzkxOH0.1dWKq4y5qfMYPqr60iSnYLq3SBXgC1q8kxl6sXVapsw";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
